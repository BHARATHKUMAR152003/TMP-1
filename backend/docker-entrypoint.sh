
#!/bin/sh

# Stop execution if any command fails
set -e

echo "======================================"
echo "       TMP PRINTING PRESS ERP"
echo "======================================"

# Verify Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js is not installed."
    exit 1
fi

echo "Node.js version: $(node --version)"

# Verify production configuration
if [ "$NODE_ENV" = "production" ]; then
    if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        echo "ERROR: Required database environment variables are missing."
        exit 1
    fi

    if [ -z "$JWT_SECRET" ]; then
        echo "ERROR: JWT_SECRET is not configured."
        exit 1
    fi
fi

# Do not run database migrations automatically.
# Migrations must be executed separately before deployment.
echo "Database migrations are managed separately."

# Start the Express application
echo "Starting TMP Printing Press ERP..."

exec node src/server.js
