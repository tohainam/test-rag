#!/bin/bash
set -e

# Suppress git warning for RAGAS (not needed in Docker)
export GIT_PYTHON_REFRESH=quiet

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
max_retries=30
retry_count=0
while ! python -c "import redis; redis.Redis(host='redis', port=6379).ping()" 2>/dev/null; do
  retry_count=$((retry_count+1))
  if [ $retry_count -ge $max_retries ]; then
    echo "Error: Redis is not ready after $max_retries attempts"
    exit 1
  fi
  echo "Redis is not ready yet, retrying... ($retry_count/$max_retries)"
  sleep 2
done
echo "Redis is ready!"

echo "Starting RQ worker..."
exec rq worker ragas-queue --url redis://redis:6379/0
