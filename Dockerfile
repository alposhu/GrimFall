# Grimfall, as one deployable thing: the game and the co-op server together.
#
# Serving both from one process is what makes this deployable with no
# configuration — the page and the WebSocket end up on the same origin, so the
# platform's certificate covers both and the server reads its own public
# address off each request. See server/static.js for the full reasoning.
#
#   docker build -t grimfall .
#   docker run -p 5174:5174 grimfall

FROM node:22-alpine

WORKDIR /app

# No dependencies to install — the project has none, and that is not an
# accident. There is no `npm ci` step here because there is nothing to fetch,
# which also means no lockfile to go stale and no supply chain to audit.
COPY . .

# The build is run HERE rather than copied in, so what gets deployed is built
# from the source in the image. A dist/ built on someone's laptop months ago and
# copied in is the classic way a deploy stops matching the repository.
RUN node tools/build.mjs

# Most platforms inject their own PORT; this is the fallback and the local one.
ENV PORT=5174
EXPOSE 5174

# A health endpoint the platform can poll, so a container that has stopped
# answering gets replaced rather than sitting there accepting connections.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server/index.js"]
