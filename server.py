from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import mimetypes
import os
import socket

mimetypes.add_type('application/octet-stream', '.dll')
mimetypes.add_type('application/wasm', '.wasm')

PORT = 8080
ROOT = os.path.dirname(os.path.abspath(__file__))

# Mirrors GitHub Pages, not a general-purpose dev server:
#   - no COOP/COEP/CORP (GitHub Pages doesn't send these — if something here
#     needs cross-origin isolation, it should fail locally too, not just on deploy)
#   - Access-Control-Allow-Origin: * and ~10min caching, matching GH Pages' actual headers
#   - unresolved paths and directories without an index.html serve 404.html, no directory listing
#   - request path casing must exactly match the file on disk (GH Pages is case-sensitive;
#     NTFS is not, so this catches case-typo links before they break in production)
class GitHubPagesRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'max-age=600')
        SimpleHTTPRequestHandler.end_headers(self)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            indexes = [os.path.join(path, 'index.html'), os.path.join(path, 'index.htm')]
            for index in indexes:
                if os.path.exists(index):
                    if not self._case_matches(index):
                        return self._serve_404()
                    break
            else:
                return self._serve_404()
        elif not os.path.exists(path) or not self._case_matches(path):
            return self._serve_404()
        return SimpleHTTPRequestHandler.send_head(self)

    def _case_matches(self, path):
        rel = os.path.relpath(path, ROOT)
        if rel == '.' or rel.startswith('..'):
            return True
        current = ROOT
        for part in rel.split(os.sep):
            try:
                entries = os.listdir(current)
            except OSError:
                return False
            if part not in entries:
                return False
            current = os.path.join(current, part)
        return True

    def list_directory(self, path):
        return self._serve_404()

    def _serve_404(self):
        notfound = os.path.join(ROOT, '404.html')
        self.send_response(404)
        if os.path.exists(notfound):
            with open(notfound, 'rb') as f:
                body = f.read()
        else:
            body = b'<h1>404 Not Found</h1>'
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return None

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

if __name__ == '__main__':
    ip = lan_ip()
    print('Serving Chosevn:')
    print('  This PC:    http://localhost:' + str(PORT))
    print('  Same WiFi:  http://' + ip + ':' + str(PORT) + '   (open this one on your phone)')
    ThreadingHTTPServer(('0.0.0.0', PORT), GitHubPagesRequestHandler).serve_forever()
