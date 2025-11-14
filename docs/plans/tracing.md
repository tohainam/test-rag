# LTV Assistant - Logging & Distributed Tracing Implementation Plan

**Version:** 1.0
**Last Updated:** 2025-11-05
**Status:** Draft
**Owner:** Development Team
**Expected Delivery:** Q1 2025

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Problem Statement](#problem-statement)
4. [Proposed Solution](#proposed-solution)
5. [Technology Selection](#technology-selection)
6. [Architecture Design](#architecture-design)
7. [Implementation Plan](#implementation-plan)
8. [Migration Strategy](#migration-strategy)
9. [Configuration Management](#configuration-management)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Plan](#deployment-plan)
12. [Monitoring & Alerting](#monitoring--alerting)
13. [Success Metrics](#success-metrics)
14. [Risks & Mitigation](#risks--mitigation)
15. [Appendix](#appendix)

---

## Executive Summary

### Problem
The LTV Assistant microservices system currently uses basic NestJS logging with console outputs, making it extremely difficult to:
- Track requests across multiple services
- Debug production issues
- Monitor system performance
- Identify bottlenecks in distributed workflows
- Correlate logs from different services
- Perform root cause analysis

### Solution
Implement a comprehensive logging and distributed tracing solution using:
- **Pino** - High-performance structured logging
- **OpenTelemetry** - Distributed tracing and correlation
- **Grafana Loki** - Centralized log aggregation
- **Grafana Tempo** - Distributed tracing backend
- **Prometheus + Grafana** - Metrics and visualization

### Benefits
- **Observability:** Complete visibility into distributed request flows
- **Performance:** 5x faster than Winston, minimal overhead
- **Debugging:** Trace requests across all 6 microservices
- **Scalability:** Handles millions of log entries efficiently
- **Cost-Effective:** Open-source stack, efficient storage
- **Developer Experience:** Structured logs, correlation IDs, rich context

### Investment
- **Development Time:** 3-4 weeks
- **Infrastructure Cost:** ~$50/month (development), ~$300/month (production)
- **Maintenance:** ~4 hours/week initially, ~2 hours/week steady state

---

## Current State Analysis

### Logging Inventory

Based on comprehensive codebase analysis (November 2025):

#### Services Summary

| Service | Logger Type | Files with Logging | Logging Quality | Issues |
|---------|-------------|-------------------|-----------------|--------|
| **API Gateway** | console.log/error | 2 | ⚠️ Poor | No structure, no correlation IDs |
| **Auth Service** | Mixed (console + Logger) | 2 | ⚠️ Poor | Inconsistent, bootstrap only |
| **Datasource Service** | Mixed (console + Logger) | 10 | 🔶 Fair | Basic error logging, no context |
| **Indexing Service** | NestJS Logger (extensive) | 50+ | 🔶 Fair | Detailed but unstructured |
| **Retrieval Service** | None | 0 | ❌ Critical | No logging at all |
| **CMS** | React/Frontend | N/A | N/A | Frontend logging separate |

**Total Files with Logging:** 64+ across all services

#### Current Logging Patterns

**Pattern 1: Console Logging (Anti-pattern)**
```typescript
// api-gateway/src/main.ts
console.log(`[Gateway] Proxying: ${req.method} ${req.url} -> ${authServiceUrl}${req.url}`);
console.error('[Gateway] Authentication error:', error);

// ltv-assistant-auth/src/main.ts
console.log(`📡 TCP microservice is running on port ${tcpPort}`);
console.log(`🚀 Auth service running on: http://localhost:${port}`);
```

**Issues:**
- Not structured (difficult to parse)
- No log levels management
- No timestamp control
- Cannot be filtered or aggregated
- No context preservation

**Pattern 2: NestJS Logger (Current Standard)**
```typescript
// ltv-assistant-indexing/src/indexing/indexing.processor.ts
private readonly logger = new Logger(IndexingProcessor.name);

this.logger.log('='.repeat(80));
this.logger.log(`Processing file indexing job:`);
this.logger.log(`  Job ID: ${job.id}`);
this.logger.log(`  File ID: ${fileId}`);
this.logger.error(
  `Failed to process file indexing for ${filename}`,
  error instanceof Error ? error.stack : String(error),
);
```

**Issues:**
- Plain text format (not JSON)
- No correlation IDs
- No request tracing across services
- Limited metadata
- Performance overhead at scale

**Pattern 3: Queue Event Logging**
```typescript
@OnWorkerEvent('active')
onActive(job: Job<FileJobData>): void {
  this.logger.log(`Job ${job.id} is now active (type: ${job.data.type})`);
}

@OnWorkerEvent('completed')
onCompleted(job: Job<FileJobData>): void {
  this.logger.log(`Job ${job.id} completed successfully`);
}
```

**Issues:**
- No duration tracking
- No performance metrics
- No error categorization

### Critical Gaps

1. **No Correlation IDs**
   - Cannot trace requests across services
   - Example: Client upload → Gateway → Datasource → Indexing (no connection)

2. **No Structured Logging**
   - Cannot query logs programmatically
   - Cannot filter by service, user, document, etc.
   - Cannot build dashboards from logs

3. **No Centralized Aggregation**
   - Logs scattered across 6 services
   - No unified search interface
   - Cannot correlate events across services

4. **No Performance Monitoring**
   - No request duration tracking
   - No database query timing
   - No external API latency measurement

5. **No Request Context**
   - No user ID in logs
   - No API endpoint tracking
   - No HTTP status codes
   - No request/response bodies (sanitized)

6. **No Distributed Tracing**
   - Cannot visualize request flow
   - Cannot identify bottlenecks
   - Cannot debug performance issues

### Impact Assessment

**Development Impact:**
- 🔴 **Critical:** Debugging production issues takes 4-8 hours
- 🔴 **Critical:** Cannot reproduce distributed system bugs
- 🟡 **High:** Performance optimization is guesswork

**Operations Impact:**
- 🔴 **Critical:** No visibility into system health
- 🔴 **Critical:** Cannot identify failing services quickly
- 🟡 **High:** No audit trail for compliance

**Business Impact:**
- 🟡 **High:** Slow incident response (potential downtime)
- 🟡 **High:** User experience issues go undetected
- 🟢 **Medium:** Limited analytics on usage patterns

---

## Problem Statement

### Primary Problems

**1. Zero Distributed Tracing Capability**

Current situation:
```
Client Request → API Gateway → Auth Service → Datasource Service → Indexing Service
     ❌              ❌              ❌                ❌                  ❌
  (no trace ID)  (no trace ID)   (no trace ID)     (no trace ID)      (no trace ID)
```

Impact:
- Cannot trace a single request through the system
- Cannot measure end-to-end latency
- Cannot identify which service is slow
- Cannot debug cross-service issues

**2. Logs Are Unstructured and Unparseable**

Current log entry:
```
[Nest] 12345  - 11/05/2024, 2:30:45 PM     LOG [IndexingProcessor] Processing file indexing job: Job ID: abc123, File ID: xyz789
```

Problems:
- Plain text format
- Cannot extract Job ID programmatically
- Cannot filter by File ID
- Cannot aggregate metrics
- Cannot build dashboards

**3. No Centralized Log Management**

Current state:
- API Gateway logs → stdout (lost after container restart)
- Auth Service logs → stdout (lost after container restart)
- Datasource Service logs → stdout (lost after container restart)
- Indexing Service logs → stdout (lost after container restart)
- Retrieval Service logs → none

To debug an issue:
1. SSH into 6 different containers
2. Manually search logs with grep
3. Try to correlate timestamps
4. Pray logs weren't rotated

**4. Performance Monitoring is Impossible**

Cannot answer questions like:
- How long does document indexing take?
- Which service is the bottleneck?
- What's the 95th percentile response time?
- Are we experiencing slowdowns?

### User Stories

**US-1: As a developer, I want to trace a user request across all microservices**
- Given: User uploads a document via CMS
- When: Request flows through Gateway → Auth → Datasource → Indexing
- Then: I can see the entire request flow in one trace view
- Then: I can measure latency at each service hop

**US-2: As an operations engineer, I want to search logs across all services**
- Given: A user reports "upload failed"
- When: I search for their user ID
- Then: I see all logs related to that user across all services
- Then: Logs are correlated by request ID

**US-3: As a product manager, I want to monitor system health in real-time**
- Given: Production system is running
- When: I open monitoring dashboard
- Then: I see request rates, error rates, latencies for each service
- Then: I receive alerts when errors spike

**US-4: As a security auditor, I want to audit all file access**
- Given: Compliance requirement to track data access
- When: I query audit logs
- Then: I see who accessed which documents, when, and from where
- Then: Logs include user ID, IP address, document ID, timestamp

---

## Proposed Solution

### Solution Architecture

We will implement a **comprehensive observability stack** with three pillars:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Observability Stack                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   LOGS       │  │   METRICS    │  │   TRACES     │         │
│  │  (Pino +     │  │ (Prometheus) │  │(OpenTelemetry│         │
│  │   Loki)      │  │              │  │  + Tempo)    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                    ┌───────▼────────┐                          │
│                    │    Grafana     │                          │
│                    │  (Unified UI)  │                          │
│                    └────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Pillar 1: Structured Logging with Pino + Loki

**Technology:** Pino (logger) + Grafana Loki (storage)

**Why Pino?**
- **5x faster** than Winston (critical at scale)
- Native JSON output (structured)
- Low memory overhead
- Battle-tested (used by Netflix, Red Hat)
- Excellent NestJS integration

**Why Grafana Loki?**
- **Cost-effective:** Indexes only metadata (not full logs)
- **Scalable:** Handles billions of log entries
- **Kubernetes-native:** Built for cloud environments
- **Integrated with Grafana:** Unified observability UI
- **Low storage cost:** Uses object storage (S3, MinIO)

**Features:**
- JSON structured logs
- Log levels per service (debug, info, warn, error)
- Correlation IDs in every log entry
- Automatic log aggregation
- Fast search and filtering

### Pillar 2: Distributed Tracing with OpenTelemetry + Tempo

**Technology:** OpenTelemetry (instrumentation) + Grafana Tempo (storage)

**Why OpenTelemetry?**
- **Industry standard:** Vendor-neutral, CNCF project
- **Auto-instrumentation:** Works with HTTP, gRPC, database calls
- **Correlation:** Automatically links logs and traces
- **Rich ecosystem:** Works with any backend (Tempo, Jaeger, Zipkin)

**Why Grafana Tempo?**
- **High scale:** Handles millions of traces
- **Cost-effective:** Uses object storage
- **No sampling required:** Store 100% of traces
- **Grafana integration:** Seamless navigation logs ↔ traces

**Features:**
- Trace every request across all services
- Automatic span creation for HTTP/TCP calls
- Database query tracking
- External API call tracking
- Visual trace waterfall diagrams

### Pillar 3: Metrics with Prometheus + Grafana

**Technology:** Prometheus (metrics collection) + Grafana (visualization)

**Metrics to Track:**
- Request rate (requests/sec per service)
- Error rate (errors/sec per service)
- Request duration (p50, p95, p99 latencies)
- Queue depth (BullMQ job counts)
- Database connection pool usage
- External API call success rate

**Features:**
- Real-time dashboards
- Alerting (PagerDuty, Slack integration)
- Historical trend analysis
- SLA monitoring

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Microservices                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Gateway  │  │   Auth   │  │Datasource│  │ Indexing │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │              │              │             │
│       ▼             ▼              ▼              ▼             │
│  ┌──────────────────────────────────────────────────────┐      │
│  │         Pino Logger (JSON structured logs)           │      │
│  │  • Correlation ID (X-Request-ID)                     │      │
│  │  • Trace ID (from OpenTelemetry)                     │      │
│  │  • Service name, user ID, endpoint, duration         │      │
│  └─────────────────────┬────────────────────────────────┘      │
│                        │                                        │
│       ┌────────────────┼────────────────┐                      │
│       ▼                ▼                ▼                      │
│  ┌─────────┐   ┌──────────────┐   ┌─────────┐                │
│  │  Loki   │   │OpenTelemetry │   │Prometheus│               │
│  │ (Logs)  │   │  Collector   │   │(Metrics) │               │
│  └────┬────┘   └──────┬───────┘   └────┬─────┘                │
│       │               │                 │                      │
│       │               ▼                 │                      │
│       │        ┌─────────────┐          │                      │
│       │        │    Tempo    │          │                      │
│       │        │  (Traces)   │          │                      │
│       │        └──────┬──────┘          │                      │
│       │               │                 │                      │
│       └───────────────┼─────────────────┘                      │
│                       ▼                                        │
│              ┌─────────────────┐                              │
│              │    Grafana      │                              │
│              │  (Unified UI)   │                              │
│              └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow Example

```
1. Client → POST /files/single
   ├─ Generate Request ID: req-a1b2c3d4
   ├─ Generate Trace ID: trace-x9y8z7w6
   └─ Log: {"level":"info","msg":"Incoming request","requestId":"req-a1b2c3d4","traceId":"trace-x9y8z7w6"}

2. API Gateway → Auth Service (TCP verify_token)
   ├─ Propagate Request ID header
   ├─ Create span: "auth.verify_token"
   └─ Log: {"level":"info","msg":"TCP call","requestId":"req-a1b2c3d4","traceId":"trace-x9y8z7w6","service":"auth"}

3. API Gateway → Datasource Service (HTTP proxy)
   ├─ Propagate Request ID header
   ├─ Create span: "datasource.create_file"
   └─ Log: {"level":"info","msg":"Creating file record","requestId":"req-a1b2c3d4","traceId":"trace-x9y8z7w6"}

4. Datasource Service → MinIO (presigned URL)
   ├─ Create span: "minio.generate_presigned_url"
   └─ Log: {"level":"info","msg":"Generated presigned URL","requestId":"req-a1b2c3d4","duration":45}

5. Datasource Service → BullMQ (emit job)
   ├─ Create span: "bullmq.add_job"
   └─ Log: {"level":"info","msg":"Emitted indexing job","requestId":"req-a1b2c3d4","jobId":"job-xyz"}

6. Indexing Service → (process job)
   ├─ Inherit Request ID from job data
   ├─ Create span: "indexing.process_file"
   └─ Log: {"level":"info","msg":"Processing file","requestId":"req-a1b2c3d4","fileId":"file-123"}

Result: Full trace in Grafana showing 6 spans with timing
```

---

## Technology Selection

### Decision Matrix

| Solution | Performance | Cost | Integration | Scalability | Ecosystem | Score |
|----------|-------------|------|-------------|-------------|-----------|-------|
| **Pino + Loki + Tempo** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **23/25** |
| Winston + ELK Stack | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 21/25 |
| DataDog | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 24/25 |
| Bunyan + CloudWatch | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 16/25 |

### Selected Stack: Pino + Loki + OpenTelemetry + Tempo

**Why This Stack?**

1. **Performance:**
   - Pino: 5x faster than Winston
   - Loki: Indexes metadata only (low overhead)
   - Tempo: No sampling required (store all traces)

2. **Cost:**
   - All open-source (no licensing fees)
   - Loki uses object storage (cheaper than Elasticsearch)
   - Self-hosted or managed (Grafana Cloud)

3. **Integration:**
   - Pino: Official NestJS integration
   - OpenTelemetry: Auto-instrumentation for NestJS
   - Grafana: Unified UI for logs, traces, metrics

4. **Scalability:**
   - Proven at Netflix scale (billions of logs)
   - Kubernetes-native
   - Horizontal scaling support

5. **Ecosystem:**
   - CNCF projects (OpenTelemetry, Prometheus)
   - Large community
   - Grafana marketplace (plugins, dashboards)

### Rejected Alternatives

**ELK Stack (Elasticsearch, Logstash, Kibana)**
- ❌ High resource usage (Elasticsearch is memory-heavy)
- ❌ Complex setup and maintenance
- ❌ Higher cost at scale
- ✅ Powerful full-text search (but overkill for our use case)

**DataDog**
- ❌ Expensive ($300-1000/month for our scale)
- ❌ Vendor lock-in
- ✅ Easiest setup
- ✅ Best-in-class UI

**Winston + CloudWatch**
- ❌ Slower performance than Pino
- ❌ AWS-specific (vendor lock-in)
- ❌ Higher cost than Loki
- ✅ Good integration with AWS

---

## Architecture Design

### Logging Architecture

#### Log Structure (JSON)

Every log entry will follow this structure:

```typescript
interface LogEntry {
  // Standard fields (always present)
  timestamp: string;        // ISO 8601: "2025-11-05T14:30:45.123Z"
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  service: string;          // "api-gateway", "auth-service", etc.
  message: string;          // Human-readable message

  // Request context (when available)
  requestId?: string;       // "req-a1b2c3d4" (X-Request-ID header)
  traceId?: string;         // "trace-x9y8z7w6" (OpenTelemetry)
  spanId?: string;          // "span-m5n6o7p8" (OpenTelemetry)
  userId?: string;          // "user-123" (from JWT)
  userEmail?: string;       // "user@example.com"

  // HTTP context (API requests)
  http?: {
    method: string;         // "POST"
    url: string;            // "/files/single"
    statusCode: number;     // 201
    duration: number;       // 145 (milliseconds)
    userAgent?: string;
    ip?: string;
  };

  // Error context (error logs)
  error?: {
    name: string;           // "ValidationError"
    message: string;        // "File size exceeds limit"
    stack?: string;         // Full stack trace
    code?: string;          // "FILE_TOO_LARGE"
  };

  // Custom context (service-specific)
  context?: {
    fileId?: string;
    documentId?: string;
    jobId?: string;
    chunkCount?: number;
    // ... any service-specific fields
  };
}
```

**Example Log Entries:**

```json
{
  "timestamp": "2025-11-05T14:30:45.123Z",
  "level": "info",
  "service": "api-gateway",
  "message": "Incoming request",
  "requestId": "req-a1b2c3d4",
  "traceId": "trace-x9y8z7w6",
  "http": {
    "method": "POST",
    "url": "/files/single",
    "userAgent": "Mozilla/5.0..."
  },
  "userId": "user-123",
  "userEmail": "john@example.com"
}
```

```json
{
  "timestamp": "2025-11-05T14:30:46.789Z",
  "level": "error",
  "service": "indexing-service",
  "message": "Failed to process file",
  "requestId": "req-a1b2c3d4",
  "traceId": "trace-x9y8z7w6",
  "error": {
    "name": "ParseError",
    "message": "Invalid PDF structure",
    "stack": "ParseError: Invalid PDF structure\n    at PDFParser.parse...",
    "code": "PDF_PARSE_ERROR"
  },
  "context": {
    "fileId": "file-xyz789",
    "documentId": "doc-abc123",
    "jobId": "job-456"
  }
}
```

#### Pino Configuration

```typescript
// shared/logging/pino.config.ts
import pino from 'pino';
import { InjectPinoLogger } from 'nestjs-pino';

export const pinoConfig = {
  // Pretty print in development, JSON in production
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),

  // Log level
  level: process.env.LOG_LEVEL || 'info',

  // Base fields (included in every log)
  base: {
    service: process.env.SERVICE_NAME,
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'accessToken',
      'refreshToken',
    ],
    remove: true,
  },

  // Timestamp format
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
};
```

#### NestJS Integration

```typescript
// main.ts (each service)
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until logger is ready
  });

  // Use Pino as the global logger
  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT);
}
```

```typescript
// app.module.ts
import { LoggerModule } from 'nestjs-pino';
import { pinoConfig } from './shared/logging/pino.config';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        ...pinoConfig,

        // Customize request logging
        customProps: (req, res) => ({
          requestId: req.headers['x-request-id'],
          traceId: req.headers['x-trace-id'],
          userId: req.headers['x-user-id'],
        }),

        // Log request/response
        autoLogging: {
          ignore: (req) => req.url === '/health', // Ignore health checks
        },
      },
    }),
  ],
})
export class AppModule {}
```

#### Service Usage

```typescript
// Example: files.service.ts
import { Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class FilesService {
  constructor(
    @InjectPinoLogger(FilesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createFile(data: CreateFileDto, userId: string): Promise<File> {
    this.logger.info(
      {
        context: {
          documentId: data.documentId,
          filename: data.filename,
          fileSize: data.fileSize,
        },
        userId,
      },
      'Creating file record',
    );

    try {
      const file = await this.filesRepository.create(data);

      this.logger.info(
        {
          context: { fileId: file.id },
          userId,
        },
        'File record created successfully',
      );

      return file;
    } catch (error) {
      this.logger.error(
        {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          context: {
            documentId: data.documentId,
            filename: data.filename,
          },
          userId,
        },
        'Failed to create file record',
      );
      throw error;
    }
  }
}
```

### Distributed Tracing Architecture

#### OpenTelemetry Setup

**1. Install Dependencies**
```bash
npm install --save @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

**2. Tracer Configuration**
```typescript
// shared/tracing/tracer.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracer(serviceName: string): NodeSDK {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
    }),

    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318/v1/traces',
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
        // Auto-instrument HTTP, Express, gRPC, etc.
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        '@opentelemetry/instrumentation-mysql2': { enabled: true },
        '@opentelemetry/instrumentation-redis': { enabled: true },
      }),
    ],
  });

  sdk.start();

  return sdk;
}
```

**3. Bootstrap Integration**
```typescript
// main.ts
import { initTracer } from './shared/tracing/tracer';

// IMPORTANT: Initialize tracer BEFORE anything else
const tracer = initTracer('ltv-assistant-indexing');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ... rest of bootstrap
}

bootstrap();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await tracer.shutdown();
  process.exit(0);
});
```

#### Manual Span Creation

For custom operations not auto-instrumented:

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ltv-assistant-indexing');

async function processFile(fileId: string): Promise<void> {
  // Create a span
  const span = tracer.startSpan('process_file', {
    attributes: {
      'file.id': fileId,
      'operation': 'indexing',
    },
  });

  // Set span as active context
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Your logic here
      const result = await this.indexFile(fileId);

      // Add span attributes
      span.setAttribute('file.chunks', result.chunkCount);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      // Record error
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

#### Context Propagation (Cross-Service)

**HTTP Context Propagation:**
```typescript
// Middleware to ensure trace context propagation
import { Injectable, NestMiddleware } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';

@Injectable()
export class TracingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Extract trace context from headers
    const ctx = propagation.extract(context.active(), req.headers);

    // Set as active context
    context.with(ctx, () => {
      next();
    });
  }
}
```

**TCP Context Propagation:**
```typescript
// TCP client wrapper with tracing
import { trace, context } from '@opentelemetry/api';

async function tcpCall<T>(
  pattern: { cmd: string },
  data: unknown,
): Promise<T> {
  const span = trace.getTracer('tcp-client').startSpan('tcp_call', {
    attributes: {
      'rpc.system': 'tcp',
      'rpc.service': pattern.cmd,
    },
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Inject trace context into data
      const carrier = {};
      propagation.inject(context.active(), carrier);

      const result = await this.tcpClient.send(pattern, {
        ...data,
        _traceContext: carrier,
      }).toPromise();

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Correlation ID Strategy

**Request ID Generation:**
```typescript
// Middleware to generate/extract request IDs
import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Extract existing request ID or generate new one
    const requestId = req.headers['x-request-id'] as string || `req-${uuidv4()}`;

    // Attach to request
    req['requestId'] = requestId;

    // Return in response headers
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
```

**Job Context Propagation:**
```typescript
// Propagate request ID through BullMQ jobs
async addFileIndexingJob(
  jobData: FileJobData,
  requestId: string,
): Promise<void> {
  await this.fileIndexingQueue.add('index-file', {
    ...jobData,
    _requestId: requestId,  // Propagate request ID
    _traceId: trace.getActiveSpan()?.spanContext().traceId,
  });
}

// Processor: restore context
@Process('index-file')
async processFileIndex(job: Job<FileJobData>): Promise<void> {
  const requestId = job.data._requestId;
  const traceId = job.data._traceId;

  this.logger.info(
    { requestId, traceId, jobId: job.id },
    'Processing file indexing job',
  );
}
```

### Log Aggregation with Grafana Loki

#### Docker Compose Setup

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki-config.yaml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - /var/log:/var/log
      - ./monitoring/promtail-config.yaml:/etc/promtail/config.yaml
    command: -config.file=/etc/promtail/config.yaml
    depends_on:
      - loki

  tempo:
    image: grafana/tempo:2.3.0
    ports:
      - "4318:4318"  # OTLP HTTP
      - "3200:3200"  # Tempo query
    volumes:
      - ./monitoring/tempo-config.yaml:/etc/tempo/tempo.yaml
      - tempo-data:/var/tempo
    command: -config.file=/etc/tempo/tempo.yaml

  prometheus:
    image: prom/prometheus:v2.47.0
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:10.1.0
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - ./monitoring/grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
      - ./monitoring/grafana-dashboards.yml:/etc/grafana/provisioning/dashboards/dashboards.yml
      - grafana-data:/var/lib/grafana
    depends_on:
      - loki
      - tempo
      - prometheus

volumes:
  loki-data:
  tempo-data:
  prometheus-data:
  grafana-data:
```

#### Loki Configuration

```yaml
# monitoring/loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 744h  # 31 days
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32
```

#### Service Log Shipping

Each NestJS service ships logs to Loki via HTTP:

```typescript
// Install pino-loki
npm install --save pino-loki

// Pino transport configuration
const pinoLokiTransport = pino.transport({
  target: 'pino-loki',
  options: {
    batching: true,
    interval: 5,
    host: process.env.LOKI_URL || 'http://loki:3100',
    labels: {
      service: process.env.SERVICE_NAME,
      environment: process.env.NODE_ENV,
    },
  },
});
```

---

## Implementation Plan

### Phase 1: Foundation Setup (Week 1)

**Goals:**
- Set up Grafana stack (Loki, Tempo, Prometheus, Grafana)
- Install Pino in all services
- Replace console.log with structured logging

**Tasks:**

**1.1 Infrastructure Setup**
- [ ] Create `docker-compose.monitoring.yml`
- [ ] Add Loki, Tempo, Prometheus, Grafana services
- [ ] Configure Loki for log retention (31 days)
- [ ] Configure Tempo for trace retention (7 days)
- [ ] Set up Grafana with datasources
- [ ] Test connectivity between services

**1.2 Shared Logging Library**
- [ ] Create `shared/logging` module
- [ ] Implement Pino configuration
- [ ] Create typed log interfaces
- [ ] Add redaction rules (passwords, tokens)
- [ ] Document logging standards

**1.3 Replace Console Logging**

Per service:
- [ ] **API Gateway:** Remove all console.log/error
- [ ] **Auth Service:** Remove console.log in main.ts
- [ ] **Datasource Service:** Remove console.log in main.ts, database.module.ts
- [ ] **Indexing Service:** Migrate extensive Logger usage to Pino
- [ ] **Retrieval Service:** Add logging (currently none)

**1.4 Testing**
- [ ] Verify JSON logs output
- [ ] Verify logs appear in Loki
- [ ] Test log filtering by service
- [ ] Test log search by request ID

**Deliverables:**
- All services logging to Loki
- Grafana accessible at localhost:3000
- Basic log search working

---

### Phase 2: Distributed Tracing (Week 2)

**Goals:**
- Implement OpenTelemetry in all services
- Auto-instrument HTTP, TCP, database calls
- Propagate trace context across services

**Tasks:**

**2.1 OpenTelemetry Setup**
- [ ] Create `shared/tracing` module
- [ ] Implement tracer initialization
- [ ] Configure OTLP exporter (Tempo)
- [ ] Add auto-instrumentation

**2.2 Service Integration**

Per service:
- [ ] **API Gateway:**
  - [ ] Initialize tracer in main.ts
  - [ ] Add tracing middleware
  - [ ] Propagate trace context in proxied requests
- [ ] **Auth Service:**
  - [ ] Initialize tracer
  - [ ] Instrument TCP controllers
  - [ ] Instrument database queries
- [ ] **Datasource Service:**
  - [ ] Initialize tracer
  - [ ] Instrument MinIO calls
  - [ ] Instrument BullMQ job emission
- [ ] **Indexing Service:**
  - [ ] Initialize tracer
  - [ ] Instrument LangGraph workflow
  - [ ] Create spans for each stage (load, parse, chunk, etc.)
- [ ] **Retrieval Service:**
  - [ ] Initialize tracer
  - [ ] Instrument RAG workflow
  - [ ] Instrument Qdrant/MySQL queries

**2.3 Context Propagation**
- [ ] Implement HTTP header propagation
- [ ] Implement TCP context propagation
- [ ] Implement BullMQ job context propagation
- [ ] Test end-to-end trace continuity

**2.4 Testing**
- [ ] Upload file → verify trace spans across all services
- [ ] Query document → verify RAG workflow trace
- [ ] Test trace waterfall visualization in Grafana

**Deliverables:**
- Full request tracing across 6 services
- Trace visualization in Grafana
- 100% trace coverage for key flows

---

### Phase 3: Request Context & Correlation (Week 3)

**Goals:**
- Implement request ID generation and propagation
- Add user context to all logs
- Link logs to traces

**Tasks:**

**3.1 Request ID Middleware**
- [ ] Create RequestIdMiddleware
- [ ] Add to API Gateway
- [ ] Propagate via X-Request-ID header
- [ ] Return X-Request-ID in responses

**3.2 User Context Extraction**
- [ ] Extract user ID from JWT (via Auth service)
- [ ] Add user context to logs
- [ ] Add user context to traces

**3.3 Log-Trace Correlation**
- [ ] Add traceId to every log entry
- [ ] Configure Grafana to link logs ↔ traces
- [ ] Test navigation from log to trace

**3.4 Testing**
- [ ] Verify request ID propagation
- [ ] Verify user ID in logs
- [ ] Test log-to-trace navigation
- [ ] Test filtering logs by user ID

**Deliverables:**
- Request ID in all logs
- User context in logs and traces
- Seamless log ↔ trace navigation in Grafana

---

### Phase 4: Metrics & Dashboards (Week 4)

**Goals:**
- Implement Prometheus metrics
- Create Grafana dashboards
- Set up alerting

**Tasks:**

**4.1 Prometheus Metrics**
- [ ] Install `@willsoto/nestjs-prometheus`
- [ ] Add metrics endpoints to each service
- [ ] Define custom metrics:
  - [ ] Request rate by service
  - [ ] Error rate by service
  - [ ] Request duration (p50, p95, p99)
  - [ ] Database query duration
  - [ ] BullMQ queue depth
  - [ ] Active job count

**4.2 Grafana Dashboards**
- [ ] Create "System Overview" dashboard
  - [ ] Request rate across all services
  - [ ] Error rate across all services
  - [ ] Latency heatmap
- [ ] Create "Service Health" dashboard per service
  - [ ] Request count
  - [ ] Error rate
  - [ ] Latency percentiles
  - [ ] Database connections
- [ ] Create "Indexing Pipeline" dashboard
  - [ ] Jobs queued
  - [ ] Jobs processing
  - [ ] Jobs completed
  - [ ] Jobs failed
  - [ ] Average processing time
- [ ] Create "RAG Performance" dashboard
  - [ ] Query rate
  - [ ] Average query latency
  - [ ] Qdrant query time
  - [ ] LLM generation time

**4.3 Alerting**
- [ ] Configure alert rules:
  - [ ] Error rate > 5% for 5 minutes
  - [ ] Latency p95 > 2s for 5 minutes
  - [ ] Service down
  - [ ] BullMQ queue depth > 1000
- [ ] Set up notification channels (Slack, email)

**4.4 Testing**
- [ ] Verify metrics collection
- [ ] Verify dashboards update in real-time
- [ ] Test alert firing and resolution

**Deliverables:**
- 4+ production-ready Grafana dashboards
- Prometheus metrics from all services
- Alerting configured

---

## Migration Strategy

### Migration Approach: Gradual Rollout

**Strategy:** Migrate one service at a time, starting with lowest risk.

**Migration Order:**
1. **Retrieval Service** (Week 1) - Currently has zero logging
2. **Datasource Service** (Week 1-2) - Moderate logging
3. **Auth Service** (Week 2) - Critical but simple
4. **API Gateway** (Week 2-3) - Critical but straightforward
5. **Indexing Service** (Week 3) - Highest complexity, most logs

**Why This Order?**
- Start with low-impact services
- Build confidence before touching critical services
- Indexing service last (most complex, but least critical for user-facing features)

### Per-Service Migration Steps

**Template for Each Service:**

**Step 1: Backup Current Logs**
```bash
# Capture current logs for comparison
docker-compose logs [service-name] > logs-before-migration.txt
```

**Step 2: Install Dependencies**
```bash
npm install --save \
  nestjs-pino pino-http pino-loki \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

**Step 3: Configure Logging**
```typescript
// Import shared logging module
import { LoggerModule } from '@shared/logging';

@Module({
  imports: [
    LoggerModule.forRoot({
      serviceName: 'ltv-assistant-[service]',
    }),
  ],
})
```

**Step 4: Replace Logger Instances**
```bash
# Find all Logger usage
grep -r "new Logger" src/

# Replace with Pino
# Before:
private readonly logger = new Logger(MyService.name);

# After:
constructor(
  @InjectPinoLogger(MyService.name)
  private readonly logger: PinoLogger,
) {}
```

**Step 5: Update Log Calls**
```typescript
// Before:
this.logger.log('Processing file');
this.logger.error('Failed to process', error.stack);

// After:
this.logger.info({ context: { fileId } }, 'Processing file');
this.logger.error(
  {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context: { fileId },
  },
  'Failed to process file',
);
```

**Step 6: Initialize Tracing**
```typescript
// main.ts - before bootstrap
import { initTracer } from '@shared/tracing';

const tracer = initTracer('ltv-assistant-[service]');

async function bootstrap() {
  // ... existing code
}
```

**Step 7: Test in Development**
```bash
# Start service
npm run start:dev

# Generate test traffic
# Verify logs in Loki
# Verify traces in Tempo
```

**Step 8: Deploy to Staging**
```bash
# Deploy updated service
# Run smoke tests
# Verify logs and traces
# Compare with old logs
```

**Step 9: Deploy to Production**
```bash
# Deploy with feature flag (optional)
# Monitor for 24 hours
# Verify no errors
# Mark as complete
```

### Rollback Plan

If issues arise during migration:

**Rollback Steps:**
1. Revert to previous Docker image
2. Restart service
3. Verify logging restored
4. Investigate issue offline

**Rollback Triggers:**
- Logging completely broken (no logs)
- Performance degradation (>20% slower)
- Critical errors in production
- Memory leak detected

---

## Configuration Management

### Environment Variables

Each service will require these environment variables:

```bash
# Logging
LOG_LEVEL=info                  # debug, info, warn, error
LOKI_URL=http://loki:3100      # Loki endpoint

# Tracing
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318/v1/traces
OTEL_SERVICE_NAME=ltv-assistant-indexing
OTEL_TRACES_SAMPLER=always_on  # or parentbased_always_on

# Metrics
METRICS_PORT=9464              # Prometheus metrics endpoint

# Service Metadata
SERVICE_NAME=indexing-service
APP_VERSION=1.0.0
NODE_ENV=production
```

### Centralized Configuration

Create `.env.monitoring` for all observability settings:

```bash
# .env.monitoring
LOG_LEVEL=info
LOKI_URL=http://loki:3100
TEMPO_URL=http://tempo:4318
PROMETHEUS_URL=http://prometheus:9090
GRAFANA_URL=http://grafana:3000
OTEL_TRACES_SAMPLER=always_on
METRICS_ENABLED=true
```

Reference in docker-compose:

```yaml
services:
  api-gateway:
    env_file:
      - .env
      - .env.monitoring
```

### Log Levels by Environment

```bash
# Development
LOG_LEVEL=debug

# Staging
LOG_LEVEL=info

# Production
LOG_LEVEL=warn  # Less verbose
```

---

## Testing Strategy

### Unit Tests

**Test Log Output:**
```typescript
// files.service.spec.ts
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';

describe('FilesService', () => {
  let service: FilesService;
  let logger: Logger;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: Logger,
          useValue: {
            info: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(FilesService);
    logger = module.get(Logger);
  });

  it('should log file creation', async () => {
    await service.createFile({ filename: 'test.pdf' });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          filename: 'test.pdf',
        }),
      }),
      'Creating file record',
    );
  });
});
```

### Integration Tests

**Test End-to-End Tracing:**
```typescript
// e2e/tracing.e2e-spec.ts
describe('Distributed Tracing (e2e)', () => {
  it('should trace file upload flow', async () => {
    // 1. Upload file
    const response = await request(app.getHttpServer())
      .post('/files/single')
      .send({ filename: 'test.pdf' });

    const requestId = response.headers['x-request-id'];
    const traceId = response.headers['x-trace-id'];

    expect(requestId).toBeDefined();
    expect(traceId).toBeDefined();

    // 2. Wait for processing
    await sleep(2000);

    // 3. Query Tempo for trace
    const trace = await tempoClient.getTrace(traceId);

    // 4. Verify spans
    expect(trace.spans).toContainEqual(
      expect.objectContaining({
        serviceName: 'api-gateway',
        operationName: 'POST /files/single',
      }),
    );

    expect(trace.spans).toContainEqual(
      expect.objectContaining({
        serviceName: 'datasource-service',
        operationName: 'create_file',
      }),
    );

    expect(trace.spans).toContainEqual(
      expect.objectContaining({
        serviceName: 'indexing-service',
        operationName: 'process_file',
      }),
    );
  });
});
```

### Load Testing

Test logging performance under load:

```bash
# Generate 1000 requests
for i in {1..1000}; do
  curl -X POST http://localhost:50050/files/single \
    -H "Content-Type: application/json" \
    -d '{"filename": "test.pdf"}' &
