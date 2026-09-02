Opening cinematic
=================

Drop a file called `intro.mp4` in this folder and the game plays it at launch,
before the title screen, instead of the cinematic it draws for itself. No code
change is needed: `src/game/intro.js` checks for the file on boot and uses it
if it is there.

WHAT TO SUPPLY
  intro.mp4     H.264 video, AAC audio, in an MP4 container. That combination
                plays everywhere; almost nothing else does.

WHAT TO AIM FOR
  Length        10-20 seconds. It is skippable with any key, click or tap, but
                a long intro is resented before it is skipped.
  Size          Under about 8 MB. It is downloaded before the menu appears, and
                on a phone every megabyte here is a second of black screen.
  Shape         Any. It is letterboxed to fit rather than cropped, so nothing
                important is lost on an unusual viewport.
  Sound         Autoplay is only permitted muted, so the video is played muted.
                Anything the film needs to say has to be on screen.

IF THE FILE IS NOT HERE
  The game draws its own four-beat cinematic instead - see `src/game/intro.js`.
  That is the version that ships today. Nothing errors, nothing waits, and the
  player cannot tell that a file was looked for.
