FROM python:3.11-slim

WORKDIR /app

# Install compatible dependencies for ARM64
RUN pip install --no-cache-dir \
    "numpy<2.0.0" \
    flask==3.0.0 \
    "torch>=2.0.0,<2.2.0" \
    "transformers>=4.35.0,<4.40.0" \
    "sentence-transformers>=2.3.0"

# Copy server code
COPY server.py .

# Expose port
EXPOSE 80

# Run server
CMD ["python", "server.py"]
