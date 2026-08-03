from http.server import HTTPServer, SimpleHTTPRequestHandler
import mimetypes
import socket

mimetypes.add_type('application/octet-stream', '.dll')
mimetypes.add_type('application/wasm', '.wasm')

PORT = 8080

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'public, max-age=3600')
        SimpleHTTPRequestHandler.end_headers(self)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

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
    HTTPServer(('0.0.0.0', PORT), CORSRequestHandler).serve_forever()
