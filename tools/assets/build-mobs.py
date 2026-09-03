# ---------------------------------------------------------------------------
# build-mobs.py - turn the drawn mob art into src/art/mobs.js.
#
#   python tools/assets/build-mobs.py
#
# Run offline, after changing anything in art-source/mobs/. Writes exactly one
# file: src/art/mobs.js, which is generated and should not be hand-edited.
#
# WHY THE ART IS TRANSLATED INSTEAD OF LOADED
#
# Every other creature in this game is a pixel map in a source file that
# `rasterize()` paints onto a canvas at startup: no fetch, no decode, no
# missing-image frame, and `clearSpriteCache()` can rebuild the whole bestiary
# at a new scale on a settings change. Shipping these nine as PNGs would have
# made the mobs the only creatures in the game with a loading state, for no gain
# - they are 2 to 11 colours each with no antialiasing, so the pixel map is a
# LOSSLESS representation of the file, and the generated module is smaller than
# the PNGs it replaces.
#
# So the drawing stays the source of truth in art-source/mobs/, this script is
# the importer, and the game keeps its single way of drawing a creature.
#
# WHAT IT DOES
#
#   Crops to the ink.  The art is drawn on 32x32 (and 16, 36, 64) canvases with
#       whatever margin suited the artist. Margin is not art: it would show up
#       as a creature that floats above its own shadow, and it would make the
#       drawn size depend on how much empty space a file happens to carry.
#       render.js sizes a mob from the cropped bitmap, so the crop has to happen
#       somewhere, and doing it here means it happens once rather than per frame.
#
#   Reads the palette off the image.  Colours are collected, sorted dark to
#       light, and given single characters - `o` for the darkest, which is the
#       outline in all nine and matches the convention the hand-authored
#       champions already use, then `a` upwards as the colour gets lighter. A
#       generated map you can still read at a glance is worth the sort.
#
#   Picks the tint.  MOB_TINT drives the death burst and the elite glow, so it
#       has to be a colour that can be seen: the most-used colour on the
#       creature that is bright enough to read against the ground. Where
#       nothing is - the bat is a dark purple with red eyes, and both are too
#       dark - its own colour is lifted rather than replaced, so the spark
#       still belongs to the thing that died.
#
# The sprites are NOT rescaled here. They are 12 to 46 pixels tall and that is
# deliberate - a bat is wide, a brute is tall - and render.js derives the drawn
# size from the hitbox rather than the pixel count, so the art can be authored
# at whatever resolution suits the creature.
# ---------------------------------------------------------------------------
import colorsys
import os
import sys
from collections import Counter

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ART = os.environ.get("GRIMFALL_MOB_ART", os.path.join(ROOT, "art-source", "mobs"))
OUT = os.path.join(ROOT, "src", "art", "mobs.js")

# The spawn table in src/game/config.js names these, and render.js looks each
# one up by name, so a rename here is a rename in three places. Listed rather
# than globbed so a stray file in the folder cannot quietly join the bestiary.
KEYS = ["slime", "bat", "skeleton", "hound", "imp", "brute", "wisp", "spider", "shade"]

# `o` is the outline, by the convention the champions in bestiary.js already
# use. The rest run dark to light, so a glance at the map reads as shading.
CHARS = "abcdefghijkmnpqrstuvwxyz"
ALPHA = 8              # below this an "opaque" pixel is really a stray edge


