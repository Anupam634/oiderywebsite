#!/usr/bin/env python3
"""Machine embroidery files for the studio (uses pyembroidery: pip install pyembroidery).

    python3 stitchfile.py <input file> <output dir> [--threads "#hex,#hex,..."] [--names "Rani,Neel,..."]

Reads any format pyembroidery knows (PES, DST, JEF, EXP, VP3, XXX, PEC, U01…), then writes into <output dir>:
    preview.png   the stitches drawn in thread colours (white background, for the admin and proofs)
    design.pes    a PES (version 6) for Brother machines, carrying the thread colours
and prints one line of JSON: stitch count, colour changes, size in mm, threads.

--threads gives colours to designs that carry none (DST/EXP), in sewing order. Without it, a DST keeps
pyembroidery's default colours and the operator picks threads on the machine.
"""
import json
import os
import sys

import pyembroidery
from pyembroidery import EmbThread


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    src, out = argv[1], argv[2]
    threads = []
    names = []
    if "--threads" in argv:
        threads = [t.strip() for t in argv[argv.index("--threads") + 1].split(",") if t.strip()]
    if "--names" in argv:
        names = [n.strip() for n in argv[argv.index("--names") + 1].split(",")]

    pattern = pyembroidery.read(src)
    if pattern is None or not pattern.stitches:
        print(json.dumps({"error": "That file has no stitches pyembroidery can read"}))
        return 1

    # colour blocks = changes + 1; give colourless formats the shopper's thread colours
    blocks = pattern.count_color_changes() + 1
    has_colours = len(pattern.threadlist) >= blocks and src.lower().rsplit(".", 1)[-1] not in ("dst", "exp", "tbf", "u01")
    if threads and not has_colours:
        pattern.threadlist = []
        for i in range(blocks):
            t = EmbThread()
            t.set_color(*_rgb(threads[i % len(threads)]))
            t.description = names[i % len(names)] if names else "Thread %d" % (i + 1)
            pattern.threadlist.append(t)
    pattern.fix_color_count()

    min_x, min_y, max_x, max_y = pattern.extents()
    stitches = sum(1 for s in pattern.stitches if (s[2] & pyembroidery.COMMAND_MASK) == pyembroidery.STITCH)
    info = {
        "stitches": stitches,
        "colourChanges": pattern.count_color_changes(),
        # pyembroidery units are 0.1 mm
        "widthMm": round((max_x - min_x) / 10.0, 1),
        "heightMm": round((max_y - min_y) / 10.0, 1),
        "threads": [
            {
                "hex": "#%06X" % (t.color & 0xFFFFFF),
                "name": t.description or t.catalog_number or ("Thread %d" % (i + 1)),
                **({"code": t.catalog_number} if t.catalog_number else {}),
            }
            for i, t in enumerate(pattern.threadlist[:blocks])
        ],
    }
    os.makedirs(out, exist_ok=True)
    pyembroidery.write_png(pattern, os.path.join(out, "preview.png"), {"background": 0xFFFFFF, "linewidth": 3})
    pyembroidery.write_pes(pattern, os.path.join(out, "design.pes"), {"version": "6"})
    print(json.dumps(info))
    return 0


def _rgb(hex_colour):
    h = hex_colour.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception as e:  # report, don't crash with a traceback the API can't read
        print(json.dumps({"error": "Could not read that file: %s" % e}))
        sys.exit(1)
