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

# NEXT_PUBLIC_*-variablene bakes inn i nettleserkoden når «npm run build»
# kjører — de leses ikke ved oppstart slik de andre gjør. Et Dockerfile-bygg
# ser bare de variablene det selv erklærer med ARG, så uten disse linjene
# bygges nettleserkoden med tomme verdier. Symptomet er lumsk: sidene laster
# helt normalt (serveren har jo variablene sine), men ingenting som skjer i
# nettleseren når fram til Supabase — innloggingen bare står og spinner.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Heller et rødt bygg enn en utrulling der ingen kan logge inn.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" -a -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || { \
      echo ""; \
      echo "STOPP: NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY må"; \
      echo "være satt når bildet bygges — de bakes inn i nettleserkoden."; \
      echo "Legg dem inn som variabler på tjenesten og bygg på nytt."; \
      echo ""; \
      exit 1; \
    }

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# next start leser PORT fra miljøet (Railway/Render setter den selv).
CMD ["npm", "run", "start"]