done

# Monitor:
# - Log throughput (logs/sec)
# - Trace throughput (traces/sec)
# - Loki ingestion lag
# - Tempo ingestion lag
```

**Acceptance Criteria:**
- ✅ Log throughput: >10,000 logs/sec
- ✅ Trace throughput: >1,000 traces/sec
- ✅ Loki lag: <5 seconds
- ✅ Tempo lag: <2 seconds
- ✅ Application latency increase: <5%

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All services migrated to Pino
- [ ] All services instrumented with OpenTelemetry
- [ ] Monitoring stack deployed (Loki, Tempo, Prometheus, Grafana)
- [ ] Dashboards created and tested
- [ ] Alerting configured
- [ ] Documentation updated
- [ ] Team trained on new logging

### Deployment Steps

**Stage 1: Deploy Monitoring Stack**
```bash
# Start monitoring services
docker-compose -f docker-compose.monitoring.yml up -d

# Verify services
docker-compose -f docker-compose.monitoring.yml ps

# Access Grafana
open http://localhost:3000
```

**Stage 2: Deploy Services (One at a Time)**
```bash
# Deploy retrieval service (lowest risk)
docker-compose up -d ltv-assistant-retrieval

# Monitor for 1 hour
# Check logs in Grafana
# Check metrics

# If successful, proceed to next service
docker-compose up -d ltv-assistant-datasource
```

**Stage 3: Verify Each Service**
```bash
# Check logs appearing in Loki
curl http://localhost:3100/loki/api/v1/query \
  -G --data-urlencode 'query={service="ltv-assistant-retrieval"}'

