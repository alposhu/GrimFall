# ---------------------------------------------------------------------------
# build_rtp.py - derive Grimfall's RTP atlases from the owner's RPG Maker MZ
# install. Run offline; the game ships only the atlases this writes.
#
#   python build_rtp.py
#
# Only the slices the game actually uses are copied, which keeps the shipped
# art small and is the "atlas rather than loose files" the licence notes ask
# for. Ground and props are toned down on the way through, because the RTP is
# lit for noon and the Long Market is lit by braziers.
# ---------------------------------------------------------------------------
import os
from PIL import Image

SRC = r"C:\Users\alper\OneDrive\Documenten\RMMZ\the_game\img"
OUT = r"C:\Users\alper\Documents\ThY_GAme\grimfall\img\rtp"
T = 48

os.makedirs(OUT, exist_ok=True)
_cache = {}
def load(rel):
    if rel not in _cache:
        _cache[rel] = Image.open(os.path.join(SRC, rel)).convert("RGBA")
    return _cache[rel]

def tone(img, mul, tint, mix):
    """Scale luminance and pull hue toward `tint`. Alpha is preserved."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            r, g, b = r * mul, g * mul, b * mul
            r = r + (tint[0] - r) * mix
            g = g + (tint[1] - g) * mix
            b = b + (tint[2] - b) * mix
            px[x, y] = (int(max(0, min(255, r))), int(max(0, min(255, g))),
                        int(max(0, min(255, b))), a)
    return img

def sheet(cells, cols, cw, ch):
    rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.paste(c, ((i % cols) * cw, (i // cols) * ch))
    return out

def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, optimize=True)
    print(f"  {name:20s} {img.width}x{img.height}  {os.path.getsize(p)//1024}kb")

# --- ground ---------------------------------------------------------------
# Outside_A5 row 3: four paving stones that tile seamlessly against each other.
GROUND = [(0, 3), (3, 3), (5, 3), (7, 3), (0, 5)]
src = load("tilesets/Outside_A5.png")
cells = [src.crop((c * T, r * T, c * T + T, r * T + T)) for c, r in GROUND]
cells = [tone(c, 0.68, (58, 40, 46), 0.18) for c in cells]
save(sheet(cells, len(cells), T, T), "ground.png")

# --- props ----------------------------------------------------------------
# (name, source, col, row, tiles wide, tiles high). Everything is anchored by
# its bottom edge when drawn, so a two-tile prop just stands taller.
PROPS = [
    ("lamppost",   "Outside_B.png",  0,  1, 1, 3),
    ("stall_wood", "Outside_B.png",  3,  0, 2, 2),
    ("stall_stone","Outside_B.png",  1,  0, 2, 2),
    ("tent",       "Outside_B.png",  5,  0, 3, 3),
    ("tent_red",   "Outside_B.png",  5,  3, 3, 3),
    ("barrel",     "Outside_B.png", 13,  1, 1, 1),
    ("tub",        "Outside_B.png", 11,  1, 1, 1),
    ("bucket",     "Outside_B.png",  9,  2, 1, 1),
    ("washtub",    "Outside_B.png", 10,  2, 1, 1),
    ("urn",        "Outside_B.png",  8,  2, 1, 1),
    ("crate",      "Outside_B.png", 13,  2, 1, 1),
    ("well",       "Outside_B.png", 11,  2, 1, 1),
    ("trestle",    "Outside_B.png", 14,  2, 1, 1),
    ("signpost",   "Outside_B.png",  9,  1, 1, 1),
    ("fence",      "Outside_B.png", 10,  1, 1, 1),
    ("basket",     "Outside_B.png",  9,  5, 1, 1),
    ("firewood",   "Outside_B.png", 10,  5, 1, 1),
    ("pebbles",    "Outside_B.png", 11,  5, 1, 1),
    ("haystack",   "Outside_B.png", 15,  4, 1, 1),
    ("wheat",      "Outside_B.png", 12,  5, 1, 1),
    ("cabbages",   "Outside_B.png", 14,  5, 1, 1),
    ("berries",    "Outside_B.png", 15,  5, 1, 1),
    ("stump",      "Outside_B.png", 12,  3, 1, 1),
    ("log",        "Outside_B.png", 12,  4, 1, 1),
    ("flowers",    "Outside_B.png", 10,  4, 1, 1),
    ("shrub",      "Outside_B.png",  9,  3, 1, 1),
    ("crate_tall", "Outside_B.png", 12,  6, 1, 2),
    ("shelf_bare", "Outside_B.png", 13,  6, 1, 2),
    ("shelf_bread","Outside_B.png", 14,  6, 1, 2),
    ("shelf_fish", "Outside_B.png", 15,  6, 1, 2),
    ("arch",       "Outside_B.png",  4, 14, 1, 2),
    ("awning",     "Outside_B.png",  2, 13, 1, 1),
    ("counter",    "Outside_B.png",  0, 10, 2, 2),

    # --- the waystation ----------------------------------------------------
    # Appended, never inserted: src/art/rtp.js indexes props.png by position,
    # so adding to the END is free and inserting anywhere else silently
    # renames every prop after the insertion point.
    ("tree",       "Outside_B.png",  8,  6, 2, 2),
    ("thicket",    "Outside_B.png", 10,  6, 2, 2),
    ("dead_tree",  "Outside_B.png",  8, 13, 1, 2),
    ("dead_birch", "Outside_B.png",  9, 13, 1, 2),
    ("toadstool",  "Outside_B.png", 11, 13, 1, 1),
    ("mushrooms",  "Outside_B.png", 10, 13, 1, 1),

    # --- the Hearthhall ----------------------------------------------------
    # Interior furniture, from Inside_B. Appended for the same reason as
    # everything above: props.png is indexed by position.
    ("hearth",     "Inside_B.png", 13,  7, 2, 2),
    ("firepit",    "Inside_B.png", 10,  7, 1, 2),
    ("brickfire",  "Inside_B.png", 11,  7, 1, 2),
    ("bar",        "Inside_B.png", 10,  9, 2, 1),
    ("bar_end",    "Inside_B.png",  8,  9, 1, 1),
    ("shelf_jars", "Inside_B.png",  8,  7, 1, 1),
    ("shelf_books","Inside_B.png",  9,  7, 1, 1),
    ("shelf_kegs", "Inside_B.png",  9,  8, 1, 1),
    ("bookcase",   "Inside_B.png", 14,  2, 1, 2),
    ("cupboard",   "Inside_B.png",  8,  2, 1, 2),
    ("keg",        "Inside_B.png", 12, 10, 1, 1),
    ("pot",        "Inside_B.png",  9, 10, 1, 1),
    ("washpot",    "Inside_B.png", 10, 10, 1, 1),
    ("woodtub",    "Inside_B.png", 11, 10, 1, 1),
    ("logs",       "Inside_B.png", 12, 11, 1, 1),
    ("piano",      "Inside_B.png", 13,  9, 2, 2),
    ("longtable",  "Inside_B.png",  0, 14, 2, 1),
    ("roundtable", "Inside_B.png",  2, 14, 1, 1),
    ("clothtable", "Inside_B.png",  3, 14, 1, 1),
    ("sidetable",  "Inside_B.png",  4, 14, 1, 1),
    ("sofa",       "Inside_B.png",  0, 12, 3, 2),
    ("chair",      "Inside_B.png",  4, 12, 1, 2),
    ("throne",     "Inside_B.png",  6, 12, 1, 2),
    ("stool",      "Inside_B.png",  0, 15, 1, 1),
    ("stool_red",  "Inside_B.png",  1, 15, 1, 1),
    ("clock",      "Inside_B.png",  5, 14, 1, 2),
    ("mirror",     "Inside_B.png",  6, 14, 1, 2),
    ("banner_gold","Inside_B.png",  0, 10, 1, 2),
    ("banner_red", "Inside_B.png",  1, 10, 1, 2),
    ("swords",     "Inside_B.png",  2, 10, 1, 1),
    ("crossed",    "Inside_B.png",  3, 10, 1, 1),
    ("shield",     "Inside_B.png",  2, 11, 1, 1),

    # --- what is actually ON the tables -------------------------------------
    # Inside_C, which is where the RTP keeps the small things. A long table
    # with nothing on it reads as furniture in a showroom; the same table with
    # a roast, a jug and four cups on it reads as somewhere people are eating.
    # These are all one tile, so they sit on a table top rather than replacing
    # it — the table is drawn first and these are drawn over it.
    ("teapot",     "Inside_C.png",  0,  0, 1, 1),
    ("cups",       "Inside_C.png",  2,  0, 1, 1),
    ("jug",        "Inside_C.png",  5,  0, 1, 1),
    ("wine",       "Inside_C.png",  1,  1, 1, 1),
    ("goblets",    "Inside_C.png",  7,  1, 1, 1),
    ("ale",        "Inside_C.png",  5,  2, 1, 1),
    ("steins",     "Inside_C.png",  6,  2, 1, 1),
    ("bottles",    "Inside_C.png",  3,  3, 1, 1),
    ("glasses",    "Inside_C.png",  7,  3, 1, 1),
    ("roast_bird", "Inside_C.png",  1,  4, 1, 1),
    ("greens",     "Inside_C.png",  2,  4, 1, 1),
    ("fruit",      "Inside_C.png",  3,  4, 1, 1),
    ("roast",      "Inside_C.png",  4,  4, 1, 1),
    ("shellfish",  "Inside_C.png",  5,  4, 1, 1),
    ("pasta",      "Inside_C.png",  6,  4, 1, 1),
    ("sweets",     "Inside_C.png",  7,  4, 1, 1),
    ("supper",     "Inside_C.png",  1,  5, 1, 1),
    ("casserole",  "Inside_C.png",  4,  5, 1, 1),
    ("stewpot",    "Inside_C.png",  6,  5, 1, 1),
    ("breakfast",  "Inside_C.png",  0,  6, 1, 1),
    ("breadboard", "Inside_C.png",  4,  6, 1, 1),
    ("soup",       "Inside_C.png",  5,  6, 1, 1),
    ("tart",       "Inside_C.png",  7,  6, 1, 1),
    ("cask_a",      "Inside_C.png",  0,  7, 1, 1),
    ("cask_b",      "Inside_C.png",  1,  7, 1, 1),
    ("plates",     "Inside_C.png",  3,  7, 1, 1),
    ("choppingboard", "Inside_C.png", 5, 7, 1, 1),
    ("claypot",    "Inside_C.png",  6,  7, 1, 1),
    ("pan",        "Inside_C.png",  7,  7, 1, 1),

    # --- and the things around the edges ------------------------------------
    ("tome",       "Inside_C.png",  0,  8, 1, 1),
    ("ledger",     "Inside_C.png",  2,  8, 1, 1),
    ("scrolls",    "Inside_C.png",  0,  9, 1, 1),
    ("map",        "Inside_C.png",  4,  9, 1, 1),
    ("plant_a",     "Inside_C.png",  4, 10, 1, 1),
    ("plant_b",     "Inside_C.png",  5, 10, 1, 1),
    ("plant_c",     "Inside_C.png",  6, 10, 1, 1),
    ("plant_d",     "Inside_C.png",  7, 10, 1, 1),
    ("chest",      "Inside_C.png",  0, 11, 1, 1),
    ("chest_open", "Inside_C.png",  1, 11, 1, 1),
    ("case_wares",  "Inside_C.png",  6, 11, 1, 1),
    ("case_tools",    "Inside_C.png",  7, 11, 1, 1),
    ("sack_a",      "Inside_C.png",  0, 12, 1, 1),
    ("sack_b",      "Inside_C.png",  1, 12, 1, 1),
    ("phials",     "Inside_C.png",  4, 12, 1, 1),
    ("basket_a",    "Inside_C.png",  0, 13, 1, 1),
    ("basket_b",    "Inside_C.png",  1, 13, 1, 1),
    ("bolts",      "Inside_C.png",  4, 13, 1, 1),
    ("scales",     "Inside_C.png",  7, 13, 1, 1),
    ("wallblades", "Inside_C.png",  8,  0, 1, 1),
    ("wallcrest",   "Inside_C.png", 11,  0, 1, 1),
    ("larder", "Inside_C.png", 10,  1, 1, 1),
    ("sconce",   "Inside_C.png",  9,  1, 1, 1),
    ("candelabra","Inside_C.png",  8,  4, 1, 2),
    ("goldbars",   "Inside_C.png",  8,  7, 1, 1),
]

# --- terrain --------------------------------------------------------------
# Named ground materials for the waystation, one 48px tile each. Named rather
# than indexed like ground.png, because the hub's map is authored by hand and
# `'cobble'` in a district description is readable where `3` is not.
#
# Toned less harshly than the market's paving: the waystation is outdoors under
# a bruised sky, not a square lit by braziers, so it keeps more of its own
# colour. Grass stays green enough to read as grass.
TERRAIN = [
    ("grass",   "Outside_A5.png", 0, 2), ("moss",    "Outside_A5.png", 4, 2),
    ("dirt",    "Outside_A5.png", 2, 2), ("sand",    "Outside_A5.png", 1, 2),
    ("road",    "Outside_A5.png", 0, 3), ("cobble",  "Outside_A5.png", 5, 3),
    ("brick",   "Outside_A5.png", 1, 3), ("clay",    "Outside_A5.png", 2, 3),
    ("slab",    "Outside_A5.png", 0, 5), ("dark",    "Outside_A5.png", 7, 3),
    # Interior. The Hearthhall is indoors and needs floorboards and walls, not
    # grass — and a wall here is a FLOOR tile that happens to be solid, because
    # a top-down room is drawn as a floor plan with a thick edge.
    ("plank",   "Inside_A5.png", 2, 2), ("board",   "Inside_A5.png", 2, 3),
    ("flag",    "Inside_A5.png", 4, 3), ("hearthstone", "Inside_A5.png", 6, 2),
    ("rug_gold","Inside_A5.png", 1, 5), ("rug_blue", "Inside_A5.png", 2, 5),
    ("rug_red", "Inside_A5.png", 6, 5), ("wall",     "Inside_A5.png", 2, 0),
    ("wall_dark", "Inside_A5.png", 7, 2),
]
# Trade signs get their own strip so the shop code can index them by name.
SIGNS = [
    ("sign_smith",  5, 9), ("sign_potion", 5, 8), ("sign_coin",   4, 8),
    ("sign_blade",  1, 8), ("sign_armour", 3, 8), ("sign_inn",    6, 8),
    ("sign_ale",    7, 8), ("sign_food",   0, 9), ("sign_charm",  4, 9),
]

CELL = 3 * T                      # the largest prop is 3x3
cells, manifest = [], []
for name, f, c, r, w, h in PROPS:
    s = load("tilesets/" + f).crop((c * T, r * T, (c + w) * T, (r + h) * T))
    # Anything from an Inside_ sheet belongs to the Hearthhall, which has a fire
    # going and people in it. Toning it down to the market's dusk made a laid
    # supper table look like a still life in a crypt.
    indoors = f.startswith("Inside_")
    s = tone(s, 0.92 if indoors else 0.80, (60, 44, 40) if indoors else (54, 38, 44),
             0.05 if indoors else 0.10)
    pad = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    pad.paste(s, ((CELL - s.width) // 2, CELL - s.height))   # bottom-anchored
    cells.append(pad)
    manifest.append((name, s.width, s.height))
save(sheet(cells, 8, CELL, CELL), "props.png")

signs = []
for name, c, r in SIGNS:
    s = load("tilesets/Outside_B.png").crop((c * T, r * T, c * T + T, r * T + T))
    signs.append(tone(s, 0.88, (54, 38, 44), 0.06))
save(sheet(signs, len(signs), T, T), "signs.png")


# --- the inn's floors, carpets and walls ----------------------------------
#
# WHY THESE ARE COMPOSED RATHER THAN CROPPED.
#
# The carpet in an inn is a rectangle with an ornate border, and RPG Maker
# stores that as an AUTOTILE: one 96x144 block holding, in quarter-tiles, every
# corner and edge a region could need. Cropping a single 48px square out of it
# gives either a corner or a middle, never a rug.
#
# The bottom 2x2 tiles of an A2 block are a closed square with its border, and
# that is all a rectangular rug needs: read it as a 4x4 grid of 24px quarters
# and the outer ring IS the border. Nine tiles are composed from it - four
# corners, four edges, one fill - and the map lays them like a nine-slice. No
# general autotiler, no 47-tile template, and the result is the drawn border
# rather than an approximation of it.
QUARTER = T // 2


def nine_slice(sheet, bx, by, prefix, mul, tint, mix):
    """Nine tiles from the closed-square part of an A2 autotile block."""
    src = load("tilesets/" + sheet)
    # The closed square is the bottom two tile-rows of the three-tall block.
    block = src.crop((bx * 96, by * 144 + T, bx * 96 + 96, by * 144 + 3 * T))
    q = lambda cx, cy: block.crop((cx * QUARTER, cy * QUARTER,
                                   cx * QUARTER + QUARTER, cy * QUARTER + QUARTER))

    def tile(qx, qy):
        """One 48px tile from the four quarters starting at (qx, qy)."""
        out = Image.new("RGBA", (T, T), (0, 0, 0, 0))
        out.paste(q(qx, qy), (0, 0))
        out.paste(q(qx + 1, qy), (QUARTER, 0))
        out.paste(q(qx, qy + 1), (0, QUARTER))
        out.paste(q(qx + 1, qy + 1), (QUARTER, QUARTER))
        return tone(out, mul, tint, mix)

    # Quarter coordinates of each nine-slice piece in the 4x4 grid.
    return [
        (prefix + "_tl", tile(0, 0)), (prefix + "_t", tile(1, 0)), (prefix + "_tr", tile(2, 0)),
        (prefix + "_l",  tile(0, 1)), (prefix + "_c", tile(1, 1)), (prefix + "_r",  tile(2, 1)),
        (prefix + "_bl", tile(0, 2)), (prefix + "_b", tile(1, 2)), (prefix + "_br", tile(2, 2)),
    ]


def a2_fill(sheet, bx, by, mul, tint, mix):
    """The plain middle of an A2 block - the material with no border at all."""
    src = load("tilesets/" + sheet)
    x = bx * 96 + QUARTER
    y = by * 144 + T + QUARTER
    return tone(src.crop((x, y, x + T, y + T)), mul, tint, mix)


def a4_wall(bx, by, row, mul, tint, mix):
    """One tile from an A4 wall block. `row` 0-1 is the top, 2-4 is the face."""
    src = load("tilesets/Inside_A4.png")
    x = bx * 96
    y = by * 240 + row * T
    return tone(src.crop((x, y, x + T, y + T)), mul, tint, mix)

# --- terrain --------------------------------------------------------------
terrain = []
for name, f, c, r in TERRAIN:
    t = load("tilesets/" + f).crop((c * T, r * T, c * T + T, r * T + T))
    # The woven carpets are the most saturated tiles in the whole RTP - a
    # bright royal blue and a gold that reads as lime at size. Laid as a floor
    # they became the brightest thing in a dark room by a wide margin, which is
    # exactly backwards: a rug is meant to sit UNDER the furniture, not shout
    # over it. They get their own, much harder tone.
    rug = name.startswith("rug_")
    terrain.append((name, tone(t, 0.34 if rug else 0.62, (52, 38, 50), 0.34 if rug else 0.22)))

# The inn. Lit and warm rather than toned to dusk: it is the one interior in
# the game with a fire going and people in it, and the run it sits in front of
# is dark enough that arriving somewhere warm is the point.
INN_TONE = (0.86, (60, 44, 40), 0.08)
terrain.append(("oak", a2_fill("Inside_A2.png", 7, 0, *INN_TONE)))
terrain.append(("parquet", a2_fill("Inside_A2.png", 0, 2, *INN_TONE)))
terrain.append(("kitchen", a2_fill("Inside_A2.png", 1, 0, *INN_TONE)))
terrain.append(("marble", a2_fill("Inside_A2.png", 5, 2, *INN_TONE)))
# The carpets go a shade deeper than the boards around them. At the inn's own
# tone the blue one was the brightest thing in the building, which is backwards:
# a rug sits under the furniture, it does not shout over it.
RUG_TONE = (0.70, (58, 42, 44), 0.16)
terrain.extend(nine_slice("Inside_A2.png", 2, 3, "carpet", *RUG_TONE))     # red and gold
terrain.extend(nine_slice("Inside_A2.png", 2, 2, "rugblue", *RUG_TONE))    # blue and gold

# Walls, as three tiles rather than one. A room drawn with a single solid
# colour behind it is a floor plan; a room with a lit panel above a skirting
# board is somewhere with a wall you could lean on. `walltop` is what the
# deeper masonry looks like from above, and the two faces are the near side.
terrain.append(("walltop", a4_wall(2, 1, 0, *INN_TONE)))
terrain.append(("wallhigh", a4_wall(2, 1, 2, *INN_TONE)))
terrain.append(("walllow", a4_wall(2, 1, 4, *INN_TONE)))

save(sheet([t for _, t in terrain], len(terrain), T, T), "terrain.png")

# The names, in atlas order, written beside the atlas.
#
# src/art/rtp.js has to name these tiles to draw them, and the coupling used to
# be checked by reading this script's TERRAIN table with a regex. That stopped
# working the moment tiles started being APPENDED - the carpets are composed,
# not cropped, so they never appear in a table to read. A manifest the script
# emits is the honest version: it says what was actually built, in the order it
# was actually built, and tools/sheet-smoke.mjs compares rtp.js to it.
_names = [name for name, _ in terrain]
with open(os.path.join(OUT, "terrain.txt"), "w", encoding="utf-8", newline="\n") as _f:
    _f.write("\n".join(_names) + "\n")
print(f"  {'terrain.txt':20s} {len(_names)} names")

# --- banners --------------------------------------------------------------
# Outside_C row 12-13: hanging cloth for the far wall.
# Toned harder than the props: undyed cloth at full saturation is the brightest
# thing in a square lit by braziers, and it should not be.
bs = []
for c in range(4):
    b = load("tilesets/Outside_C.png").crop((c * T, 12 * T, c * T + T, 14 * T))
    bs.append(tone(b, 0.74, (54, 38, 44), 0.16))
save(sheet(bs, 4, T, 2 * T), "banners.png")

# --- crowd ----------------------------------------------------------------
# The People sheets hold thirty-two characters and most of them have no business
# in a market square: People3 is a royal court - a crowned king, a queen, a
# prince, a princess and three courtiers - and People2 and People4 carry several
# more nobles, a bride and a priestess. A shopper haggling over turnips in
# ermine is absurd, so the crowd is CAST rather than filtered: only people who
# look like they buy their own food are cut out, and the rest are left behind.
#
# Fifteen townsfolk and three merchants, packed as 3x4-cell blocks (144x192)
# six to a row. That is one atlas of eighteen people instead of four sheets of
# thirty-two, most of whom would never be drawn.
#
# The order here IS the index order `src/art/rtp.js` addresses them by, so
# adding to the middle renumbers everyone. Append instead. `sheet-smoke` checks
# the two lists agree.
CROWD = [
    ("People1", 0, "young man, green tunic"),
    ("People1", 1, "girl in a red dress"),
    ("People1", 2, "youth in a blue tunic"),
    ("People1", 3, "red-haired girl in an apron"),
    ("People1", 4, "man in a work coat"),
    ("People1", 5, "young woman, cream frock"),
    ("People1", 6, "old man in a green cap"),
    ("People1", 7, "old woman"),
    ("People2", 0, "old man in white and gold"),
    ("People3", 4, "grey-haired man in a brown coat"),
    ("People4", 1, "white-haired woman in an apron"),
    ("People4", 0, "man in a plaid waistcoat"),
    ("People4", 4, "farmer in a straw hat"),
    ("People4", 5, "woman in an orange headscarf"),
    ("People4", 6, "woman in a brown work coat"),
]
# The three traders, after the crowd so the crowd's indices stay 0..14.
MERCHANTS = [
    ("People2", 4, "oswin - bearded, sleeves rolled up"),
    ("People2", 3, "marta - headband and apron"),
    ("People2", 6, "coinweigher - goggles pushed up"),
]

# The three of them come off ONE sheet now, which is what makes the faces
# below possible: People2's portraits are index-matched to its characters, so
# the merchant you talk to is the merchant standing at the stall. People2/3 and
# People2/6 were townsfolk until this change and had to leave CROWD above -
# the market must not contain a second copy of a person you can talk to.

BLOCK_W, BLOCK_H = 3 * T, 4 * T
folk_cells = []
for who, block, _why in CROWD + MERCHANTS:   # `sheet` is the packer, do not shadow it
    src = load(f"characters/{who}.png")
    bx, by = (block % 4) * 3 * T, (block // 4) * 4 * T
    folk_cells.append(src.crop((bx, by, bx + BLOCK_W, by + BLOCK_H)))
save(sheet(folk_cells, 6, BLOCK_W, BLOCK_H), "folk.png")

# --- the player's characters ----------------------------------------------
# Actor2 is the party sheet: eight adventurers, with portraits to match in
# img/faces. Five of the seven heroes wear one. Ada and Leon do not - they are
# the owner's own drawings and go through src/art/sheets.js instead.
save(load("characters/Actor2.png"), "actors.png")
save(load("faces/Actor2.png"), "actor_faces.png")

# --- the merchants' faces -------------------------------------------------
# People2's face sheet, in the stock 4x2 grid of 144px cells. Only the three
# the shop card shows are cut, in vendor order, so this atlas is 3 cells wide
# and `src/art/rtp.js` indexes it the same way it indexes everything else.
#
# Faces are NOT toned. Every other slice in this file is pulled towards brazier
# light because it sits in the world; a portrait sits on a dark UI panel, where
# dimming it only makes it muddy.
FACE = 144
VENDOR_FACES = [
    ("oswin",       4),   # bottom left  - bearded, sleeves rolled up
    ("marta",       3),   # top right    - headband and apron
    ("coinweigher", 6),   # bottom, 3rd  - goggles pushed up
]
fsrc = load("faces/People2.png")
cells = []
for _who, idx in VENDOR_FACES:
    c, r = idx % 4, idx // 4
    cells.append(fsrc.crop((c * FACE, r * FACE, c * FACE + FACE, r * FACE + FACE)))
save(sheet(cells, len(cells), FACE, FACE), "vendor_faces.png")

# --- balloons -------------------------------------------------------------
# Ten expressions, eight frames each. The empty first frame is kept: it is the
# pop-in.
b = load("system/Balloon.png").crop((0, 0, 8 * T, 10 * T))
save(b, "balloons.png")

# --- item icons -----------------------------------------------------------
# IconSet is 16 columns of 32px, indexed row-major. One icon per shop good, and
# they are keyed by the good's own id so nothing can end up sharing a picture
# with something it has nothing to do with. Picked to depict the object rather
# than the effect: a Whetstone is a smith's hammer, not a damage-up arrow.
ICON = 32
ICONS = [
    # Marta, apothecary
    ("mend",        176),  # a round flask - the one you drink here
    ("feast",       259),  # meat on the bone
    ("tonic",       183),  # a bunch of roots and leaves
    ("flask_heal",  178),  # a test tube, small and carried
    ("flask_stone",179),  # a stoppered bottle
    ("flask_swift", 180),  # an oil amphora
    # Oswin, ironmonger
    ("whet",        223),  # a smith's hammer, working on what you own
    ("commission",   97),  # a sword: a weapon you do not have yet
    ("temper",      128),  # a shield
    ("oil",         211),  # a jug of bladeoil
    ("spring",      220),  # an hourglass, because it buys back time
    ("boots",       140),  # a boot
    # The Coinweigher, fortunes
    ("reroll",      196),  # a card turning over
    ("banish",      231),  # a ledger you are struck from
    ("charm",       146),  # a pendant on a cord
    ("lodestone",   161),  # a dark stone
    ("tithe",       208),  # a bag of coin
    ("effigy",      137),  # a doll for death to happen to
]
iset = load("system/IconSet.png")
cells = []
for _, idx in ICONS:
    c, r = idx % 16, idx // 16
    cells.append(iset.crop((c * ICON, r * ICON, c * ICON + ICON, r * ICON + ICON)))
save(sheet(cells, 6, ICON, ICON), "items.png")

# --- the manifest the game reads ------------------------------------------
print("\nprop cells (name, w, h):")
for m in manifest:
    print("  ", m)
print("\nicons:", [n for n, _ in ICONS])
print("signs:", [n for n, _, _ in SIGNS])
print()
print("folk atlas (index: who):")
for i, (sh, b, why) in enumerate(CROWD + MERCHANTS):
    print(f"  {i:2d}  {sh}:{b:<2} {why}")
