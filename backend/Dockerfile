# Pinned to a dated Alpine rather than floating: the system Chromium below must
# stay CDP-compatible with the installed Puppeteer major, and an unexpected
# Alpine bump shows up as launch() succeeding but screenshot() throwing.
FROM node:22-alpine3.21

WORKDIR /app

# Chromium for the /report PNG renderer. The font packages are not optional:
# without ttf-dejavu the report renders in a fallback face, and without
# font-noto-emoji every emoji (including user category icons) becomes a tofu box.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      ttf-dejavu \
      font-noto-emoji

# Must be set before `npm ci` — Puppeteer's postinstall would otherwise download
# a glibc Chromium that cannot run on musl, slowing the build and baking in a
# binary we never use. Both variable names are set because it was renamed across
# Puppeteer majors.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/server.js"]
