"""Dev server for site/: like `python -m http.server`, but tells the browser to revalidate
every file, so rebuilt parts and edited scripts show up on a normal reload."""
import functools
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
handler = functools.partial(NoCache, directory=sys.argv[2] if len(sys.argv) > 2 else "site")
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
