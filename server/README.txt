GRIMFALL CO-OP SERVER — HOW TO SET IT UP
==========================================================

The game is static files and always will be. This is the one piece that is not.
It does two jobs, and doing both from one process is what makes it deployable
with no configuration:

  1. it relays co-op traffic between the players in a room
  2. it serves the built game, if you have built one

Because both come from the same address, the page and the socket share an
origin. That means the host's own TLS certificate covers the WebSocket, the
Content-Security-Policy needs no exception, and nothing has to be told where
anything is — the server reads its own public address off each request that
arrives. There is no environment variable to set and no rebuild after deploying.


----------------------------------------------------------
1. PLAYING WITH PEOPLE IN THE SAME HOUSE  (free, 30 seconds)
----------------------------------------------------------

  npm run build          once, to produce dist/
  npm run server

It prints the address to give everyone:

  friends on this network:  http://192.168.0.17:5174

They open that, press Play Together, and join with the four-character code.
Nobody types an address twice and nobody installs anything but a browser.

Only the person hosting needs Node. Everyone else needs a browser on the same
wifi.

WHY THIS STOPS AT YOUR OWN NETWORK. A page loaded over https may only open a
`wss://` socket — browsers refuse the insecure kind and say almost nothing about
why — and `wss://` needs a TLS certificate, which needs a domain name, which a
laptop on a living-room network does not have. Over plain http on one network
none of that applies. Playing with someone in a different house is what the next
section is for.


----------------------------------------------------------
2. PUTTING IT ONLINE  (one deploy, then it just works)
----------------------------------------------------------

Any host that runs a container. A `Dockerfile`, a `fly.toml` and a `render.yaml`
are in the project root; the Dockerfile builds the game inside the image, so
what gets deployed is built from the source rather than from whatever dist/
happened to be on your laptop.

  Fly:      fly launch --no-deploy      (edit the app name in fly.toml)
            fly deploy
            -> https://your-app.fly.dev

  Render:   New > Blueprint, point it at the repository, deploy.
            Its free plan sleeps after fifteen idle minutes and takes most of a
            minute to wake, so the first person in waits and nobody after does.

  Anything else that takes a Dockerfile works the same way. It listens on $PORT
  and answers GET /health, which is what platforms poll.

Open the deployed URL and the whole game is there, multiplayer included. No
build flag, no address to copy anywhere.

IT MUST BE A SINGLE INSTANCE. Rooms are held in memory in one process, so two
instances behind a load balancer would be two separate sets of rooms and a code
that works or does not depending on which one you reached. That is why fly.toml
does not autoscale. A lobby is worthless the moment the people in it have gone,
so there is nothing here worth a database — but it does mean one process.


----------------------------------------------------------
3. KEEPING THE GAME ON ITCH.IO AND ONLY THE SOCKETS HERE
----------------------------------------------------------

If you would rather players arrive through itch.io, the itch build has to be
told where the server is, because itch is serving the page and knows nothing
about it:

  GRIMFALL_SERVER=wss://your-app.fly.dev npm run build:zip

That one variable writes the address into index.html and adds that exact origin
to the Content-Security-Policy. Both, from one variable, on purpose: a build
that knows the address but is forbidden to reach it fails silently in a console
nobody is looking at.

Without it, multiplayer is simply off — the Play Together button is hidden and
the policy is the locked-down one the game has always shipped with. That is the
default, and it is what the current zip is.


----------------------------------------------------------
NOTES
----------------------------------------------------------

  Node 18 or newer. No dependencies, no database, no build step for the server
  itself.

  For testing against another machine without deploying anything, set
  `localStorage.grimfallServer` in the browser console. It beats everything else.

  What this does NOT do: accounts, matchmaking, persistence, server-side
  simulation, or any anti-cheat. Everything authoritative about a run lives on
  the clients — each owns its own character and a share of the horde — so a
  server that understood the payloads could not do anything useful with the
  understanding. It hands out room codes and relays.
