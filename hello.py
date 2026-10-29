"""Serve the Arcade Rooms browser app on this computer and open it."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

PORT = 8765


def main() -> None:
    app_folder = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(app_folder))
    server = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    address, port = server.server_address
    url = f"http://{address}:{port}/index.html"
    print(f"Arcade Rooms is running at {url}")
    print("Keep this window open while you play. Press Ctrl+C to stop the server.")
    threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArcade Rooms stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
