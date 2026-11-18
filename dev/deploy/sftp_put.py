"""SFTP 上传助手：凭据从环境变量读取。

用法：
  SSH_HOST=... SSH_USER=... SSH_PASS=... python sftp_put.py <local> <remote>
"""
import os
import sys

import paramiko


def main() -> int:
    local, remote = sys.argv[1], sys.argv[2]
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
        sftp = client.open_sftp()
        sftp.put(local, remote)
        size = sftp.stat(remote).st_size
        print(f"uploaded {remote} ({size} bytes)")
        sftp.close()
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
