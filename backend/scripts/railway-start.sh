#!/bin/sh
set -e

echo "========================================"
echo "DocterPoint API boot"
echo "PORT=${PORT:-3001}"
if [ -n "$DATABASE_URL" ]; then echo "DATABASE_URL set? yes"; else echo "DATABASE_URL set? NO"; fi
if [ -n "$JWT_SECRET_KEY" ]; then echo "JWT_SECRET_KEY set? yes"; else echo "JWT_SECRET_KEY set? NO (using default)"; fi
if [ -n "$HASHING_SECRET_KEY" ]; then echo "HASHING_SECRET_KEY set? yes"; else echo "HASHING_SECRET_KEY set? NO (using default)"; fi
if [ -n "$OPENAI_API_KEY" ]; then echo "OPENAI_API_KEY set? yes"; else echo "OPENAI_API_KEY set? NO"; fi
if [ -n "$HF_TOKEN" ]; then echo "HF_TOKEN set? yes"; else echo "HF_TOKEN set? NO"; fi
if [ -n "$DEEPSEEK_API_KEY" ]; then echo "DEEPSEEK_API_KEY set? yes"; else echo "DEEPSEEK_API_KEY set? NO"; fi
echo "FRONTEND_ORIGINS=${FRONTEND_ORIGINS:-<default>}"
echo "========================================"

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL missing. Set Session pooler URI on Railway."
  exit 1
fi

# Normalize common Railway paste mistakes
# - strip CR, leading/trailing whitespace
# - strip wrapping quotes (straight or curly)
# - strip UTF-8 BOM
# - strip accidental "DATABASE_URL=" prefix
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e $'s/^\xEF\xBB\xBF//')
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e 's/^“//' -e 's/”$//' -e 's/^‘//' -e 's/’$//')
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e 's/^DATABASE_URL=//I')
export DATABASE_URL

# Safe debug: show only the scheme / first chars before credentials
PREFIX=$(printf '%s' "$DATABASE_URL" | cut -c1-20)
echo "DATABASE_URL prefix: [${PREFIX}]"

# Case-insensitive protocol check
LOWER=$(printf '%s' "$DATABASE_URL" | tr '[:upper:]' '[:lower:]')
case "$LOWER" in
  postgresql://*|postgres://*)
    echo "DATABASE_URL protocol OK"
    ;;
  *)
    echo "FATAL: DATABASE_URL must start with postgresql:// or postgres://"
    echo "Fix in Railway Variables — paste the raw URI only, no quotes."
    echo "Example: postgresql://postgres.xxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
    echo "Encode @ inside the password as %40"
    exit 1
    ;;
esac

export JWT_SECRET_KEY="${JWT_SECRET_KEY:-dev-jwt-secret-key-for-local-dev}"
export HASHING_SECRET_KEY="${HASHING_SECRET_KEY:-mUhX5P6R7K9/9bbBWuTdpCkvde5oo8a5xee8z0braz4=}"
export FRONTEND_ORIGINS="${FRONTEND_ORIGINS:-https://docterpoint-six.vercel.app,http://localhost:3000}"
export JWT_ALGORITHM="${JWT_ALGORITHM:-HS256}"

echo "Starting with tsx (src/index.ts)..."
exec npx tsx src/index.ts
