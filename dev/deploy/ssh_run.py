"""SSH 命令执行助手：凭据从环境变量读取，不落盘。

用法：
  SSH_HOST=... SSH_USER=... SSH_PASS=... python ssh_run.py "command"
"""
import os
import sys

import paramiko


def main() -> int:
    host = os.environ["SSH_HOST"]
    port = int(os.environ.get("SSH_PORT", "22"))
    user = os.environ.get("SSH_USER", "root")
    password = os.environ["SSH_PASS"]
    command = sys.argv[1]
    timeout = int(os.environ.get("SSH_TIMEOUT", "120"))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=port,
        username=user,
        password=password,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    try:
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        if out:
            sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        return code
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
