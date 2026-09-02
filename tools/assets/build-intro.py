# ---------------------------------------------------------------------------
# build-intro.py - prepare the opening cinematic for the web.
#
#   python tools/assets/build-intro.py                 rebuild from art-source/
#   python tools/assets/build-intro.py my-film.mp4     adopt a new film first
#
# The master lives in art-source/intro-source.mp4, which is not shipped. This
# writes video/intro.mp4, which is.
#
# WHAT IT DOES AND WHY
#
#   Re-encodes at CRF 26.  The film arrived at 4875 kb/s, which is a fine
#       bitrate for a download and a poor one for the first thing a phone has
#       to fetch before the menu appears. At CRF 26 it is about a sixth of the
#       size at 40.6 dB PSNR - past the point where the difference is visible
#       on this material. `main` profile at level 4.0 plays on old phones too.
#
#   Moves the index to the front.  `+faststart` puts the moov atom before the
#       media data, so playback can begin while the rest is still arriving.
#       Without it the browser waits for the whole file, which on a slow
#       connection is a black screen for as long as the download takes.
#
#   Mixes music under the film's own audio.  The film has a soundtrack of its
#       own (around -25 dB mean); this lays a score beneath it rather than
#       replacing it, and fades the score out under the last second and a half
#       so the cut to the menu is not abrupt.
#
# The browser plays this muted on a cold load - autoplay with sound needs a
# gesture that has not happened yet - and unmuted whenever the browser allows.
# `src/game/intro.js` tries sound first and falls back, so the mix is not
# wasted effort: it is heard by anyone who has clicked on the page before.
# ---------------------------------------------------------------------------
import os
import shutil
import subprocess
import sys

import imageio_ffmpeg

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(HERE, "art-source")
MASTER = os.path.join(ART, "intro-source.mp4")
OUT = os.path.join(HERE, "video", "intro.mp4")
SCORE = os.path.join(HERE, "audio", "boss-sovereign-intro.mp3")

CRF = "26"              # visually transparent here; see the PSNR note above
SCORE_LEVEL = 0.5       # the film's own audio stays in front
FADE = 1.5              # seconds of score fade at the end

FF = imageio_ffmpeg.get_ffmpeg_exe()
args = [a for a in sys.argv[1:] if not a.startswith("--")]

os.makedirs(ART, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

if args:
    src = os.path.abspath(args[0])
    if os.path.abspath(MASTER) != src:
        shutil.copyfile(src, MASTER)
        print("  adopted          %s -> art-source/intro-source.mp4"
              % os.path.relpath(src, HERE))

if not os.path.exists(MASTER):
    # The game draws its own cinematic when there is no film, so this is a
    # normal state, not a failure.
    print("  no art-source/intro-source.mp4 - nothing to build.")
    print("  The game will draw its own cinematic instead.")
    raise SystemExit(0)


def probe(path):
    out = subprocess.run([FF, "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    dur = 0.0
    has_audio = "Audio:" in out
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            dur = int(h) * 3600 + int(m) * 60 + float(s)
    return dur, has_audio


dur, film_has_audio = probe(MASTER)
before = os.path.getsize(MASTER)
print("  source           %.2fs, %.2f MB, audio: %s"
      % (dur, before / 1048576, "yes" if film_has_audio else "none"))

video = ["-c:v", "libx264", "-crf", CRF, "-preset", "slow",
         "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart"]

cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", MASTER]

if os.path.exists(SCORE):
    st = max(0.0, dur - FADE)
    cmd += ["-i", SCORE]
    if film_has_audio:
        chain = ("[1:a]volume=%s,afade=t=out:st=%.2f:d=%s[score];"
                 "[0:a][score]amix=inputs=2:duration=first:normalize=0[mix]"
                 % (SCORE_LEVEL, st, FADE))
        cmd += ["-filter_complex", chain, "-map", "0:v:0", "-map", "[mix]"]
        print("  score            %s under the film's own audio at %.0f%%"
              % (os.path.basename(SCORE), SCORE_LEVEL * 100))
    else:
        chain = "[1:a]volume=1.0,afade=t=out:st=%.2f:d=%s[mix]" % (st, FADE)
        cmd += ["-filter_complex", chain, "-map", "0:v:0", "-map", "[mix]"]
        print("  score            %s (the film had no audio of its own)"
              % os.path.basename(SCORE))
    cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]
else:
    print("  score            %s is missing - keeping the film's own audio"
          % os.path.relpath(SCORE, HERE))
    cmd += ["-c:a", "aac", "-b:a", "128k"]

cmd += video + ["-shortest", OUT]

r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-2000:])
    raise SystemExit("ffmpeg failed")

after = os.path.getsize(OUT)
print("  video/intro.mp4  %.2f MB  (%d%% smaller, faststart)"
      % (after / 1048576, 100 - after * 100 // before))
