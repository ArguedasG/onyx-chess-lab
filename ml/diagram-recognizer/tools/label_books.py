"""Labeling tool for the private evaluation set (the author's books).

Serves a page on 127.0.0.1 only: each extracted diagram next to the board the model read, to
confirm it or fix it square by square. Labels are what is printed, in display order (top-left
first, as the crop is seen), so the orientation of the diagram does not matter. They are saved
after every answer to `private-eval/labels.json`; nothing leaves the PC.

Order: first up to 10 diagrams of every book, taken in turns (a balanced sample wherever the
labeling stops), then the rest of the books the model reads worst, then everything else.

Usage: python tools/label_books.py [--results private-eval/report-v8/results.json] [--port 8765]
       [--skip McDonald Lakdawala]  (leave out books whose name contains any of these words)
Then open http://127.0.0.1:8765 and press Ctrl+C here when done.
"""

import argparse
import json
import os
import tempfile
import threading
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
SYMBOLS = set("PNBRQKpnbrqk.")
STATUSES = {"ok", "fixed", "not_diagram", "skip"}
FIRST_PASS = 10


def order_items(results: dict, skip: list[str] = ()) -> list[dict]:
    """Balanced first pass over all books, then the worst-read books, then the rest."""
    boards = results["boards"]
    summary = results["summary"]
    skip = [word.lower() for word in skip]
    items_by_book = {book: list(entries) for book, entries in boards.items() if not any(w in book.lower() for w in skip)}
    first, rest = [], []
    for round_index in range(FIRST_PASS):
        for book in sorted(items_by_book):
            entries = items_by_book[book]
            if round_index < len(entries):
                first.append((book, entries[round_index]))
    for book, entries in items_by_book.items():
        rest.extend((book, entry) for entry in entries[FIRST_PASS:])
    # Books with the most boards to review first: that is where adapting to a book would help.
    rest.sort(key=lambda pair: -summary[pair[0]]["review"] / max(1, summary[pair[0]]["n"]))
    ordered = []
    for phase, pairs in (("sample", first), ("rest", rest)):
        for book, entry in pairs:
            ordered.append(
                {
                    "file": entry["file"],
                    "book": book,
                    "page": entry.get("page"),
                    "phase": phase,
                    "labels": entry.get("labels"),
                    "status": entry.get("status", "review"),
                    "reason": entry.get("reason", "") or ("no grid" if "labels" not in entry else ""),
                    "doubtful": entry.get("doubtful"),
                }
            )
    return ordered


class Store:
    """labels.json, rewritten atomically after every answer."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.data = {"version": 1, "labels": {}}
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))

    def save(self, file: str, status: str, placement: str | None, model: str | None) -> None:
        with self.lock:
            self.data["labels"][file] = {
                "status": status,
                "placement": placement,
                "model": model,
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(self.data, handle, ensure_ascii=False, indent=1)
            os.replace(tmp, self.path)


def make_handler(items: list[dict], store: Store, books: Path, pieces: Path):
    known = {item["file"]: item for item in items}
    page = (Path(__file__).with_name("label_books.html")).read_text(encoding="utf-8")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:  # quiet console
            pass

        def send(self, body: bytes, kind: str, status: HTTPStatus = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def send_file(self, base: Path, relative: str) -> None:
            path = (base / relative).resolve()
            if base.resolve() not in path.parents or not path.is_file() or path.suffix != ".png":
                self.send(b"not found", "text/plain", HTTPStatus.NOT_FOUND)
                return
            self.send(path.read_bytes(), "image/png")

        def do_GET(self) -> None:
            route = unquote(self.path.split("?", 1)[0])
            if route == "/":
                self.send(page.encode("utf-8"), "text/html; charset=utf-8")
            elif route == "/api/items":
                body = {"items": items, "labels": store.data["labels"]}
                self.send(json.dumps(body).encode("utf-8"), "application/json")
            elif route.startswith("/img/"):
                self.send_file(books, route[len("/img/") :])
            elif route.startswith("/piece/"):
                self.send_file(pieces, route[len("/piece/") :])
            else:
                self.send(b"not found", "text/plain", HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if self.path != "/api/label":
                self.send(b"not found", "text/plain", HTTPStatus.NOT_FOUND)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length))
                file, status, placement = body["file"], body["status"], body.get("placement")
                if file not in known or status not in STATUSES:
                    raise ValueError("unknown diagram or status")
                if status in ("ok", "fixed"):
                    if not isinstance(placement, str) or len(placement) != 64 or set(placement) - SYMBOLS:
                        raise ValueError("placement must be 64 symbols")
                else:
                    placement = None
                store.save(file, status, placement, known[file]["labels"])
            except (KeyError, ValueError, json.JSONDecodeError) as error:
                self.send(str(error).encode("utf-8"), "text/plain", HTTPStatus.BAD_REQUEST)
                return
            self.send(b"{}", "application/json")

    return Handler


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--results", default="private-eval/report-v8/results.json")
    p.add_argument("--books", default="private-eval/books")
    p.add_argument("--labels", default="private-eval/labels.json")
    p.add_argument("--pieces", default="data/pieces/cburnett")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--skip", nargs="*", default=[], help="leave out books whose name contains any of these words")
    a = p.parse_args()

    resolve = lambda value: Path(value) if Path(value).is_absolute() else ROOT / value  # noqa: E731
    results = json.loads(resolve(a.results).read_text(encoding="utf-8"))
    items = order_items(results, a.skip)
    store = Store(resolve(a.labels))
    handler = make_handler(items, store, resolve(a.books), resolve(a.pieces))
    server = ThreadingHTTPServer(("127.0.0.1", a.port), handler)
    url = f"http://127.0.0.1:{a.port}"
    done = len(store.data["labels"])
    print(f"{len(items)} diagrams, {done} already labeled. Open {url} (Ctrl+C to stop).", flush=True)
    if not a.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print(f"Saved to {store.path} ({len(store.data['labels'])} labeled).")


if __name__ == "__main__":
    main()