# Check traces in Tempo
curl http://localhost:3200/api/search

# Check metrics in Prometheus
curl http://localhost:9090/api/v1/query \
  -G --data-urlencode 'query=up{job="ltv-assistant-retrieval"}'
```

**Stage 4: Full System Test**
```bash
# Run end-to-end tests
npm run test:e2e

# Perform manual smoke tests
# - Upload file
# - Query document
# - Verify all traces

# Monitor dashboards for 24 hours
```

### Post-Deployment Verification

**Day 1: Monitoring**
- [ ] All services logging to Loki
- [ ] All services sending traces to Tempo
- [ ] All services exporting metrics to Prometheus
- [ ] Dashboards showing data
- [ ] No error alerts

**Week 1: Validation**
- [ ] Review logs for anomalies
- [ ] Verify trace completeness
- [ ] Check alert false positive rate
- [ ] Gather team feedback

**Week 2: Optimization**
- [ ] Tune log levels
- [ ] Optimize trace sampling (if needed)
- [ ] Refine dashboards
- [ ] Update runbooks

---

## Monitoring & Alerting

### Key Metrics

**Service Health Metrics:**
```prometheus
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Request duration (p95)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Database query duration (p95)
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))

# Active connections
sum(db_connections_active) by (service)
```

**Indexing Pipeline Metrics:**
```prometheus
# Queue depth
bullmq_queue_waiting{queue="file-indexing"}

