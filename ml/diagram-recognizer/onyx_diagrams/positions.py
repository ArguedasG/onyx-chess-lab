"""Positions for the synthetic dataset, taken from the Lichess puzzle database (CC0).

Most positions are puzzles as they are or after the first move. A few are thinned out (endgame
studies) or built from the starting position (opening diagrams), which puzzles rarely cover.
"""

import sqlite3

import chess
import numpy as np


def _thin(board: chess.Board, rng: np.random.Generator) -> None:
    squares = [s for s, p in board.piece_map().items() if p.piece_type != chess.KING]
    keep = int(rng.integers(1, 7))
    for s in rng.permutation(squares)[keep:]:
        board.remove_piece_at(int(s))


def _opening(rng: np.random.Generator) -> chess.Board:
    board = chess.Board()
    for _ in range(int(rng.integers(2, 21))):
        moves = list(board.legal_moves)
        if not moves:
            break
        board.push(moves[int(rng.integers(len(moves)))])
    return board


def sample_positions(db_path: str, count: int, seed: int) -> list[str]:
    """Returns `count` piece placements (first FEN field), deterministic for a given seed and DB."""
    rng = np.random.default_rng(seed)
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    max_id = con.execute("select max(id) from puzzles").fetchone()[0]
    ids = rng.choice(np.arange(1, max_id + 1), size=count, replace=False)
    rows: dict[int, tuple[str, str]] = {}
    for chunk in np.array_split(ids, max(1, count // 900)):
        q = ",".join(str(int(i)) for i in chunk)
        for pid, fen, moves in con.execute(f"select id, fen, moves from puzzles where id in ({q})"):
            rows[pid] = (fen, moves)
    con.close()

    out = []
    for pid in ids:
        kind = rng.random()
        if kind < 0.07 or int(pid) not in rows:
            board = _opening(rng)
        else:
            fen, moves = rows[int(pid)]
            board = chess.Board(fen)
            if moves and rng.random() < 0.5:
                board.push_uci(moves.split()[0])
            if kind > 0.92:
                _thin(board, rng)
        out.append(board.board_fen())
    return out


def placement_grid(board_fen: str) -> list[str]:
    """64 symbols ('.' or a piece letter), rank 8 to rank 1, file a to h."""
    grid = []
    for rank in board_fen.split("/"):
        for ch in rank:
            grid.extend("." * int(ch) if ch.isdigit() else ch)
    assert len(grid) == 64, board_fen
    return grid
