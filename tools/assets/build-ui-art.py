# ---------------------------------------------------------------------------
# build-ui-art.py - cut Grimfall's interface art out of the source packs.
#
#   python tools/assets/build-ui-art.py
#
# Run offline. The game ships only what this writes into img/ui/.
#
# THE THEME
#
#   "Free Basic Pixel Art UI for RPG" (CraftPix) is the interface: a wood frame
#   round a parchment body, a green header bar carrying the title and a close
#   button, and solid green buttons. It is a complete kit rather than a set of
#   frames, which matters - the settings rows, the checkboxes, the dropdown and
#   the slot squares are all drawn by the same hand as the panel they sit in,
#   and an interface assembled from four packs never quite looks like one thing.
#
#   It also reads better. The old theme was pale type on dark violet; this is
#   near-black on parchment, which is the contrast every guide on game UI asks
#   for and which survives being played on a phone in daylight.
#
# WHAT ELSE IS HERE, AND WHY IT IS NOT FROM THAT PACK
#
#   Travel Book (CC BY 4.0) supplies the market's slot frames and the mouse
#   pointer. The Long Market is the one place in this game that is a PLACE
#   rather than a menu, and leather against parchment says so.
#
#   Icons Essential (CC BY 4.0) supplies the 16x16 glyphs, packed in a fixed
#   order the stylesheet indexes by background-position.
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
RPG = os.path.join(PACKS, "basicrpg", "PNG")
ICONS = os.path.join(PACKS, "Icons_Essential", "Icons_Essential", "v1.2", "Icons")
BOOK = os.path.join(PACKS, "Complete_UI_Book_Styles_Pack_Free",
                    "Complete_UI_Book_Styles_Pack_Free_v1.0", "01_TravelBookLite", "Sprites")

os.makedirs(OUT, exist_ok=True)


def load(path):
    if not os.path.exists(path):
        sys.exit(
            f"missing source: {path}\n\n"
            "Unpack the UI packs somewhere and point GRIMFALL_UI_PACKS at the\n"
            "folder holding them. See img/ui/SOURCE.txt for the download links."
        )
    return Image.open(path).convert("RGBA")


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, optimize=True)
    print(f"  {name:22s} {img.width:>4}x{img.height:<4} {os.path.getsize(p) // 1024:>4}kb")


def punch(im, inset):
    """Clear the middle so the interior is a flat CSS colour, not a tiled image."""
    im = im.copy()
    im.paste(Image.new("RGBA", (im.width - inset * 2, im.height - inset * 2), (0, 0, 0, 0)),
             (inset, inset))
    return im


