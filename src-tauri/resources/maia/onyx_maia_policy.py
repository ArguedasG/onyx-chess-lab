"""Onyx launcher for Maia 3 that also reports the move policy.

Runs the same UCI engine as the `maia3-*` launchers and, before every `bestmove`, prints

    info string onyx-policy v1 <uci>:<probability> <uci>:<probability> ...

with the probability Maia gives each legal move (temperature 1, no top-p), most likely first.
Standard UCI clients ignore `info string`, so the engine stays usable as a normal Maia.

Usage: python -I onyx_maia_policy.py --onyx-preset maia3-5m [maia3 options]

Maia 3 is AGPL-3.0; this file only wraps it and is distributed under the same license.
"""

import sys

import torch
from maia3 import presets, uci

POLICY_PREFIX = "info string onyx-policy v1"
# Moves below this probability are left out, except the most likely one.
MIN_PROBABILITY = 1e-4

_captured = {}
_original_sample = uci.sample_from_logits
_original_score_moves = uci.Maia3UCIEngine.score_moves
_original_print_bestmove = uci.Maia3UCIEngine.print_bestmove


def _sample_and_capture(logits, temperature, top_p):
    # `score_moves` passes the logits already masked to the legal moves.
    _captured["logits"] = logits.detach().clone()
    return _original_sample(logits, temperature, top_p)


def _format_policy(engine, logits):
    probs = torch.softmax(logits.float(), dim=-1)
    entries = []
    for idx in torch.nonzero(torch.isfinite(logits)).flatten().tolist():
        move = engine._move_from_index(idx)
        if move is not None:
            entries.append((float(probs[idx]), move.uci()))
    entries.sort(reverse=True)
    kept = [entry for rank, entry in enumerate(entries) if rank == 0 or entry[0] >= MIN_PROBABILITY]
    return " ".join(f"{move}:{prob:.5f}" for prob, move in kept)


def _score_moves_with_policy(self):
    _captured.pop("logits", None)
    result = _original_score_moves(self)
    logits = _captured.pop("logits", None)
    self._onyx_policy = _format_policy(self, logits) if logits is not None else None
    return result


def _print_bestmove_with_policy(self, move):
    policy = getattr(self, "_onyx_policy", None)
    self._onyx_policy = None
    if policy:
        print(f"{POLICY_PREFIX} {policy}", flush=True)
    _original_print_bestmove(self, move)


uci.sample_from_logits = _sample_and_capture
uci.Maia3UCIEngine.score_moves = _score_moves_with_policy
uci.Maia3UCIEngine.print_bestmove = _print_bestmove_with_policy


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] != "--onyx-preset" or args[1] not in presets._LAUNCHER_NAMES:
        sys.exit("usage: onyx_maia_policy.py --onyx-preset <maia3 launcher> [maia3 options]")
    preset = args[1]
    # The presets read their options from sys.argv, as the `maia3-*` launchers do.
    sys.argv = [preset, *args[2:]]
    presets._run_preset(preset)


if __name__ == "__main__":
    main()