# Job processing rate
rate(bullmq_jobs_completed_total[5m])

# Job failure rate
rate(bullmq_jobs_failed_total[5m])

# Average job duration
avg(bullmq_job_duration_seconds) by (queue)
```

### Alert Rules

**Critical Alerts (PagerDuty):**

```yaml
# prometheus-alerts.yml
groups:
  - name: critical
    interval: 1m
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m])
          / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate >5% on {{ $labels.service }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "P95 latency >2s on {{ $labels.service }}"
```

**Warning Alerts (Slack):**

```yaml
  - name: warnings
    interval: 5m
    rules:
      - alert: HighQueueDepth
        expr: bullmq_queue_waiting > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Queue depth >1000 for {{ $labels.queue }}"

      - alert: SlowJobProcessing
        expr: avg(bullmq_job_duration_seconds) > 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Average job duration >5min"
```

### Runbooks

**Runbook: High Error Rate**

1. **Identify service:**
   - Check Grafana dashboard
   - Identify which service has high error rate

2. **Query logs:**
   ```logql
   {service="ltv-assistant-indexing"} |= "level=error"
   ```

3. **Check traces:**
   - Find failing traces
   - Identify bottleneck span

4. **Common causes:**
   - Database connection pool exhausted
   - External API timeout
   - Invalid data format

5. **Mitigation:**
   - Restart service if memory leak
   - Scale up if resource exhaustion
   - Rollback if new deployment

---

## Success Metrics

### Launch Criteria

**Must Have (P0):**
- [x] All services migrated to Pino
- [x] All services instrumented with OpenTelemetry
- [x] Logs aggregated in Loki (searchable)
- [x] Traces visible in Tempo
- [x] Metrics collected in Prometheus
- [x] 4+ Grafana dashboards created
- [x] Alerting configured and tested
- [x] Documentation complete
- [x] Team trained

**Nice to Have (P1):**
- [ ] Advanced trace analysis (Jaeger UI integration)
- [ ] Log-based alerts (Loki alerts)
- [ ] Custom Grafana plugins
- [ ] Automated dashboard provisioning

### Post-Launch Metrics (Week 1)

| Metric | Target | Actual |
|--------|--------|--------|
| Log ingestion rate | >1000 logs/sec | _____ |
| Trace ingestion rate | >100 traces/sec | _____ |
| Log search latency (p95) | <500ms | _____ |
| Trace query latency (p95) | <1s | _____ |
| Application latency increase | <5% | _____ |
| False positive alerts | <10/day | _____ |

### Developer Productivity Metrics (Month 1)

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Time to debug production issue | 4-8 hours | _____ | <2 hours |
| Time to find error logs | 30 min | _____ | <2 min |
| Ability to trace request flow | No | _____ | Yes |
| Team satisfaction (1-10) | 4 | _____ | 8+ |

---

## Risks & Mitigation

### Technical Risks

**Risk 1: Performance Degradation**
- **Probability:** Medium
- **Impact:** High
- **Mitigation:**
  - Benchmark before/after
  - Use asynchronous logging (Pino default)
  - Tune log levels (warn in production)
  - Monitor application latency

**Risk 2: Storage Costs**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Configure log retention (31 days)
  - Configure trace retention (7 days)
  - Use compressed storage
  - Monitor storage growth

**Risk 3: Missing Traces (Context Loss)**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Test context propagation thoroughly
  - Add explicit context injection for BullMQ jobs
  - Monitor trace completeness metric

**Risk 4: Learning Curve**
- **Probability:** High
- **Impact:** Low
- **Mitigation:**
  - Comprehensive documentation
  - Team training sessions
  - Create examples for common use cases
  - Dedicate time for onboarding

### Operational Risks

**Risk 5: Monitoring Stack Failure**
- **Probability:** Low
- **Impact:** High
- **Mitigation:**
  - High availability setup (replicas)
  - Automated backups
  - Disaster recovery plan
  - Fallback to local logs

**Risk 6: Alert Fatigue**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Start with conservative thresholds
  - Tune based on false positive rate
  - Use alert grouping
  - Regular alert review

---

## Appendix

### Appendix A: Glossary

- **Correlation ID:** Unique identifier linking related log entries across services
- **Distributed Tracing:** Tracking a request as it flows through multiple services
- **Grafana Loki:** Log aggregation system optimized for Kubernetes
- **Grafana Tempo:** Distributed tracing backend
- **OpenTelemetry:** Vendor-neutral observability framework
- **Pino:** High-performance JSON logger for Node.js
- **Prometheus:** Time-series metrics database
- **Span:** A single unit of work in a distributed trace
- **Trace:** Complete path of a request through the system

### Appendix B: Useful Queries

**Loki Queries (LogQL):**

```logql
# All error logs
{service=~"ltv-assistant-.*"} |= "level=error"

# Logs for specific request
{service=~"ltv-assistant-.*"} |= "requestId=req-abc123"

# Logs for specific user
{service=~"ltv-assistant-.*"} |= "userId=user-123"

# Failed file uploads
{service="ltv-assistant-datasource"} |= "level=error" |= "file"

# Slow queries (>1s)
{service=~"ltv-assistant-.*"} |= "duration" | json | duration > 1000
```

**Prometheus Queries (PromQL):**

```promql
# Request rate by service
sum(rate(http_requests_total[5m])) by (service)

# Error rate percentage
100 * sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
  / sum(rate(http_requests_total[5m])) by (service)

# P95 latency
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
)

