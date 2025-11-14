# Observability Stack Configuration

This directory contains configuration files for the observability stack (Loki, Promtail, Tempo, Prometheus, Grafana).

## Quick Setup

Create all configuration files by running the commands below, or manually create each file with the content provided in this document.

## Configuration Files

### 1. Loki Configuration (`loki-config.yaml`)

**Purpose:** Configures Loki log aggregation with 31-day retention.

**Create file:**
```bash
cat > loki-config.yaml << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 0.0.0.0
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    cache_ttl: 24h
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 744h  # 31 days
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32
  max_query_length: 721h
  max_query_parallelism: 32
  max_streams_per_user: 0
  max_global_streams_per_user: 0

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: true
  retention_period: 744h

compactor:
  working_directory: /loki/boltdb-shipper-compactor
  shared_store: filesystem
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150

ruler:
  storage:
    type: local
    local:
      directory: /loki/rules
  rule_path: /loki/rules-temp
  alertmanager_url: http://localhost:9093
  ring:
    kvstore:
      store: inmemory
  enable_api: true
EOF
```

---

### 2. Promtail Configuration (`promtail-config.yaml`)

**Purpose:** Collects Docker container logs and ships them to Loki.

**Create file:**
```bash
cat > promtail-config.yaml << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Docker container logs
  - job_name: docker
    static_configs:
      - targets:
          - localhost
        labels:
          job: docker
          __path__: /var/lib/docker/containers/*/*-json.log

    pipeline_stages:
      # Parse Docker JSON logs
      - json:
          expressions:
            output: log
            stream: stream
            attrs: attrs
            tag: attrs.tag

      # Extract container name and compose service
      - json:
          expressions:
            container_name: attrs.name
            compose_project: attrs."com.docker.compose.project"
            compose_service: attrs."com.docker.compose.service"
          source: attrs

      # Add labels
      - labels:
          container_name:
          compose_project:
          compose_service:
          stream:

      # Use 'output' field as the log line
      - output:
          source: output

      # Parse JSON logs from services
      - match:
          selector: '{compose_service=~"ltv-.*"}'
          stages:
            - json:
                expressions:
                  level: level
                  service: service
                  requestId: requestId
                  traceId: traceId
                  userId: userId
                  msg: msg

            - labels:
                level:
                service:

      # Drop health check logs to reduce noise
      - match:
          selector: '{compose_service=~"ltv-.*"} |~ "health"'
          action: drop

      # Drop empty log lines
      - match:
          selector: '{compose_service=~"ltv-.*"} |= ""'
          action: drop
EOF
```

---

### 3. Tempo Configuration (`tempo-config.yaml`)

**Purpose:** Configures distributed tracing backend with 7-day retention.

**Create file:**
```bash
cat > tempo-config.yaml << 'EOF'
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318
        grpc:
          endpoint: 0.0.0.0:4317

ingester:
  max_block_duration: 5m

compactor:
  compaction:
    block_retention: 168h  # 7 days

metrics_generator:
  registry:
    external_labels:
      source: tempo
      cluster: docker-compose
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true

storage:
  trace:
    backend: local
    wal:
      path: /var/tempo/wal
    local:
      path: /var/tempo/blocks

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics]
EOF
```

---

### 4. Prometheus Configuration (`prometheus.yml`)

**Purpose:** Scrapes metrics from all services and stores them.

**Create file:**
```bash
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'docker-compose'
    environment: 'development'

# Alertmanager configuration (optional)
# alerting:
#   alertmanagers:
#     - static_configs:
#         - targets:
#           - alertmanager:9093

# Load alerting rules
# rule_files:
#   - "alerts/*.yml"

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Loki metrics
  - job_name: 'loki'
    static_configs:
      - targets: ['loki:3100']

  # Tempo metrics
  - job_name: 'tempo'
    static_configs:
      - targets: ['tempo:3200']

  # Grafana metrics
  - job_name: 'grafana'
    static_configs:
      - targets: ['grafana:3000']

  # Application services (when they expose /metrics endpoint)
  - job_name: 'ltv-services'
    static_configs:
      # API Gateway
      - targets: ['host.docker.internal:50050']
        labels:
          service: 'api-gateway'

      # Auth Service
      - targets: ['host.docker.internal:50051']
        labels:
          service: 'auth-service'

      # Datasource Service
      - targets: ['host.docker.internal:50054']
        labels:
          service: 'datasource-service'

      # Indexing Service
      - targets: ['host.docker.internal:50055']
        labels:
          service: 'indexing-service'

      # Retrieval Service
      - targets: ['host.docker.internal:50056']
        labels:
          service: 'retrieval-service'

  # Infrastructure services
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    metrics_path: /metrics

  # MySQL exporter (requires mysql-exporter sidecar)
  # - job_name: 'mysql'
  #   static_configs:
  #     - targets: ['mysql-exporter:9104']
EOF
```

