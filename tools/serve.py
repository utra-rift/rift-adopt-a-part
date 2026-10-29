"""Dev server for site/: like `python -m http.server`, but tells the browser to revalidate
every file, so rebuilt parts and edited scripts show up on a normal reload."""
import functools
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # The page fetches dozens of parts at once; the default backlog of 5 resets connections.
    request_queue_size = 128


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
handler = functools.partial(NoCache, directory=sys.argv[2] if len(sys.argv) > 2 else "site")
Server(("", port), handler).serve_forever()