# Queue depth over time
bullmq_queue_waiting{queue="file-indexing"}
```

### Appendix C: Dashboard Screenshots

*Include screenshots of Grafana dashboards here after creation*

1. System Overview Dashboard
2. Service Health Dashboard
3. Indexing Pipeline Dashboard
4. RAG Performance Dashboard
5. Trace View Example

### Appendix D: Training Materials

**Training Session Outline:**

1. **Introduction to Observability (30 min)**
   - Why we need structured logging
   - The three pillars: Logs, Metrics, Traces
   - Demo: Finding a bug with old vs new system

2. **Using Pino for Logging (45 min)**
   - JSON structured logs
   - Log levels and when to use them
   - Adding context to logs
   - Hands-on: Writing good log entries

3. **Distributed Tracing with OpenTelemetry (45 min)**
   - What is a trace and span
   - Auto-instrumentation
   - Manual span creation
   - Hands-on: Tracing a request

4. **Grafana Explore (30 min)**
   - Searching logs in Loki
   - Viewing traces in Tempo
   - Navigating from logs to traces
   - Hands-on: Debug a sample issue

5. **Dashboards & Alerts (30 min)**
   - Reading dashboards
   - Creating custom panels
   - Understanding alerts
   - On-call runbooks

### Appendix E: Code Examples

**Example 1: API Controller Logging**
```typescript
@Controller('files')
export class FilesController {
  constructor(
    @InjectPinoLogger(FilesController.name)
    private readonly logger: PinoLogger,
    private readonly filesService: FilesService,
  ) {}

