# ---------------------------------------------------------------------------
# build-ui-art.py - cut Grimfall's interface art out of the source packs.
#
#   python tools/assets/build-ui-art.py
#
# Run offline. The game ships only what this writes into img/ui/.
#
# Two packs, used for different things:
#
#   Tiny RPG "Mana Soul" GUI (CC0) is the frame language - navy and violet with
#   gold filigree. It was chosen over the flatter, brighter packs because it is
#   already Grimfall's palette: the menus and the world agree without either
#   being recoloured, which is the difference between an interface that belongs
#   to a game and one that was dropped on top of it.
#
#   Icons Essential (CC BY 4.0) supplies the 16x16 glyphs. Only the ones the
#   interface actually uses are packed, in a fixed order the stylesheet indexes
#   by background-position.
#
# Nothing is tinted. Every other art pipeline here tones its source down for
# brazier light, because that art sits in the world; interface art sits on a
# panel in front of it and dimming it only makes it muddy.
# ---------------------------------------------------------------------------
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "img", "ui")

# Where the unpacked source packs live. They are not in the repository - see
# the "IF YOU NEED TO RE-RUN THIS" section of img/ui/SOURCE.txt.
PACKS = os.environ.get(
    "GRIMFALL_UI_PACKS",
    r"C:\Users\alper\AppData\Local\Temp\claude\c--Users-alper-Documents-ThY-GAme"
    r"\23adc581-ca73-4acd-ada0-e08e6e89e55d\scratchpad\ui",
)
TINY = os.path.join(PACKS, "tinyRPG_manaSoulGUI_v_1_0")
ICONS = os.path.join(PACKS, "Icons_Essential", "Icons_Essential", "v1.2", "Icons")

os.makedirs(OUT, exist_ok=True)


def load(path):
    if not os.path.exists(path):
        sys.exit(
            f"missing source: {path}\n\n"
            "Unpack the four UI packs somewhere and point GRIMFALL_UI_PACKS at the\n"
            "folder holding them. See img/ui/SOURCE.txt for the download links."
        )
    return Image.open(path).convert("RGBA")


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, optimize=True)
    print(f"  {name:22s} {img.width:>4}x{img.height:<4} {os.path.getsize(p) // 1024:>4}kb")


# ---------------------------------------------------------------------------
# Frames
# ---------------------------------------------------------------------------
# Each is a 96x96 nine-slice. Twelve is the inset the stylesheet slices them at,
# measured rather than guessed: at twelve the corner flourish is whole and the
# edge ornament tiles seamlessly, and past about sixteen the source's own
# interior colour starts bleeding into the border strip and reads as a seam
# against the flat fill behind it.
#
# The centres are punched out. The interior is a flat CSS background instead, so
# a panel's fill is one value in the stylesheet rather than a colour baked into
# nine separate images - and so nothing tiles a gradient.
INSET = 12

FRAMES = [
    ("panel",    "20250420manaSoul9SlicesA-Sheet.png"),  # navy, flourished top and bottom
    ("card",     "20250420manaSoul9SlicesB-Sheet.png"),  # violet, ornament all round
    ("card-on",  "20250420manaSoul9SlicesC-Sheet.png"),  # the same, lit gold: selected
]

print("frames")
for name, src in FRAMES:
    im = load(os.path.join(TINY, src))
    w, h = im.size
    hole = Image.new("RGBA", (w - INSET * 2, h - INSET * 2), (0, 0, 0, 0))
    im.paste(hole, (INSET, INSET))          # paste, not alpha_composite: replace
    save(im, f"{name}.png")

# The interior colours, reported so the stylesheet's fills can be kept honest
# against the art rather than eyeballed.
print("\n  interior colours (for the stylesheet's --panel-fill etc.)")
for name, src in FRAMES:
    c = load(os.path.join(TINY, src)).getpixel((48, 48))
    print(f"    {name:10s} #{c[0]:02x}{c[1]:02x}{c[2]:02x}")

# ---------------------------------------------------------------------------
# Buttons
# ---------------------------------------------------------------------------
# One 384x22 strip of four 96x22 states, in the pack's order: rest, hover,
# pressed, disabled. They are split into four files because `border-image-source`
# takes one image, and a sprite sheet would mean re-deriving the offset in every
# rule that uses one.
print("\nbuttons")
BUTTON_STATES = ["", "-hover", "-down", "-off"]
strip = load(os.path.join(TINY, "20250421manaSoulButtonB-Sheet.png"))
bw = strip.width // 4
for i, suffix in enumerate(BUTTON_STATES):
    save(strip.crop((i * bw, 0, (i + 1) * bw, strip.height)), f"button{suffix}.png")

# ---------------------------------------------------------------------------
# Bars
# ---------------------------------------------------------------------------
# The empty track for health, experience and boss bars. The fill behind it is a
# flat CSS colour, so one frame serves every bar in the game.
print("\nbars")
save(load(os.path.join(TINY, "20250421barA-Sheet.png")), "bar.png")
save(load(os.path.join(TINY, "20250420manaSoulHeaderB-Sheet.png")), "header.png")

# ---------------------------------------------------------------------------
# Icons
# ---------------------------------------------------------------------------
# 16x16, packed one row per eight in a fixed order. `css/style.css` addresses
# them by background-position, so THIS ORDER IS THE API - append, never insert.
print("\nicons")
ICON_NAMES = [
    # row 0 - navigation and menus
    "Play", "PlayPause", "Home", "Gear", "Book", "Info", "Exit", "Restart",
    # row 1 - progress and the vault
    "Trophy", "Coin2", "ChestTreasure", "Team", "Locked", "Unlocked", "Skull", "Key",
    # row 2 - saving and files
    "FloppyDisk", "Upload", "Download", "Trashbin", "Document", "Enter", "Touch", "Gamepad",
    # row 3 - sound, wares, settings
    "SpeakerOn", "SpeakerMute", "MusicNotes", "ShoppingCart", "PotionRed", "Wrench", "Eye", "Sun",
]
ICON = 16
COLS = 8
rows = (len(ICON_NAMES) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * ICON, rows * ICON), (0, 0, 0, 0))
for i, n in enumerate(ICON_NAMES):
    cell = load(os.path.join(ICONS, f"{n}.png"))
    if cell.size != (ICON, ICON):
        sys.exit(f"icon {n} is {cell.size}, expected {ICON}x{ICON}")
    sheet.paste(cell, ((i % COLS) * ICON, (i // COLS) * ICON))
save(sheet, "icons.png")

print(f"\nicon order ({len(ICON_NAMES)}), as css/style.css indexes it:")
for i, n in enumerate(ICON_NAMES):
    print(f"  {i:>2}  col {i % COLS} row {i // COLS}   {n}")
