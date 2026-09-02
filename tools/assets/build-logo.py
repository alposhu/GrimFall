# ---------------------------------------------------------------------------
# build-logo.py - turn the logo artwork into the files the game ships.
#
#   python tools/assets/build-logo.py                 rebuild from art-source/
#   python tools/assets/build-logo.py img/logo.png    adopt a new drawing first
#   python tools/assets/build-logo.py new.png --lift  ...and invert its ink
#
# The master lives in art-source/logo.png, which is not shipped. Everything in
# img/ is generated from it, so dropping a new drawing in and re-running this is
# the whole workflow.
#
# TWO THINGS CAN NEED DOING, and only one of them is automatic.
#
#   The plate.  If the artwork arrives on an opaque background it is keyed out
#               by flood-filling inward from the border, not by thresholding
#               brightness - a threshold punches holes through light parts of
#               the artwork itself. If it already has an alpha cutout, it is
#               left alone. This is detected and needs no flag.
#
#   The ink.    Artwork drawn for print is dark ink on white, and dark ink is
#               invisible on this game's near-black interface, so it has to be
#               inverted to bone. Artwork drawn for a dark interface is often
#               *also* mostly dark - its legibility comes from specular edges
#               rather than from overall brightness - and inverting that ruins
#               it. No measurement separates the two reliably: the second logo
#               this game had was darker than the first by every percentile and
#               read better. So this is `--lift`, off by default, and the script
#               writes art-source/logo-preview.png showing the result on the
#               real interface colour so the choice can be checked by eye.
# ---------------------------------------------------------------------------
import os
import shutil
import sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(HERE, "art-source")
IMG = os.path.join(HERE, "img")
MASTER = os.path.join(ART, "logo.png")

BONE = (222, 214, 196)      # what near-black ink becomes when lifted
PLATE_TOL = 26              # how far from the border colour still counts as plate
UI_BG = (11, 8, 18)         # --bg in css/style.css; what it is judged against

args = [a for a in sys.argv[1:] if not a.startswith("--")]
lift = "--lift" in sys.argv

os.makedirs(ART, exist_ok=True)

# --- adopt a new drawing ---------------------------------------------------
if args:
    src = os.path.abspath(args[0])
    if os.path.abspath(MASTER) != src:
        Image.open(src)                       # fail early if it is not an image
        shutil.copyfile(src, MASTER)
        print(f"  adopted          {os.path.relpath(src, HERE)} -> art-source/logo.png")

img = Image.open(MASTER).convert("RGBA")
w, h = img.size
print(f"  source           {w}x{h}")

# --- the plate -------------------------------------------------------------
alpha = img.getchannel("A")
clear = sum(1 for v in alpha.getdata() if v < 8) / (w * h)

if clear > 0.02:
    print(f"  plate            already cut out ({clear * 100:.0f}% transparent)")
else:
    flat = img.convert("RGB")
    MARK = (255, 0, 255)
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if flat.getpixel((x, y)) != MARK:
                ImageDraw.floodfill(flat, (x, y), MARK, thresh=PLATE_TOL)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if flat.getpixel((x, y)) != MARK:
                ImageDraw.floodfill(flat, (x, y), MARK, thresh=PLATE_TOL)

    ip, fp = img.load(), flat.load()
    cut = 0
    for y in range(h):
        for x in range(w):
            if fp[x, y] == MARK:
                ip[x, y] = (0, 0, 0, 0)
                cut += 1
    # Soften the cut edge by a pixel so serifs do not look chewed.
    img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(0.6)))
    print(f"  plate            flood-filled away ({cut * 100 // (w * h)}% of the image)")

# --- the ink ---------------------------------------------------------------
if lift:
    ip = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = ip[x, y]
            if a == 0:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / 255.0
            lum = (r * 299 + g * 587 + b * 114) / 1000.0
            if sat < 0.16:
                # Grey ink: invert its darkness into bone, keeping the shading.
                k = 1.0 - min(1.0, lum / 190.0)
                t = 0.35 + 0.65 * k
                ip[x, y] = (int(r + (BONE[0] - r) * t),
                            int(g + (BONE[1] - g) * t),
                            int(b + (BONE[2] - b) * t), a)
            elif lum < 110:
                # Coloured but dark: brighten without touching the hue.
                f = 110.0 / max(1.0, lum)
                ip[x, y] = (min(255, int(r * f)), min(255, int(g * f)),
                            min(255, int(b * f)), a)
    print("  ink              lifted to bone (--lift)")
else:
    print("  ink              left as drawn (pass --lift if it is dark on white)")

# --- trim, scale, write ----------------------------------------------------
img = img.crop(img.getbbox())
print(f"  trimmed to       {img.width}x{img.height}")


def fit(im, width):
    return im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)


def write(im, name, where=IMG):
    p = os.path.join(where, name)
    im.save(p, optimize=True)
    print(f"  {name:20s} {im.width}x{im.height}  {os.path.getsize(p) // 1024}kb")
    return p


write(fit(img, 900), "logo.png")
write(fit(img, 420), "logo-small.png")

# App icons get the EMBLEM, not the lockup. At 192px the whole logo renders the
# wordmark as an illegible smear, and an icon has one job: be recognised at the
# size of a fingernail. These fractions frame the crescent, the sword and both
# swirls, and stop above the letters - they are tied to this artwork's layout,
# so a logo with a different arrangement needs them looked at again. The proof
# below is there to make that obvious rather than subtle.
MARK_BOX = (0.27, 0.00, 0.73, 0.56)     # left, top, right, bottom, as fractions

lw, lh = img.size
mark = img.crop((int(lw * MARK_BOX[0]), int(lh * MARK_BOX[1]),
                 int(lw * MARK_BOX[2]), int(lh * MARK_BOX[3])))
mark = mark.crop(mark.getbbox())
print(f"  emblem           {mark.width}x{mark.height} (for the app icons)")

for size in (192, 512):
    icon = Image.new("RGBA", (size, size), UI_BG + (255,))
    k = min(size * 0.9 / mark.width, size * 0.9 / mark.height)
    art = mark.resize((max(1, round(mark.width * k)), max(1, round(mark.height * k))),
                      Image.LANCZOS)
    icon.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    write(icon, f"icon-{size}.png")

# --- the proof -------------------------------------------------------------
# On the real interface colour, at the real title-screen size. If the wordmark
# is hard to read here it will be hard to read in the game.
shown = fit(img, 440)
proof = Image.new("RGBA", (shown.width + 140 + 192, shown.height + 120), UI_BG + (255,))
proof.alpha_composite(shown, (60, 60))
# The 192px icon beside it, at its real size, so both decisions are checked in
# one look: is the wordmark readable, and is the mark recognisable that small.
proof.alpha_composite(Image.open(os.path.join(IMG, "icon-192.png")).convert("RGBA"),
                      (shown.width + 100, 60))
proof.convert("RGB").save(os.path.join(ART, "logo-preview.png"))
print("\n  art-source/logo-preview.png  <- title screen size, and the app icon")
