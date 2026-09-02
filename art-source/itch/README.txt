Store-page art
==============

These are for the itch.io project page, NOT for the game. They are kept out of
img/ on purpose: everything in img/ is downloaded by every player, and a store
banner nobody sees in-game is three megabytes of nothing.

  banner.png    1983x793   The page banner / cover art.
                itch asks for 630x500 for the thumbnail that appears in
                listings, and uses a wide image for the page header. Upload
                this as the cover; itch crops it for the thumbnail itself.

  preview.gif   500x400, 137 frames
                An animated preview for the page. itch shows GIFs in the
                screenshot strip and they autoplay in listings, which is worth
                more than a still.

Nothing here ships in the build. `tools/build.mjs` only copies src, css, img,
audio, fonts and video, and this folder is none of those.