def scale(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


# The kit is DRAWN small and MEANT to be shown big: its wood frame is four
# pixels and its buttons are twelve tall. At 1:1 in a browser that frame is a
# hairline and the whole thing reads as a thin cartoon outline rather than the
# chunky woodwork in the reference screenshots - which are all of this kit at
# about 3x.
#
# So the frames are exported pre-scaled with nearest-neighbour rather than left
# for CSS to enlarge. `border-image` does NOT honour `image-rendering:
# pixelated` consistently when it scales slices, so letting CSS do it gives
# smoothed, half-pixel edges - the exact failure this interface is built to
# avoid. Scaling here, once, with a known-integer factor, cannot go soft.
UI = 3


# ---------------------------------------------------------------------------
# The panel, and its header
# ---------------------------------------------------------------------------
# Both are cut out of the empty Settings panel, which is the kit's canonical
# window. Measured off the source rather than eyeballed:
#
#   x 7..10    wood border, 4px          y 0..13    the green header bar
#   x 11..100  parchment body            y 14..148  the body, wood-framed
#   x 101..104 wood border, 4px
#
# The header's own X sits at x 92..101, so the header is cut to the LEFT of it
# and the close button is a separate sprite. Baking a button into a nine-slice
# would put it in the middle of every wide panel.
SET = load(os.path.join(RPG, "Settings.png"))

print(f"panel (everything exported at {UI}x)")
PANEL_INSET = 8            # comfortably past the 4px border, whole corner
save(scale(punch(SET.crop((7, 14, 105, 149)), PANEL_INSET), UI), "panel.png")
save(scale(SET.crop((7, 0, 92, 14)), UI), "head.png")

print("\n  key colours (the stylesheet's fills are these, not values near them)")
for label, xy in [("parchment", (56, 80)), ("head", (56, 6)),
                  ("wood", (8, 80)), ("wood-lit", (10, 80))]:
    c = SET.getpixel(xy)
    print(f"    {label:11s} #{c[0]:02x}{c[1]:02x}{c[2]:02x}")

# ---------------------------------------------------------------------------
# The close button
# ---------------------------------------------------------------------------
# Lifted out of the header and doubled, because at 10x12 it is below the size a
# finger can reliably hit. The pack draws no second state for it, so hover is
# the same sprite on a lit plate, done in CSS.
print("\nclose button")
save(scale(SET.crop((92, 1, 102, 13)), UI), "close.png")

# ---------------------------------------------------------------------------
# Buttons
# ---------------------------------------------------------------------------
# The kit ships buttons at fixed widths with their labels drawn in. These are
# the four plain ones, which nine-slice to any width:
#
#   rest    medium green with the tan underline
#   hover   light green with the tan underline
#   down    medium green with NO underline - the button has sunk onto the page
#   off     rest, desaturated, since the pack draws no disabled state
#
# All four are padded to the same height so a button does not change size when
# the pointer touches it.
BTN = load(os.path.join(RPG, "Buttons.png"))
BTN_H = 12

def button(box):
    im = BTN.crop((box[0], box[1], box[0] + box[2], box[1] + box[3]))
    if im.height < BTN_H:                      # the no-underline variants are 11px
        pad = Image.new("RGBA", (im.width, BTN_H), (0, 0, 0, 0))
        pad.paste(im, (0, 0))
        im = pad
    return im

def desaturate(im, keep=0.25, dim=0.72):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            grey = int(0.299 * r + 0.587 * g + 0.114 * b)
            px[x, y] = (int((grey + (r - grey) * keep) * dim),
                        int((grey + (g - grey) * keep) * dim),
                        int((grey + (b - grey) * keep) * dim), a)
    return out

print("\nbuttons")
rest = button((13, 418, 56, 12))
save(scale(rest, UI), "button.png")
save(scale(button((173, 434, 56, 12)), UI), "button-hover.png")
save(scale(button((93, 419, 56, 11)), UI), "button-down.png")
save(scale(desaturate(rest), UI), "button-off.png")

# ---------------------------------------------------------------------------
# Slots and controls
# ---------------------------------------------------------------------------
# The squares the kit uses for inventory cells and checkboxes. `slot` is the
# empty one, `slot-on` the filled one; the stylesheet uses the pair for both
# jobs, which is what the kit does too.
print("\nslots and controls")
# The kit draws these squares in two materials: brown for an empty socket and
# green for a filled or checked one. The first pass took the wrong coordinate
# and every health bar in the game came out as a green checkbox.
slot = SET.crop((224, 195, 237, 208))          # brown, empty
save(scale(punch(slot, 5), UI), "slot.png")
save(scale(SET.crop((3, 204, 16, 217)), UI), "slot-on.png")   # green, filled
save(scale(SET.crop((160, 195, 173, 208)), UI), "dropdown.png")

# The bar track is the slot frame. The kit's own health plate is a fixed
# composite with a portrait socket and an angled end - handsome, and impossible
# to stretch to an arbitrary width. The slot is the same wood in a shape that
# nine-slices, so a bar and an inventory cell are visibly the same material.
save(scale(punch(slot, 5), UI), "bar.png")

# The kit's bar fills, sampled off character_panel.png so the stylesheet's
# health red is the artist's red rather than one chosen next to it.
CHAR = load(os.path.join(RPG, "character_panel.png"))
print("  bar fills")
for label, xy in [("red", (20, 138)), ("blue", (20, 143)), ("green", (20, 148))]:
    c = CHAR.getpixel(xy)
    print(f"    {label:6s} #{c[0]:02x}{c[1]:02x}{c[2]:02x}")

# ---------------------------------------------------------------------------
# The market, and the pointer
# ---------------------------------------------------------------------------
# A different pack on purpose. The Travel Book set is leather and dark paper
# where the RPG kit is wood and parchment, and the Long Market is the one place
# in this game that is a PLACE rather than an interface - a square with stalls
# and traders in it. Giving its wares a different material says that without a
# word of explanation.
SLOT_INSET = 6

print("\nmarket")
for name, src in [("market-card", "UI_TravelBook_Slot01a.png"),
                  ("market-card-on", "UI_TravelBook_Slot01b.png")]:
    save(punch(load(os.path.join(BOOK, src)), SLOT_INSET), f"{name}.png")

print("  interior colours")
for name, src in [("market-card", "UI_TravelBook_Slot01a.png"),
                  ("market-card-on", "UI_TravelBook_Slot01b.png")]:
    c = load(os.path.join(BOOK, src)).getpixel((15, 15))
    print(f"    {name:16s} #{c[0]:02x}{c[1]:02x}{c[2]:02x}")

# ---------------------------------------------------------------------------
# The pointer
# ---------------------------------------------------------------------------
# Doubled, because a 14x16 cursor is a speck on a modern display and browsers
# will not scale one for you - whatever the file is, is what is drawn.
# Nearest-neighbour, so it stays pixel art rather than becoming a smear.
#
# Five files, not two. The click is ANIMATED: the pack's animation sheet has a
# row where the arrow recoils and throws a small spark, and CSS cannot animate
# `cursor`, so the frames are exported separately and main.js swaps between
# them. That only works if the arrow does not move between files, which is what
# the shared box below is for - the frames carry sparks that reach further than
# the arrow does, so cropping each one to its own ink would make the pointer
# jump a few pixels on every click. One box, one hotspot, for all five.
print("\ncursor")
ANIM = os.path.join(PACKS, "Complete_UI_Book_Styles_Pack_Free",
                    "Complete_UI_Book_Styles_Pack_Free_v1.0", "01_TravelBookLite",
                    "Spritesheet", "UI_TravelBookAnimated_Spritesheet01a.png")
CELL = 32
TAP_ROW = 4                  # fifth row of the sheet, counting from one
TAP_FRAMES = 3               # the fourth frame is the arrow at rest, i.e. cursor.png

sheet = load(ANIM)
taps = [sheet.crop((c * CELL, TAP_ROW * CELL, (c + 1) * CELL, (TAP_ROW + 1) * CELL))
        for c in range(TAP_FRAMES + 1)]

# The union of the frames, so every one of them fits the same canvas.
box = [min(t.getbbox()[i] for t in taps) if i < 2 else max(t.getbbox()[i] for t in taps)
       for i in range(4)]
BOX = (box[2] - box[0], box[3] - box[1])

# Where the arrow sits inside that box, taken from the frame that is only the
# arrow. The two still cursors are that same drawing, so they are pasted at the
# same offset and the hotspot is one number for the whole set.
rest = taps[TAP_FRAMES].getbbox()
AT = (rest[0] - box[0], rest[1] - box[1])
HOT = ((AT[0] + 1) * 2, (AT[1] + 1) * 2)     # the tip, in the doubled image


def on_box(im):
    plate = Image.new("RGBA", BOX, (0, 0, 0, 0))
    plate.alpha_composite(im, AT)
    return scale(plate, 2)


for name, src in [("cursor", "UI_TravelBook_Cursor01c.png"),
                  ("cursor-press", "UI_TravelBook_Cursor01d.png")]:
    save(on_box(load(os.path.join(BOOK, src))), f"{name}.png")
for i in range(TAP_FRAMES):
    save(scale(taps[i].crop(box), 2), f"cursor-tap{i + 1}.png")

print(f"    box {BOX[0]}x{BOX[1]}, arrow at {AT} — css/style.css must use "
      f"hotspot `{HOT[0]} {HOT[1]}` on all five")

# ---------------------------------------------------------------------------
# The pause glyph
# ---------------------------------------------------------------------------
# The HUD's pause button was an inline SVG - two sharp vector bars, the only
# thing in the interface that was not drawn by hand at a whole pixel, sitting
# on screen for the entire run. This is the book kit's own pause, which has the
# rounded corners the rest of the kit has. It is its own file rather than a cell
# in icons.png because it is not 16x16 and does not belong to that grid.
print("\npause")
save(scale(load(os.path.join(BOOK, "UI_TravelBook_IconPause01a.png")), 2), "pause.png")

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