def luma(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def lift(c):
    """Bring a colour up to something visible, keeping its hue.

    Done in HSV rather than by blending towards white, which desaturates: a
    lifted bat should still be purple. The saturation ceiling is there because
    a fully saturated dark colour taken straight up to full value comes out
    neon, and nothing else on screen is.
    """
    h, s, v = colorsys.rgb_to_hsv(*[x / 255 for x in c])
    r, g, b = colorsys.hsv_to_rgb(h, min(s, 0.72), 0.85)
    return (round(r * 255), round(g * 255), round(b * 255))


def read(key):
    path = os.path.join(ART, f"{key}.png")
    if not os.path.exists(path):
        sys.exit(
            f"missing art: {path}\n\n"
            "The mob drawings live in art-source/mobs/. Point GRIMFALL_MOB_ART\n"
            "somewhere else if you keep them outside the repository."
        )
    im = Image.open(path).convert("RGBA")
    # Anything semi-transparent would have to become either solid or nothing,
    # and silently choosing is how a sprite grows a halo. These files have no
    # such pixels; if one ever does, it should be a failure, not a guess.
    soft = [(x, y) for y in range(im.height) for x in range(im.width)
            if 0 < im.getpixel((x, y))[3] < 255]
    if soft:
        sys.exit(f"{key}.png has {len(soft)} semi-transparent pixels, e.g. {soft[0]}.\n"
                 "The pixel maps are opaque-or-nothing. Flatten them first.")
    box = im.getbbox()
    if not box:
        sys.exit(f"{key}.png is empty")
    return im.crop(box)


def translate(im):
    px = im.load()
    counts = Counter()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a >= ALPHA:
                counts[(r, g, b)] += 1

    order = sorted(counts, key=luma)
    if len(order) > len(CHARS) + 1:
        sys.exit(f"{len(order)} colours, and only {len(CHARS) + 1} characters to name them")
    chars = {order[0]: "o"}
    for i, c in enumerate(order[1:]):
        chars[c] = CHARS[i]

    rows = []
    for y in range(im.height):
        row = ""
        for x in range(im.width):
            r, g, b, a = px[x, y]
            row += chars[(r, g, b)] if a >= ALPHA else "."
        rows.append(row)

    palette = {chars[c]: "#%02x%02x%02x" % c for c in order}

    # The burst colour, and the glow on an elite. The most-used colour the
    # creature has, provided it can actually be seen: a burst the colour of a
    # black spider is no burst at all. If nothing on the creature is bright
    # enough - the bat is a dark purple with red eyes, and both fail - its own
    # colour is lifted rather than swapped for some brighter colour it does not
    # have, so the spark still reads as belonging to the thing that died.
    lit = [c for c in counts if luma(c) >= 70]
    tint = max(lit or counts, key=lambda c: counts[c])
    if luma(tint) < 70:
        tint = lift(tint)
    return rows, palette, "#%02x%02x%02x" % tint


def js_rows(rows):
    """Four maps to a line, so a 46-row sprite is eleven lines and not forty-six."""
    per = 4 if len(rows[0]) <= 24 else 2
    out = []
    for i in range(0, len(rows), per):
        out.append("      " + " ".join(f"'{r}'," for r in rows[i:i + per]))
    return "\n".join(out)


print(f"reading {os.path.relpath(ART, ROOT).replace(os.sep, '/')}/\n")

blocks, tints = [], {}
for key in KEYS:
    im = read(key)
    rows, palette, tint = translate(im)
    tints[key] = tint
    pal = ", ".join(f"{k}: '{v}'" for k, v in palette.items())
    blocks.append(f"  {key}: {{\n    palette: {{ {pal} }},\n    rows: [\n{js_rows(rows)}\n    ],\n  }},")
    print(f"  {key:10s} {im.width:>2}x{im.height:<2}  {len(palette)} colours   tint {tint}")

body = "\n".join(blocks)
tint_lines = "\n".join(f"  {k}: '{v}'," for k, v in tints.items())

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(f"""// ---------------------------------------------------------------------------
// mobs.js - GENERATED by tools/assets/build-mobs.py. Do not edit by hand.
//
// The drawings are in art-source/mobs/. Change one there and re-run:
//
//     python tools/assets/build-mobs.py
//
// Each entry is the drawing cropped to its ink, as a pixel map plus the palette
// read off the image - a lossless translation of the file, in the form the rest
// of the bestiary is already written in, so a mob costs no fetch and no decode
// and can be re-rasterised at a new scale without touching the network.
//
// The maps are NOT all the same size, on purpose: a bat is wide and a brute is
// tall. render.js derives a mob's drawn size from its hitbox rather than from
// its pixel count, so the art is free to be authored at whatever resolution
// suits the creature.
// ---------------------------------------------------------------------------

export const MOB_ART = {{
{body}
}};

/** The burst colour for a death and the glow on an elite, read off the art. */
export const MOB_ART_TINT = {{
{tint_lines}
}};
""")

rel = os.path.relpath(OUT, ROOT).replace(os.sep, "/")
print(f"\n  {rel}  {os.path.getsize(OUT) // 1024}kb")
print("\nRun `npm run test:quick` — art-smoke.mjs rasterises every one of these.")
