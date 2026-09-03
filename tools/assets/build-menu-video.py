# ---------------------------------------------------------------------------
# build-menu-video.py - prepare the title screen's moving backdrop.
#
#   python tools/assets/build-menu-video.py                rebuild from art-source/
#   python tools/assets/build-menu-video.py scene.webm     adopt a new film first
#
# The master lives in art-source/menu-source.webm, which is not shipped. This
# writes video/menu.mp4, which is.
#
# WHAT IT DOES AND WHY
#
#   Halves the resolution.  The master is 1920x1080. It plays behind a menu,
#       under a dark scrim, on a canvas that is often smaller than 720p anyway;
#       the extra pixels cost bandwidth on the first screen of the game and buy
#       nothing anybody can see.
#
#   Drops the audio.  The title screen already has a score. Two pieces of music
#       at once is not atmosphere, it is a mistake. It matters that the track is
#       removed rather than merely silenced: muted autoplay is allowed without a
#       user gesture and unmuted autoplay is not, so a backdrop with an audio
#       track is a backdrop that might not start.
#
#   Writes H.264 only.  This began by writing VP9 as well, on the usual
#       assumption that WebM would be the smaller file and MP4 the compatibility
#       fallback. Measured, it was the other way round:
#
#           VP9/WebM   1.49 MB   43.0 dB PSNR
#           H.264/MP4  0.74 MB   41.1 dB PSNR
#
#       Both are past the point where the difference is visible, let alone
#       visible through a scrim, and the H.264 file is half the size AND the one
#       that plays on the older iOS Safari that has no VP9 at all. Shipping both
#       would have been a second file to keep in sync that loses on every axis.
#
#   Moves the index to the front.  `+faststart` puts the moov atom before the
#       media data so playback starts while the rest is still arriving. Without
#       it the title screen is a black rectangle for the length of the download.
# ---------------------------------------------------------------------------
import os
import shutil
import subprocess
import sys

import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "art-source")
MASTER = os.path.join(ART, "menu-source.webm")
OUT = os.path.join(ROOT, "video", "menu.mp4")

HEIGHT = 720          # the master is 1080p; this plays under a scrim
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def run(args):
    r = subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *args],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ffmpeg failed:\n{r.stderr.strip()[:1500]}")


def mb(path):
    return os.path.getsize(path) / 1e6


# --- adopt a new master, if one was handed over ----------------------------
if len(sys.argv) > 1:
    src = os.path.abspath(sys.argv[1])
    if not os.path.exists(src):
        sys.exit(f"no such file: {src}")
    os.makedirs(ART, exist_ok=True)
    if src != os.path.abspath(MASTER):
        shutil.copy2(src, MASTER)
        print(f"adopted {os.path.basename(src)} -> art-source/menu-source.webm")

if not os.path.exists(MASTER):
    sys.exit(
        f"missing master: {MASTER}\n\n"
        "Put the scene there, or pass it as an argument:\n"
        "  python tools/assets/build-menu-video.py path/to/scene.webm"
    )

os.makedirs(os.path.dirname(OUT), exist_ok=True)
print(f"master  {mb(MASTER):.2f} MB")

run(["-i", MASTER, "-an", "-vf", f"scale=-2:{HEIGHT}:flags=lanczos",
     "-c:v", "libx264", "-profile:v", "main", "-level", "4.0",
     "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p",
     "-movflags", "+faststart", OUT])

print(f"menu    {mb(OUT):.2f} MB   H.264, {HEIGHT}p, silent")
print("\nThe title screen plays it muted, looped and playsinline, and hides it")
print("entirely under `prefers-reduced-motion`.")
