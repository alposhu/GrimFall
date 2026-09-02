# ---------------------------------------------------------------------------
# import-rtp-audio.py - copy the RPG Maker MZ sound effects the game uses.
#
#   python tools/assets/import-rtp-audio.py
#
# The MZ sounds ship as Ogg Vorbis and stay that way: they are already small
# and already compressed, and there is no encoder on this machine that could
# make a WAV of them smaller. Every browser the game targets decodes Vorbis;
# where one does not, `audio.js` falls through to the take it shipped as WAV,
# and failing that to the synthesised bank. Nothing here is load-bearing.
#
# Names follow the bank's own convention: `<event>-<take>.<ext>`. The MZ clips
# come in as take 2, so each boss keeps its Pixel Combat take 1 and the game
# alternates between them.
# ---------------------------------------------------------------------------
import os, shutil

SE = r"C:\Users\alper\OneDrive\Documenten\RMMZ\the_game\audio\se"
BGS = r"C:\Users\alper\OneDrive\Documenten\RMMZ\the_game\audio\bgs"
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SFX = os.path.join(HERE, "audio", "sfx")
AUDIO = os.path.join(HERE, "audio")

# Each boss gets a voice of its own: a roar to arrive on, a wind-up, a hit and
# a death. Picked so that the five are still distinguishable with eyes shut.
BOSS = {
    "magus":      {"arrive": "Devil2",   "cast": "Magic8",    "attack": "Magic3",   "die": "Monster5"},
    "demon":      {"arrive": "Devil1",   "cast": "Fire3",     "attack": "Monster2", "die": "Devil3"},
    "frosttitan": {"arrive": "Monster7", "cast": "Ice5",      "attack": "Ice9",     "die": "Collapse2"},
    "sovereign":  {"arrive": "Monster8", "cast": "Darkness4", "attack": "Monster4", "die": "Monster10"},
    # The dragon has three moves the others do not, and its fire is fire.
    "parduin":    {"arrive": "Monster1", "cast": "Fire5",     "attack": "Monster3", "die": "Monster6",
                   "breath": "Fire9",    "wing": "Wind7",     "land": "Earth3"},
}

# A few general events get a second voice from the same library.
GENERAL = {
    # A soft explosion for the player's own blasts. The firebomb goes off every
    # second or so and the old `boom` was a full-weight detonation - fine once,
    # abrasive on a loop. These are dull, low impacts with no crack in them.
    "thud-1":    "Blow3",
    "thud-2":    "Earth1",
    # Mjolnir: the throw, and the ring when it lands a hit.
    "hammer-1":  "Hammer",
    "hammer-2":  "Blow5",
    "boss-2b":   "Monster9",     # any boss that has no art of its own yet
    "spawn-3":   "Darkness1",
    "boom-4":    "Explosion3",
    "zap-3":     "Thunder6",
    "frost-3":   "Ice2",
    "chest-3":   "Chest1",
    "gold-3":    "Coin",
    "buy-3":     "Shop1",
    "levelup-3": "Up4",
    "save-2":    "Save1",
    "revive-2":  "Saint5",
}

copied = 0
total = 0

def take(dst, src_name, folder=SE):
    global copied, total
    src = os.path.join(folder, src_name + ".ogg")
    total += 1
    if not os.path.exists(src):
        print(f"  MISSING {src_name}.ogg")
        return
    shutil.copyfile(src, os.path.join(SFX, dst))
    copied += 1

print("boss voices:")
for boss, events in BOSS.items():
    for ev, clip in events.items():
        take(f"boss-{boss}-{ev}-2.ogg", clip)
        print(f"  boss-{boss}-{ev}-2.ogg  <- {clip}.ogg")

print("general:")
for dst, clip in GENERAL.items():
    name = dst if dst != "boss-2b" else "boss-3"
    take(f"{name}.ogg", clip)
    print(f"  {name}.ogg  <- {clip}.ogg")

# The market's own crowd. `market.wav` is the owner's field recording; this
# sits under it as a second layer so the square is never quiet in the same way
# twice.
print("ambience:")
shutil.copyfile(os.path.join(BGS, "People1.ogg"), os.path.join(AUDIO, "market-crowd.ogg"))
print("  audio/market-crowd.ogg  <- bgs/People1.ogg")

print(f"\n{copied}/{total} clips copied")