  @Post('single')
  async uploadSingle(
    @Body() dto: UploadSingleDto,
    @Req() req: Request,
  ): Promise<UploadResponse> {
    const { userId, requestId } = req;

    this.logger.info(
      {
        userId,
        requestId,
        context: {
          filename: dto.filename,
          fileSize: dto.fileSize,
        },
      },
      'File upload initiated',
    );

    try {
      const result = await this.filesService.createUpload(dto, userId);

      this.logger.info(
        {
          userId,
          requestId,
          context: {
            fileId: result.fileId,
            uploadUrl: result.uploadUrl,
          },
        },
        'File upload URL generated',
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          userId,
          requestId,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          context: {
            filename: dto.filename,
          },
        },
        'File upload failed',
      );
      throw error;
    }
  }
}
```

**Example 2: Custom Span for Long Operation**
```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

async function indexDocument(documentId: string): Promise<void> {
  const tracer = trace.getTracer('indexing-service');
  const span = tracer.startSpan('index_document', {
    attributes: {
      'document.id': documentId,
    },
  });

  try {
    // Stage 1: Load
    const loadSpan = tracer.startSpan('load', { parent: span });
    const fileBuffer = await this.loadFile(documentId);
    loadSpan.end();

    // Stage 2: Parse
    const parseSpan = tracer.startSpan('parse', { parent: span });
    const parsed = await this.parse(fileBuffer);
    parseSpan.setAttribute('document.pages', parsed.pageCount);
    parseSpan.end();

    // Stage 3: Chunk
    const chunkSpan = tracer.startSpan('chunk', { parent: span });
    const chunks = await this.chunk(parsed);
    chunkSpan.setAttribute('chunks.count', chunks.length);
    chunkSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
}
```

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Engineering Lead | ___________ | ___________ | ___________ |
| Tech Lead | ___________ | ___________ | ___________ |
| DevOps Lead | ___________ | ___________ | ___________ |

---

**Document Status:** Draft
**Next Review:** 2025-11-12
**Version History:**
- v1.0 (2025-11-05): Initial plan created

---

**End of Document**
