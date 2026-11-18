"""通过 SSH stdin 流式上传 tar.gz 并在远端解压（不依赖 SFTP 子系统）。

用法：
  SSH_HOST=... SSH_USER=... SSH_PASS=... python upload_extract.py <local.tar.gz> <remote-dir>
"""
import os
import sys

import paramiko


def main() -> int:
    local, remote_dir = sys.argv[1], sys.argv[2]
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
        command = f"mkdir -p {remote_dir} && tar -xzf - -C {remote_dir} && echo UPLOAD_OK"
        stdin, stdout, stderr = client.exec_command(command, timeout=180)
        with open(local, "rb") as handle:
            while True:
                chunk = handle.read(65536)
                if not chunk:
                    break
                stdin.write(chunk)
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        return code
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
