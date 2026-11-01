#!/usr/bin/env bash
# Applies the migrations and runs supabase/tests/rls_test.sql.
#
#   1) Supabase CLI available      -> `supabase start` (Docker) then tests run against the local stack DB.
#   2) Otherwise, plain Postgres   -> set PGURL to a SUPERUSER connection string of a THROWAWAY database; a stub `auth`
#                                     schema (stub_auth.sql) is installed first. Never point this at a real project.
#   3) No PGURL and no CLI         -> if postgres 14+ binaries exist (e.g. /usr/lib/postgresql/*/bin) a temporary cluster
#                                     is created under $TMPDIR and removed afterwards.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
MIG="$ROOT/migrations"
STUB=1
CLEANUP=""

if [[ -z "${PGURL:-}" ]] && command -v supabase >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
  supabase start >/dev/null
  PGURL="$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"/\1/p')"
  STUB=0
  psql "$PGURL" -q -c "drop schema if exists public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;" >/dev/null
fi

if [[ -z "${PGURL:-}" ]]; then
  BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$BIN" ]] || { echo "No PGURL, no Supabase CLI and no local Postgres found." >&2; exit 2; }
  DIR="$(mktemp -d)"; PORT="${PGPORT:-54329}"
  if [[ "$(id -u)" == "0" ]]; then
    chown postgres "$DIR"; RUN=(runuser -u postgres --)
  else RUN=(); fi
  "${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
  "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
  CLEANUP="${RUN[*]:-} $BIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null; rm -rf $DIR"
  trap 'eval "$CLEANUP"' EXIT
  PGURL="host=$DIR port=$PORT user=postgres dbname=postgres"
fi

P=(psql "$PGURL" -v ON_ERROR_STOP=1 -q)
[[ "$STUB" == 1 ]] && "${P[@]}" -f "$HERE/stub_auth.sql"
for f in "$MIG"/*.sql; do echo "applying $(basename "$f")"; "${P[@]}" -f "$f"; done
"${P[@]}" -f "$HERE/rls_test.sql"

# Seed check: the generated default seed must apply (twice — it is idempotent) for a real user row.
if command -v tsx >/dev/null 2>&1; then
  SEED_UID="cccccccc-cccc-cccc-cccc-cccccccccccc"
  "${P[@]}" -c "insert into auth.users (id,email) values ('$SEED_UID','seed@test.local')"
  (cd "$ROOT/.." && tsx scripts/gen-seed-sql.ts "$SEED_UID") > "${TMPDIR:-/tmp}/rhythm-seed.sql"
  "${P[@]}" -f "${TMPDIR:-/tmp}/rhythm-seed.sql"; "${P[@]}" -f "${TMPDIR:-/tmp}/rhythm-seed.sql"
  "${P[@]}" -At -c "select 'seed rows: subjects=' || (select count(*) from public.subjects where user_id='$SEED_UID') || ' plans=' || (select count(*) from public.timetable_templates where user_id='$SEED_UID') || ' templates=' || (select count(*) from public.activity_templates where user_id='$SEED_UID')"
  "${P[@]}" -c "delete from auth.users where id='$SEED_UID'"
  # a placeholder seed must refuse to run
  (cd "$ROOT/.." && tsx scripts/gen-seed-sql.ts) | "${P[@]}" -f - 2>/dev/null && { echo "placeholder seed unexpectedly applied" >&2; exit 1; } || echo "placeholder seed correctly refused"
fi
echo "run-local: OK"
