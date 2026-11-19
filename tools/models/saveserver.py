# Serves a folder and saves PUT /save/<name> bodies into an output folder.
import http.server, os, sys
root, out, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
    def do_PUT(self):
        name = os.path.basename(self.path.split('/save/', 1)[-1])
        data = self.rfile.read(int(self.headers['Content-Length']))
        open(os.path.join(out, name), 'wb').write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