---

### 5. Grafana Datasources Configuration (`grafana-datasources.yml`)

**Purpose:** Auto-provisions Loki, Tempo, and Prometheus datasources in Grafana.

**Create file:**
```bash
cat > grafana-datasources.yml << 'EOF'
apiVersion: 1

datasources:
  # Loki - Logs
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    version: 1
    editable: true
    jsonData:
      maxLines: 1000
      derivedFields:
        # Link logs to traces via traceId
        - datasourceUid: tempo
          matcherRegex: '"traceId":\s*"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'

  # Tempo - Traces
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    isDefault: false
    version: 1
    editable: true
    jsonData:
      httpMethod: GET
      tracesToLogs:
        # Link traces to logs via traceId
        datasourceUid: loki
        mapTagNamesEnabled: true
        mappedTags:
          - key: service.name
            value: service
        spanStartTimeShift: '-1h'
        spanEndTimeShift: '1h'
        filterByTraceID: true
        filterBySpanID: false
      tracesToMetrics:
        # Link traces to metrics
        datasourceUid: prometheus
      serviceMap:
        datasourceUid: prometheus
      search:
        hide: false
      nodeGraph:
        enabled: true
      lokiSearch:
        datasourceUid: loki

  # Prometheus - Metrics
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    version: 1
    editable: true
    jsonData:
      httpMethod: POST
      exemplarTraceIdDestinations:
        # Link metrics to traces via traceId
        - datasourceUid: tempo
          name: traceId
EOF
```

---

### 6. Grafana Dashboards Configuration (`grafana-dashboards.yml`)

**Purpose:** Auto-provisions dashboard directory in Grafana.

**Create file:**
```bash
cat > grafana-dashboards.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: 'LTV Assistant'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
EOF
```

---

## Directory Structure

After creating all files, your directory structure should look like:

```
monitoring/
├── README.md                      (this file)
├── loki-config.yaml              (Loki configuration)
├── promtail-config.yaml          (Log collector configuration)
├── tempo-config.yaml             (Tracing backend configuration)
├── prometheus.yml                (Metrics scraping configuration)
├── grafana-datasources.yml       (Grafana datasources)
└── grafana-dashboards.yml        (Grafana dashboard provisioning)
```

---

## Quick Setup Script

Run this script to create all configuration files at once:

```bash
#!/bin/bash

# Create monitoring directory if it doesn't exist
mkdir -p monitoring
cd monitoring

# Create all configuration files
# (Copy and paste each file creation command from sections 1-6 above)

echo "✅ All configuration files created successfully!"
echo ""
echo "Next steps:"
echo "1. Start the observability stack: docker-compose up -d loki promtail tempo prometheus grafana"
echo "2. Access Grafana: http://localhost:3000 (admin/admin)"
echo "3. Explore logs in Loki datasource"
echo "4. View traces in Tempo datasource"
echo "5. Check metrics in Prometheus datasource"
```

---

## Starting the Observability Stack

### Start All Services

```bash
docker-compose up -d
```

### Start Only Observability Stack

```bash
docker-compose up -d loki promtail tempo prometheus grafana
```

### Check Service Health

```bash
docker-compose ps
```

All services should show `healthy` status.

---

## Accessing the Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3000 | admin / admin |
| **Prometheus** | http://localhost:9090 | None |
| **Loki** (API) | http://localhost:3100 | None |
| **Tempo** (API) | http://localhost:3200 | None |

---

## Verifying the Setup

### 1. Check Loki

```bash
# Check Loki health
curl http://localhost:3100/ready

# Query recent logs
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={job="docker"}' | jq
```

### 2. Check Tempo

```bash
# Check Tempo health
curl http://localhost:3200/ready

# Check Tempo status
curl http://localhost:3200/status
```

### 3. Check Prometheus

```bash
# Check Prometheus health
curl http://localhost:9090/-/healthy

# Query Prometheus metrics
curl 'http://localhost:9090/api/v1/query?query=up'
```

### 4. Check Grafana

1. Open http://localhost:3000
2. Login: admin / admin
3. Go to **Connections** → **Data sources**
4. Verify all three datasources (Loki, Tempo, Prometheus) are connected

---

## Using Grafana Explore

### Explore Logs (Loki)

