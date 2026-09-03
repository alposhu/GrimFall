# ---------------------------------------------------------------------------
# build-logo.py - draw the Grimfall wordmark, and everything cut from it.
#
#   python tools/assets/build-logo.py
#
# Run offline. Writes img/logo.png, img/logo-small.png, the two app icons and
# the two repository images.
#
# The mark is TYPE, not a picture. It is set in "{PixelFlag}" by NAL, a
# FontStruct pixel face whose characteristic is a rule running above and below
# the word - the word arrives already looking like a banner, which is why it can
# carry a title screen without anything drawn around it.
#
# Everything here is pixel-exact on purpose:
#
#   - the face is rendered at 16px, the size its author specifies for pixel
#     use, and then upscaled by a whole number with nearest-neighbour. Rendering
#     large and letting the rasteriser hint it would produce soft, uneven stems,
#     which is the one thing a pixel logo cannot have.
#   - the outline is a dilation of the glyph mask by whole pixels at the SOURCE
#     scale, so it stays exactly one pixel thick after upscaling instead of
#     becoming one-and-a-bit.
#
# There is no glow, no bevel and no gradient. The face has a strong silhouette;
# lighting effects on top of pixel type are what make a logo look generated.
# ---------------------------------------------------------------------------
import os
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
IMG = os.path.join(ROOT, "img")
GH = os.path.join(ROOT, ".github")

FONT = os.environ.get(
    "GRIMFALL_LOGO_FONT",
    r"C:\Users\alper\AppData\Local\Temp\claude\c--Users-alper-Documents-ThY-GAme"
    r"\23adc581-ca73-4acd-ada0-e08e6e89e55d\scratchpad\ui\pixelflag\{PixelFlag}.ttf",
)
BASE = 16                      # the size the font's author specifies for pixel use

# Grimfall's palette, so the mark and the interface are the same two colours.
GOLD = (255, 215, 94)
GOLD_DEEP = (201, 146, 42)
INK = (13, 10, 20)
VOID = (11, 8, 18)

WORD = "GRIMFALL"


def face(size=BASE):
    if not os.path.exists(FONT):
        sys.exit(
            f"missing font: {FONT}\n\n"
            "Point GRIMFALL_LOGO_FONT at {PixelFlag}.ttf. See img/SOURCE.txt for\n"
            "where it comes from and its licence."
        )
    return ImageFont.truetype(FONT, size)


def draw_word(text, size=BASE):
    """The bare glyphs, tight-cropped, as a white-on-transparent mask."""
    f = face(size)
    probe = Image.new("L", (8, 8))
    box = ImageDraw.Draw(probe).textbbox((0, 0), text, font=f)
    pad = 4
    w = box[2] - box[0] + pad * 2
    h = box[3] - box[1] + pad * 2
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).text((pad - box[0], pad - box[1]), text, font=f, fill=255)
    return m.crop(m.getbbox())


def grow(mask, px):
    """Dilate a mask by `px` whole pixels — the outline, at source scale."""
    out = mask.copy()
    for _ in range(px):
        w, h = out.size
        bigger = Image.new("L", (w + 2, h + 2), 0)
        for dx, dy in ((0, 1), (2, 1), (1, 0), (1, 2), (1, 1)):
            bigger.paste(out, (dx, dy), out)
        out = bigger
    return out


def wordmark(text=WORD, scale=6):
    """
    The mark: gold glyphs on a one-pixel ink outline.

    There is no drop shadow. There was, and it was invisible - a near-black
    offset against a near-black page does nothing but add weight to the file.
    The outline is what the mark actually needs, and it earns its place: the
    intro draws this over a field of moving embers, where gold on gold would
    otherwise dissolve.

    Assembled at source scale and upscaled once at the end, so every edge lands
    on a whole pixel.
    """
    glyphs = draw_word(text)
    outline = grow(glyphs, 1)
    art = Image.new("RGBA", outline.size, (0, 0, 0, 0))
    art.paste(Image.new("RGBA", outline.size, INK + (255,)), (0, 0), outline)
    art.paste(Image.new("RGBA", glyphs.size, GOLD + (255,)), (1, 1), glyphs)
    return art.resize((art.width * scale, art.height * scale), Image.NEAREST)


