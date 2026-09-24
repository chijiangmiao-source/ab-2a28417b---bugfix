#!/usr/bin/env python3
# 本地等价于 nginx.conf 的静态托管：/healthz 返回 ok，其余路径按文件存在返回，缺失回退 index.html。
# 仅用于本环境无 Docker 时对 compose web 发布行为的等价 HTTP 验收。
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")
ROOT = os.path.normpath(ROOT)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        rel = path.lstrip("/")
        candidate = os.path.normpath(os.path.join(ROOT, rel))
        if not (candidate == ROOT or candidate.startswith(ROOT + os.sep)) or not os.path.isfile(candidate):
            candidate = os.path.join(ROOT, "index.html")  # SPA 回退
        try:
            with open(candidate, "rb") as f:
                body = f.read()
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        ctype = "text/html" if candidate.endswith(".html") else "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.environ.get("WEB_PORT", "8080"))
    print(f"serving {ROOT} on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
