FROM node:22-bookworm-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Prefer tsx at runtime so a tsc emit issue cannot leave the service dead
ENV NODE_ENV=production
EXPOSE 3001

RUN chmod +x /code/scripts/railway-start.sh

CMD ["/code/scripts/railway-start.sh"]
