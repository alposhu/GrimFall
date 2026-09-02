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
    s = tone(s, 0.80, (54, 38, 44), 0.10)
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
    ("People2", 3, "serving girl with a headband"),
    ("People2", 6, "tinker with goggles"),
    ("People3", 4, "grey-haired man in a brown coat"),
    ("People4", 0, "man in a plaid waistcoat"),
    ("People4", 4, "farmer in a straw hat"),
    ("People4", 5, "woman in an orange headscarf"),
    ("People4", 6, "woman in a brown work coat"),
]
# The three traders, after the crowd so the crowd's indices stay 0..14.
MERCHANTS = [
    ("People2", 4, "oswin - bearded, sleeves rolled up"),
    ("People4", 1, "marta - white-haired, in an apron"),
    ("People2", 0, "coinweigher - an old man in gold"),
]

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
