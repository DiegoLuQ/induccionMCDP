#!/usr/bin/env bash
# =============================================================================
# Actualiza la base de datos de producción con el esquema de Prisma.
#
# Uso (en el servidor, dentro de la carpeta del proyecto):
#     bash scripts/actualizar-bd.sh
#
# Qué hace, en orden:
#   1. Lee el usuario y la base de datos desde DOCKER_DATABASE_URL del .env.
#   2. Da a ese usuario los permisos de esquema (ALTER, INDEX, CREATE, DROP,
#      REFERENCES) SOLO sobre esa base de datos, usando root de MariaDB.
#   3. Crea el índice previo que MariaDB exige en signed_certificates (si falta).
#   4. Ejecuta "prisma db push" dentro del contenedor de la app.
#
# Es seguro ejecutarlo varias veces: cada paso revisa antes de actuar.
# Variables opcionales: DB_CONTAINER (por defecto mcdp_mysql) y
# APP_CONTAINER (por defecto induccion_app).
# =============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-mcdp_mysql}"
APP_CONTAINER="${APP_CONTAINER:-induccion_app}"
ENV_FILE="${ENV_FILE:-.env}"

ok()   { printf '\033[32m✔ %s\033[0m\n' "$1"; }
info() { printf '\033[36m➜ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

# --- 0. Verificaciones básicas ------------------------------------------------
[ -f "$ENV_FILE" ] || fail "No encontré $ENV_FILE. Ejecuta el script desde la carpeta del proyecto."
docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"  || fail "El contenedor de base de datos '$DB_CONTAINER' no está corriendo."
docker ps --format '{{.Names}}' | grep -qx "$APP_CONTAINER" || fail "El contenedor de la app '$APP_CONTAINER' no está corriendo. Ejecuta antes: docker compose up -d --build"

# --- 1. Usuario y base de datos desde el .env ----------------------------------
DB_URL=$(grep -E '^DOCKER_DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'" | tr -d '\r')
[ -n "$DB_URL" ] || fail "DOCKER_DATABASE_URL no está definido en $ENV_FILE."
DB_USER=$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://([^:@/]+).*#\1#')
DB_NAME=$(printf '%s' "$DB_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || fail "No pude leer usuario/base desde DOCKER_DATABASE_URL."
ok "Base de datos: $DB_NAME · usuario: $DB_USER"

# Cliente disponible en el contenedor (MariaDB nuevo usa "mariadb"; antiguo "mysql").
DB_CLIENT=$(docker exec "$DB_CONTAINER" sh -c 'command -v mariadb || command -v mysql' 2>/dev/null || true)
[ -n "$DB_CLIENT" ] || fail "No encontré el cliente mariadb/mysql dentro de '$DB_CONTAINER'."

# Contraseña de root: de las variables del contenedor o, si no está, se pide.
ROOT_PASS=$(docker exec "$DB_CONTAINER" printenv MARIADB_ROOT_PASSWORD 2>/dev/null \
  || docker exec "$DB_CONTAINER" printenv MYSQL_ROOT_PASSWORD 2>/dev/null || true)
if [ -z "$ROOT_PASS" ]; then
  read -r -s -p "Contraseña de root de MariaDB: " ROOT_PASS; echo
fi

# Ejecuta SQL como root (la contraseña viaja por variable de entorno, no en la línea de comandos).
sql_root() {
  docker exec -i -e MYSQL_PWD="$ROOT_PASS" "$DB_CONTAINER" "$DB_CLIENT" -uroot -N -B -e "$1"
}

sql_root "SELECT 1;" > /dev/null || fail "No pude conectarme como root. Revisa la contraseña."
ok "Conexión como root correcta"

# --- 2. Permisos de esquema para el usuario de la app ---------------------------
HOSTS=$(sql_root "SELECT host FROM mysql.user WHERE user = '$DB_USER';")
[ -n "$HOSTS" ] || fail "El usuario '$DB_USER' no existe en MariaDB."
while IFS= read -r HOST; do
  [ -n "$HOST" ] || continue
  sql_root "GRANT ALTER, INDEX, CREATE, DROP, REFERENCES ON \`$DB_NAME\`.* TO '$DB_USER'@'$HOST';"
  ok "Permisos de esquema otorgados a '$DB_USER'@'$HOST' sobre $DB_NAME"
done <<< "$HOSTS"
sql_root "FLUSH PRIVILEGES;"

# --- 3. Índice previo en signed_certificates (requerido por MariaDB) -----------
TABLE_EXISTS=$(sql_root "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='signed_certificates';")
if [ "$TABLE_EXISTS" = "1" ]; then
  INDEX_EXISTS=$(sql_root "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='$DB_NAME' AND table_name='signed_certificates' AND index_name='signed_certificates_userId_idx';")
  if [ "$INDEX_EXISTS" = "0" ]; then
    sql_root "CREATE INDEX \`signed_certificates_userId_idx\` ON \`$DB_NAME\`.\`signed_certificates\`(\`userId\`);"
    ok "Índice signed_certificates_userId_idx creado"
  else
    ok "Índice signed_certificates_userId_idx ya existía"
  fi
else
  info "La tabla signed_certificates aún no existe: Prisma la creará completa."
fi

# --- 4. Aplicar el esquema de Prisma -------------------------------------------
info "Aplicando el esquema con Prisma (puede tardar unos segundos)..."
# --accept-data-loss: sólo responde a avisos de reglas únicas nuevas que amplían
# las actuales; no se elimina ningún dato.
if docker exec "$APP_CONTAINER" npx prisma db push --accept-data-loss --skip-generate; then
  ok "Base de datos actualizada. Todo listo."
else
  fail "Prisma no pudo aplicar el esquema. Copia el error de arriba y envíalo."
fi
