FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY alembic.ini .
COPY entrypoint.sh .
COPY worker-entrypoint.sh .

# Make entrypoint scripts executable
RUN chmod +x entrypoint.sh worker-entrypoint.sh

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 50059

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD python -c "import requests; requests.get('http://localhost:50059/health', timeout=5)"

# Run Flask application with migrations
CMD ["./entrypoint.sh"]