1. Go to **Explore** (compass icon)
2. Select **Loki** datasource
3. Try these queries:

```logql
# All logs
{job="docker"}

# Logs from specific service
{compose_service="ltv-assistant-indexing"}

# Error logs only
{compose_service=~"ltv-.*"} |= "level=error"

# Logs for specific request
{compose_service=~"ltv-.*"} |= "requestId=req-abc123"

# Logs with specific user
{compose_service=~"ltv-.*"} |= "userId=user-123"
```

### Explore Traces (Tempo)

1. Go to **Explore**
2. Select **Tempo** datasource
3. Use **Search** tab to find traces
4. Click on a trace to see the waterfall view

### Explore Metrics (Prometheus)

1. Go to **Explore**
2. Select **Prometheus** datasource
3. Try these queries:

```promql
# All running services
up

# Loki ingestion rate
rate(loki_ingester_bytes_received_total[5m])

# Tempo traces received
rate(tempo_distributor_spans_received_total[5m])
```

---

## Next Steps

### For Application Services

To send logs and traces from your NestJS services, you need to:

1. **Install dependencies:**
   ```bash
   npm install --save nestjs-pino pino-http
   npm install --save @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
   ```

2. **Configure Pino to send logs to Loki:**
   ```typescript
   // Configure Pino transport
   import pino from 'pino';

   const logger = pino({
     transport: {
       target: 'pino-loki',
       options: {
         host: 'http://localhost:3100',
         labels: { service: 'api-gateway' },
       },
     },
   });
   ```

3. **Configure OpenTelemetry to send traces to Tempo:**
   ```typescript
   // Initialize tracer before NestJS bootstrap
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter({
       url: 'http://localhost:4318/v1/traces',
     }),
   });

   sdk.start();
   ```

4. **Expose Prometheus metrics:**
   ```typescript
   // Add metrics endpoint
   import { PrometheusModule } from '@willsoto/nestjs-prometheus';

   @Module({
     imports: [PrometheusModule.register()],
   })
   ```

For detailed implementation, refer to `/docs/plans/tracing.md`.

---

## Troubleshooting

### Logs not appearing in Loki

1. Check Promtail is running:
   ```bash
   docker-compose logs promtail
   ```

2. Check Promtail can access Docker socket:
   ```bash
   docker-compose exec promtail ls -la /var/run/docker.sock
   ```

3. Check Loki ingestion:
   ```bash
   curl http://localhost:3100/metrics | grep loki_ingester
   ```

### Traces not appearing in Tempo

1. Verify Tempo is listening:
   ```bash
   curl http://localhost:4318/v1/traces
   ```

2. Check your application is sending traces:
   ```bash
   # Check Tempo metrics
   curl http://localhost:3200/metrics | grep tempo_distributor
   ```

### Grafana can't connect to datasources

1. Check all services are healthy:
   ```bash
   docker-compose ps
   ```

2. Test connectivity from Grafana container:
   ```bash
   docker-compose exec grafana wget -O- http://loki:3100/ready
   docker-compose exec grafana wget -O- http://tempo:3200/ready
   docker-compose exec grafana wget -O- http://prometheus:9090/-/healthy
   ```

---

## Performance Tuning

### Reduce Log Volume

Edit `promtail-config.yaml` to add more drop rules:

```yaml
# Drop debug logs in production
- match:
    selector: '{compose_service=~"ltv-.*"} |= "level=debug"'
    action: drop
```

### Adjust Retention Periods

- **Loki:** Edit `retention_period` in `loki-config.yaml`
- **Tempo:** Edit `block_retention` in `tempo-config.yaml`
- **Prometheus:** Edit `--storage.tsdb.retention.time` in docker-compose.yml

---

## Production Recommendations

For production deployment, consider:

1. **Use external storage** (S3, GCS) instead of filesystem
2. **Enable authentication** (set `auth_enabled: true` in Loki/Tempo)
3. **Add TLS/HTTPS** for all endpoints
4. **Set up high availability** (multiple replicas)
5. **Use managed services** (Grafana Cloud, AWS Managed Prometheus)
6. **Implement log sampling** to reduce volume
7. **Add alerting** (Alertmanager integration)
8. **Set resource limits** in docker-compose (memory, CPU)

---

## Support

For issues or questions:
- Loki docs: https://grafana.com/docs/loki/latest/
- Tempo docs: https://grafana.com/docs/tempo/latest/
- Prometheus docs: https://prometheus.io/docs/
- Grafana docs: https://grafana.com/docs/grafana/latest/

---

**Last Updated:** 2025-11-05
