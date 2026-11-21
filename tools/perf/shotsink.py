# Saves images PUT to http://127.0.0.1:8732/<name>.jpg into the shots folder (look screenshots).
import http.server, os, re, sys
OUT = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_PUT(self):
        name = os.path.basename(self.path)
        if not re.fullmatch(r'[\w.-]+\.(jpg|png)', name):
            self.send_response(400); self.cors(); self.end_headers(); return
        data = self.rfile.read(int(self.headers['Content-Length']))
        with open(os.path.join(OUT, name), 'wb') as f: f.write(data)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')
http.server.HTTPServer(('127.0.0.1', 8732), H).serve_forever()
