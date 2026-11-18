"""base64 分块上传 tar.gz 并远端解压（避开 stdin 大流缓冲问题）。

用法：
  SSH_HOST=... SSH_USER=... SSH_PASS=... python upload_b64.py <local.tar.gz> <remote-dir>
"""
import base64
import os
import sys

import paramiko

CHUNK = 48000  # base64 字符/块，远低于 ARG_MAX


def run(client, command, timeout=120):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"remote command failed ({code}): {command[:80]}\n{err}")
    return out


def main() -> int:
    local, remote_dir = sys.argv[1], sys.argv[2]
    with open(local, "rb") as handle:
        payload = base64.b64encode(handle.read()).decode("ascii")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=os.environ["SSH_HOST"],
        port=int(os.environ.get("SSH_PORT", "22")),
        username=os.environ.get("SSH_USER", "root"),
        password=os.environ["SSH_PASS"],
        timeout=20,
    )
    try:
        remote_b64 = "/tmp/shishuo-payload.b64"
        run(client, f": > {remote_b64}")
        total = (len(payload) + CHUNK - 1) // CHUNK
        for index in range(total):
            chunk = payload[index * CHUNK : (index + 1) * CHUNK]
            run(client, f"printf '%s' '{chunk}' >> {remote_b64}")
            print(f"chunk {index + 1}/{total}", flush=True)
        out = run(
            client,
            f"mkdir -p {remote_dir} && base64 -d {remote_b64} | tar -xzf - -C {remote_dir} "
            f"&& rm -f {remote_b64} && echo EXTRACT_OK && ls {remote_dir}",
            timeout=180,
        )
        sys.stdout.write(out)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
