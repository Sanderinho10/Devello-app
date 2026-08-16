# Produksjonsbilde for Devello-appen.
#
# Appen lager PDF-er med en ekte Chromium via playwright-core — derfor et
# Docker-bilde og ikke serverless. Chromium installeres av samme pakke som
# skal bruke den, så versjonene aldri kan sprike.
#
# Bygges og kjøres av hosten (Railway/Render): den ser denne fila og gjør
# resten. Lokalt: docker build -t devello . && docker run -p 3000:3000 devello

FROM node:22-bookworm-slim

WORKDIR /app

# Chromium-en legges på en fast, versjonsuavhengig sti.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NEXT_TELEMETRY_DISABLED=1

# Avhengigheter først, så Docker-cachen overlever kodeendringer.
COPY package.json package-lock.json ./
RUN npm ci

# Chromium + systembibliotekene den trenger (fonter, X-biblioteker).
RUN npx playwright-core install --with-deps chromium

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# next start leser PORT fra miljøet (Railway/Render setter den selv).
CMD ["npm", "run", "start"]
