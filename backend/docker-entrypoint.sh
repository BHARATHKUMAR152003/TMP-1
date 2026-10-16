#!/bin/sh
# Apply the schema + idempotent upgrades, optionally seed demo data, then serve.
set -e

echo "Applying database migrations..."
node src/database/migrate.js

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data..."
  node src/database/seed.js || echo "Seed skipped/failed (continuing)."
fi

echo "Starting PrintPress API on :5000"
exec node src/server.js
