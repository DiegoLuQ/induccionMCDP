#!/bin/sh
set -e

echo "==> [Entrypoint] Comprobando y sincronizando esquema de base de datos con Prisma..."

MAX_RETRIES=15
RETRY_INTERVAL=3
COUNT=0

until npx prisma db push --skip-generate; do
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
    echo "❌ [Entrypoint] Error: No se pudo conectar a la base de datos o falló 'prisma db push' tras $MAX_RETRIES intentos."
    exit 1
  fi
  echo "⏳ [Entrypoint] Base de datos no disponible aún. Reintentando en ${RETRY_INTERVAL}s... ($COUNT/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

echo "✅ [Entrypoint] Base de datos sincronizada con éxito."
echo "==> [Entrypoint] Iniciando servidor de producción..."

exec "$@"

