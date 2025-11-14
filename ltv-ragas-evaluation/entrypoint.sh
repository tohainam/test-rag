#!/bin/bash
set -e

# Suppress git warning for RAGAS (not needed in Docker)
export GIT_PYTHON_REFRESH=quiet

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
max_retries=30
retry_count=0
while ! python -c "import pymysql; pymysql.connect(host='mysql', user='root', password='root', database='ltv_assistant')" 2>/dev/null; do
  retry_count=$((retry_count+1))
  if [ $retry_count -ge $max_retries ]; then
    echo "Error: MySQL is not ready after $max_retries attempts"
    exit 1
  fi
  echo "MySQL is not ready yet, retrying... ($retry_count/$max_retries)"
  sleep 2
done
echo "MySQL is ready!"

echo "Running database migrations..."
alembic upgrade head

echo "Starting Flask application..."
exec python -m src.app