def stacked_mark(scale, box):
    """
    A square mark for the app icon. A wide word cannot be an icon, so it is set
    on two lines and framed - which is also the only place the interface's own
    frame art appears outside the interface.
    """
    top = draw_word("GRIM")
    bot = draw_word("FALL")
    gap = 3
    w = max(top.width, bot.width)
    h = top.height + gap + bot.height
    both = Image.new("L", (w, h), 0)
    both.paste(top, ((w - top.width) // 2, 0))
    both.paste(bot, ((w - bot.width) // 2, top.height + gap))

    outline = grow(both, 1)
    art = Image.new("RGBA", outline.size, (0, 0, 0, 0))
    art.paste(Image.new("RGBA", outline.size, INK + (255,)), (0, 0), outline)
    art.paste(Image.new("RGBA", both.size, GOLD + (255,)), (1, 1), both)
    art = art.resize((art.width * scale, art.height * scale), Image.NEAREST)

    icon = Image.new("RGBA", (box, box), VOID + (255,))
    # A plain double rule rather than the interface's filigree: at 192px the
    # filigree is one pixel wide and reads as noise.
    d = ImageDraw.Draw(icon)
    edge = max(2, box // 32)
    d.rectangle([edge, edge, box - edge - 1, box - edge - 1], outline=GOLD_DEEP, width=max(1, box // 64))
    d.rectangle([edge * 2, edge * 2, box - edge * 2 - 1, box - edge * 2 - 1],
                outline=GOLD, width=max(1, box // 96))

    inner = box - edge * 5
    if art.width > inner or art.height > inner:
        k = min(inner / art.width, inner / art.height)
        art = art.resize((max(1, int(art.width * k)), max(1, int(art.height * k))), Image.NEAREST)
    icon.paste(art, ((box - art.width) // 2, (box - art.height) // 2), art)
    return icon


def banner(width, height, mark, tag=None):
    """A wide plate for the repository and the store: the mark, centred, on void."""
    bg = Image.new("RGB", (width, height), VOID)
    d = ImageDraw.Draw(bg)
    rule = max(1, height // 120)
    d.rectangle([0, 0, width - 1, rule - 1], fill=GOLD_DEEP)
    d.rectangle([0, height - rule, width - 1, height - 1], fill=GOLD_DEEP)

    k = min((width * 0.74) / mark.width, (height * 0.5) / mark.height)
    m = mark.resize((max(1, int(mark.width * k)), max(1, int(mark.height * k))), Image.NEAREST)
    y = (height - m.height) // 2 - (height // 14 if tag else 0)
    bg.paste(m, ((width - m.width) // 2, y), m)

    if tag:
        # Set at the face's own pixel size and upscaled by a whole number, for
        # the same reason the mark is: asked for 15px directly, this face hints
        # into an uneven mush.
        t = draw_word(tag)
        k = max(1, int(width * 0.42 / max(1, t.width)))
        t = t.resize((t.width * k, t.height * k), Image.NEAREST)
        plate = Image.new("RGBA", t.size, (185, 176, 207, 255))
        bg.paste(plate, ((width - t.width) // 2, y + m.height + height // 14), t)
    return bg


def save(img, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, **kw)
    print(f"  {os.path.relpath(path, ROOT).replace(os.sep, '/'):32s} "
          f"{img.width:>4}x{img.height:<4} {os.path.getsize(path) // 1024:>4}kb")


print("wordmark")
mark = wordmark(scale=6)
save(mark, os.path.join(IMG, "logo.png"))
save(wordmark(scale=3), os.path.join(IMG, "logo-small.png"))

print("\napp icons")
save(stacked_mark(scale=4, box=192), os.path.join(IMG, "icon-192.png"))
save(stacked_mark(scale=10, box=512), os.path.join(IMG, "icon-512.png"))

print("\nrepository")
save(banner(1280, 400, mark, "Survive twenty minutes"),
     os.path.join(GH, "banner.jpg"), quality=92, optimize=True)
save(banner(1280, 640, mark, "A browser roguelite by Alperen Karabiyik"),
     os.path.join(GH, "social-preview.jpg"), quality=92, optimize=True)

print("\nDone. The wordmark is type, not a drawing: re-run this after any change")
print("to the face or the palette rather than editing the PNGs.")
