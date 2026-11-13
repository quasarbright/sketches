"""Reference outputs from Mike's original Python, for game.test.mjs.

Run from this folder with a checkout of quasarbright/2048 (numpy needed):
    python3 make_reference.py /path/to/quasarbright-2048 > reference.json

Everything here calls the original modules unchanged. Two things are patched from outside:
  - game.random (the module's Random instance) is seeded first, so the fresh game seeds are
    reproducible;
  - minimax.max is shadowed to record the value of each root move (chooseAction calls
    max(actions, key=valueOfAction)), and minimax.random.shuffle is a no-op where a run needs
    the root order fixed (UP, DOWN, LEFT, RIGHT), so ties go the same way in both ports.
"""
import json
import sys
import builtins
import random as pyrandom

sys.path.insert(0, sys.argv[1])
import game as G  # noqa: E402
import minimax  # noqa: E402
from aiGame import AIGame  # noqa: E402

DIRS = G.directions


def board_list(g):
    return [int(v) for v in g.board.flatten()]


recorded = []


def recording_max(*args, **kwargs):
    key = kwargs.get("key")
    if key is not None and len(args) == 1:
        actions = list(args[0])
        recorded.append({a: key(a) for a in actions})
        return builtins.max(actions, key=key)
    return builtins.max(*args, **kwargs)


minimax.max = recording_max


def fresh(k):
    G.random.seed(k)
    return G.Game()


out = {}

# 1. opening boards from a fresh seed
out["openings"] = []
for k in range(40):
    g = fresh(1000 + k)
    out["openings"].append({"seed": g.seed, "board": board_list(g)})

# 2. random-move playouts: every move's board and seed (rules + spawns)
chooser = pyrandom.Random(7)
out["playouts"] = []
for k in range(12):
    g = fresh(2000 + k)
    start = {"seed": g.seed, "board": board_list(g)}
    steps = []
    while not g.isDead() and len(steps) < 400:
        d = chooser.choice(DIRS)
        g.move(d)
        steps.append({"dir": d, "board": board_list(g), "seed": g.seed})
    out["playouts"].append({"start": start, "steps": steps, "dead": bool(g.isDead())})

# 3. scores of boards seen in the playouts (and whether each is dead)
out["scores"] = []
for p in out["playouts"]:
    for s in p["steps"][::9]:
        g = G.Game(board=G.np.array(s["board"]).reshape(4, 4))
        out["scores"].append({"board": s["board"], "score": float(g.score()), "dead": bool(g.isDead())})

# 4. root move values at several depths
out["searches"] = []
picks = [s for p in out["playouts"] for s in p["steps"][5::37]][:24]
for i, s in enumerate(picks):
    g = G.Game(board=G.np.array(s["board"]).reshape(4, 4))
    g.seed = s["seed"]
    if g.isDead():
        continue
    for depth in ([0, 1, 2, 3] if i % 4 else [0, 1, 2, 3, 5]):
        recorded.clear()
        minimax.chooseAction(AIGame(g), depth)
        vals = recorded[-1]
        out["searches"].append({"board": s["board"], "seed": s["seed"], "depth": depth,
                                "values": {a: float(v) for a, v in vals.items()}})

# 5. whole AI games with the root order fixed: the JS must make the same moves
minimax.random.shuffle = lambda xs: None
out["aiGames"] = []
for k, (depth, limit) in enumerate([(1, 400), (2, 300), (3, 150), (5, 40)]):
    g = fresh(3000 + k)
    start = {"seed": g.seed, "board": board_list(g)}
    moves = []
    while not g.isDead() and len(moves) < limit:
        a = minimax.chooseAction(AIGame(g), depth)
        g.move(a)
        moves.append(a)
    out["aiGames"].append({"depth": depth, "start": start, "moves": moves,
                           "final": {"seed": g.seed, "board": board_list(g)}})

json.dump(out, sys.stdout, separators=(",", ":"))
