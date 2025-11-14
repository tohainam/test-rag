# Super Admin Dashboards - Implementation Plan

**Version:** 1.0
**Date:** November 14, 2025
**Status:** Ready for Implementation
**Owner:** Frontend + Backend Team
**Tech Stack:** React 19, Mantine v7, Recharts, NestJS

---

## Overview

This plan details the step-by-step implementation of 25 super admin dashboards for the LTV Assistant CMS. The dashboards will provide non-technical admins with actionable insights into system health, RAG performance, data quality, user activity, and security.

**Reference:** See `/docs/super-admin-dashboards-specification.md` for full requirements.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│            ltv-assistant-cms (React Frontend)              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Dashboard Pages (Mantine Components)                │  │
│  │  - src/pages/admin/dashboards/                       │  │
│  │  - Uses: Mantine UI, Recharts, React Query          │  │
│  └────────────────┬─────────────────────────────────────┘  │
└───────────────────┼────────────────────────────────────────┘
                    │ HTTP/REST
┌───────────────────▼────────────────────────────────────────┐
│     ltv-assistant-cms Backend (NestJS) - NEW MODULE       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Dashboard API Module                                │  │
│  │  - src/dashboard/ (new)                              │  │
│  │  - Controllers, Services, DTOs                       │  │
│  └────┬──────────────┬──────────────┬────────────────────┘  │
└───────┼──────────────┼──────────────┼───────────────────────┘
        │              │              │
   ┌────▼─────┐  ┌────▼─────┐  ┌─────▼──────┐
   │   Loki   │  │Prometheus│  │   MySQL    │
   │   API    │  │   API    │  │  (Drizzle) │
   └──────────┘  └──────────┘  └────────────┘
```

---

## Tech Stack - Mantine Ecosystem

### Frontend (ltv-assistant-cms)
- **UI Framework:** Mantine v7 (already installed)
- **Charts:** Recharts (Mantine-compatible) + @mantine/charts (optional)
- **State:** React Query v5 (data fetching + caching)
- **Forms:** @mantine/form (for filters)
- **Hooks:** @mantine/hooks (useInterval for auto-refresh)
- **Notifications:** @mantine/notifications (for alerts)

### Backend
- **Framework:** NestJS (existing CMS backend)
- **Loki Client:** `@grafana/loki` or custom Axios client
- **Prometheus Client:** `prom-client` or custom Axios client
- **MySQL:** Drizzle ORM (already configured)
- **Validation:** class-validator, class-transformer
- **Caching:** @nestjs/cache-manager (Redis)

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2) - 5 Critical Dashboards
- 1.1 Overall System Status
- 1.4 Error & Alert Dashboard
- 2.1 Retrieval Quality Dashboard
- 3.1 Indexing Pipeline Dashboard
- 4.1 User Activity Dashboard

### Phase 2: Core Monitoring (Weeks 3-4) - 8 Dashboards
- 1.2 Service Performance
- 1.3 Infrastructure & Resource
- 2.2 Query Analytics
- 2.3 Cache Performance
- 3.2 Data Quality
- 3.3 Document Management
- 4.2 API Token Dashboard
- 5.1 Access Control

### Phase 3: Advanced Analytics (Weeks 5-6) - 12 Dashboards
- All remaining dashboards

### Phase 4: Polish & Optimization (Week 7)
- Performance optimization
- Mobile responsiveness
- Documentation

---

## Phase 1: Foundation Setup

---

## Step 1: Project Setup (Day 1)

### 1.1 Install Dependencies

**Frontend (ltv-assistant-cms):**

```bash
cd ltv-assistant-cms

# Charts library
npm install recharts

# Additional Mantine packages
npm install @mantine/charts @mantine/notifications @mantine/hooks

# React Query
npm install @tanstack/react-query @tanstack/react-query-devtools

# Date utilities
npm install date-fns

# TypeScript types
npm install -D @types/recharts
```

**Backend (ltv-assistant-cms or new service):**

```bash
# If using existing CMS backend, no new dependencies needed
# If creating new dashboard service:

npm install @nestjs/axios @nestjs/cache-manager cache-manager-redis-store
npm install class-validator class-transformer
npm install date-fns
```

### 1.2 Create Directory Structure

**Frontend:**

```bash
cd ltv-assistant-cms/src

# Create dashboard directories
mkdir -p pages/admin/dashboards
mkdir -p pages/admin/dashboards/system-health
mkdir -p pages/admin/dashboards/rag-performance
mkdir -p pages/admin/dashboards/data-management
mkdir -p pages/admin/dashboards/users-activity
mkdir -p pages/admin/dashboards/security
mkdir -p pages/admin/dashboards/business

# Create shared components
mkdir -p components/dashboard
mkdir -p components/dashboard/widgets
mkdir -p components/dashboard/charts
mkdir -p components/dashboard/cards

# Create API client
mkdir -p api/dashboard

# Create types
mkdir -p types/dashboard
```

**Backend:**

```bash
cd ltv-assistant-cms/src  # or backend root

# Create dashboard module
mkdir -p dashboard
mkdir -p dashboard/controllers
mkdir -p dashboard/services
mkdir -p dashboard/dto
mkdir -p dashboard/clients
```

### 1.3 Setup React Query Provider

**File:** `ltv-assistant-cms/src/App.tsx`

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Notifications } from '@mantine/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30s
      cacheTime: 300000, // 5min
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <Notifications position="top-right" />
        {/* Your app routes */}
        <RouterProvider router={router} />
      </MantineProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

---

## Step 2: Backend - Dashboard API Module (Days 2-3)

### 2.1 Create Dashboard Module

**File:** `src/dashboard/dashboard.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

import { SystemHealthController } from './controllers/system-health.controller';
import { RetrievalController } from './controllers/retrieval.controller';
import { IndexingController } from './controllers/indexing.controller';
import { UserActivityController } from './controllers/user-activity.controller';

import { LokiClient } from './clients/loki.client';
import { PrometheusClient } from './clients/prometheus.client';
import { DashboardService } from './services/dashboard.service';

@Module({
  imports: [
    HttpModule,
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      ttl: 30, // 30 seconds default
    }),
  ],
  controllers: [
    SystemHealthController,
    RetrievalController,
    IndexingController,
    UserActivityController,
  ],
  providers: [
    LokiClient,
    PrometheusClient,
    DashboardService,
  ],
})
export class DashboardModule {}
```

### 2.2 Create Loki Client

**File:** `src/dashboard/clients/loki.client.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface LokiQueryOptions {
  query: string;
  start?: number; // Unix timestamp
  end?: number;
  limit?: number;
  direction?: 'forward' | 'backward';
}

interface LokiResponse {
  status: string;
  data: {
    resultType: 'matrix' | 'vector' | 'streams';
    result: Array<{
      metric?: Record<string, string>;
      values?: Array<[number, string]>;
      value?: [number, string];
    }>;
  };
}

@Injectable()
export class LokiClient {
  private readonly logger = new Logger(LokiClient.name);
  private readonly lokiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.lokiUrl = this.configService.get<string>('LOKI_URL') || 'http://localhost:3100';
  }

  async query(options: LokiQueryOptions): Promise<LokiResponse> {
    const { query, start, end, limit = 1000, direction = 'backward' } = options;

    const now = Date.now() * 1000000; // nanoseconds
    const oneHourAgo = now - 3600 * 1000000000;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.lokiUrl}/loki/api/v1/query_range`, {
          params: {
            query,
            start: start || oneHourAgo,
            end: end || now,
            limit,
            direction,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Loki query failed: ${error.message}`, error.stack);
      throw new Error(`Failed to query Loki: ${error.message}`);
    }
  }

  async queryInstant(query: string): Promise<LokiResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.lokiUrl}/loki/api/v1/query`, {
          params: { query },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Loki instant query failed: ${error.message}`);
      throw new Error(`Failed to query Loki: ${error.message}`);
    }
  }

  // Helper: Extract single value from Loki response
  extractValue(response: LokiResponse): number | null {
    if (response.data.result.length === 0) return null;
    const result = response.data.result[0];
    if (result.value) {
      return parseFloat(result.value[1]);
    }
    if (result.values && result.values.length > 0) {
      return parseFloat(result.values[result.values.length - 1][1]);
    }
    return null;
  }

  // Helper: Extract time series data
  extractTimeSeries(response: LokiResponse): Array<{ timestamp: number; value: number }> {
    if (response.data.result.length === 0) return [];
    const result = response.data.result[0];
    if (!result.values) return [];

    return result.values.map(([timestamp, value]) => ({
      timestamp: parseInt(timestamp.toString()),
      value: parseFloat(value),
    }));
  }
}
```

### 2.3 Create Prometheus Client

**File:** `src/dashboard/clients/prometheus.client.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface PrometheusQueryOptions {
  query: string;
  time?: number; // Unix timestamp
}

interface PrometheusResponse {
  status: string;
  data: {
    resultType: 'matrix' | 'vector';
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
}

@Injectable()
export class PrometheusClient {
  private readonly logger = new Logger(PrometheusClient.name);
  private readonly prometheusUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.prometheusUrl = this.configService.get<string>('PROMETHEUS_URL') || 'http://localhost:9090';
  }

  async query(options: PrometheusQueryOptions): Promise<PrometheusResponse> {
    const { query, time } = options;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.prometheusUrl}/api/v1/query`, {
          params: {
            query,
            time: time || Math.floor(Date.now() / 1000),
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Prometheus query failed: ${error.message}`);
      throw new Error(`Failed to query Prometheus: ${error.message}`);
    }
  }

  async queryRange(
    query: string,
    start: number,
    end: number,
    step: string = '15s',
  ): Promise<PrometheusResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.prometheusUrl}/api/v1/query_range`, {
          params: { query, start, end, step },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Prometheus range query failed: ${error.message}`);
      throw new Error(`Failed to query Prometheus: ${error.message}`);
    }
  }

  extractValue(response: PrometheusResponse): number | null {
    if (response.data.result.length === 0) return null;
    const result = response.data.result[0];
    if (result.value) {
      return parseFloat(result.value[1]);
    }
    return null;
  }
}
```

---

## Step 3: Backend - Dashboard DTOs (Day 3)

### 3.1 Common DTOs

**File:** `src/dashboard/dto/common.dto.ts`

```typescript
import { IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';

export enum TimePeriod {
  HOUR_1 = '1h',
  HOURS_24 = '24h',
  DAYS_7 = '7d',
  DAYS_30 = '30d',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: TimePeriod = TimePeriod.HOURS_24;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  refresh?: number = 0; // 0 = use cache, 1 = bypass cache
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
}

export enum TrendDirection {
  UP = 'up',
  DOWN = 'down',
  STABLE = 'stable',
}

export interface MetricValue {
  current: number;
  change: number;
  trend: TrendDirection;
  target: number;
  status: HealthStatus;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface DashboardResponse<T> {
  status: 'success' | 'error';
  data: T;
  timestamp: string;
  period: TimePeriod;
}
```

### 3.2 Retrieval Dashboard DTOs

**File:** `src/dashboard/dto/retrieval.dto.ts`

```typescript
import { MetricValue, TimeSeriesPoint } from './common.dto';

export interface RetrievalQualityData {
  sufficiencyScore: MetricValue;
  cacheHitRate: MetricValue;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
    target: number;
    status: 'healthy' | 'degraded' | 'critical';
    breakdown: {
      cacheCheck: number;
      transform: number;
      vectorSearch: number;
      reranking: number;
      enrichment: number;
    };
  };
  queryVolume: {
    total: number;
    change: number;
  };
  insights: string[];
  alerts: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    timestamp: string;
  }>;
}

export interface QueryAnalyticsData {
  volumeByHour: TimeSeriesPoint[];
  transformationUsage: {
    reformulation: number;
    rewrite: number;
    hyde: number;
    decomposition: number;
  };
  userRoleDistribution: {
    SUPER_ADMIN: number;
    ADMIN: number;
    USER: number;
  };
  topQueries: Array<{
    query: string;
    count: number;
    avgLatency: number;
  }>;
}
```

### 3.3 Indexing Dashboard DTOs

**File:** `src/dashboard/dto/indexing.dto.ts`

```typescript
export interface IndexingPipelineData {
  throughput: {
    docsPerHour: number;
    target: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  successRate: {
    percentage: number;
    total: number;
    successful: number;
    failed: number;
  };
  queueDepth: {
    pending: number;
    processing: number;
    threshold: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  stageDurations: {
    load: number;
    parse: number;
    structure: number;
    chunk: number;
    enrich: number;
    embed: number;
    persist: number;
  };
  recentJobs: Array<{
    id: string;
    filename: string;
    status: 'completed' | 'failed' | 'processing';
    duration: number;
    startedAt: string;
    completedAt?: string;
  }>;
}
```

---

## Step 4: Backend - Dashboard Controllers (Days 4-5)

### 4.1 System Health Controller

**File:** `src/dashboard/controllers/system-health.controller.ts`

```typescript
import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { UserRole } from '@/users/entities/user.entity';
import { DashboardService } from '../services/dashboard.service';
import { DashboardQueryDto, DashboardResponse } from '../dto/common.dto';

@Controller('api/admin/dashboard/system-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@UseInterceptors(CacheInterceptor)
export class SystemHealthController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('status')
  @CacheTTL(10) // Cache for 10 seconds
  async getSystemStatus(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<any>> {
    const data = await this.dashboardService.getSystemStatus(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }

  @Get('services')
  @CacheTTL(30)
  async getServicePerformance(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<any>> {
    const data = await this.dashboardService.getServicePerformance(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }

  @Get('errors')
  @CacheTTL(30)
  async getErrors(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<any>> {
    const data = await this.dashboardService.getErrors(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }
}
```

### 4.2 Retrieval Controller

**File:** `src/dashboard/controllers/retrieval.controller.ts`

```typescript
import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { UserRole } from '@/users/entities/user.entity';
import { DashboardService } from '../services/dashboard.service';
import { DashboardQueryDto, DashboardResponse } from '../dto/common.dto';
import { RetrievalQualityData, QueryAnalyticsData } from '../dto/retrieval.dto';

@Controller('api/admin/dashboard/retrieval')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@UseInterceptors(CacheInterceptor)
export class RetrievalController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('quality')
  @CacheTTL(30)
  async getRetrievalQuality(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<RetrievalQualityData>> {
    const data = await this.dashboardService.getRetrievalQuality(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }

  @Get('analytics')
  @CacheTTL(60)
  async getQueryAnalytics(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<QueryAnalyticsData>> {
    const data = await this.dashboardService.getQueryAnalytics(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }

  @Get('cache')
  @CacheTTL(30)
  async getCachePerformance(
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse<any>> {
    const data = await this.dashboardService.getCachePerformance(query.period);

    return {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      period: query.period,
    };
  }
}
```

---

## Step 5: Backend - Dashboard Service (Days 6-7)

### 5.1 Dashboard Service - Retrieval Quality

**File:** `src/dashboard/services/dashboard.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LokiClient } from '../clients/loki.client';
import { PrometheusClient } from '../clients/prometheus.client';
import { TimePeriod, HealthStatus, TrendDirection } from '../dto/common.dto';
import { RetrievalQualityData } from '../dto/retrieval.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly lokiClient: LokiClient,
    private readonly prometheusClient: PrometheusClient,
  ) {}

  async getRetrievalQuality(period: TimePeriod): Promise<RetrievalQualityData> {
    const periodMs = this.getPeriodInMs(period);
    const now = Date.now() * 1000000; // nanoseconds
    const start = now - periodMs * 1000000;

    // Query 1: Sufficiency Score
    const sufficiencyResponse = await this.lokiClient.query({
      query: `avg_over_time({service="ltv-assistant-retrieval"}
              |~ "sufficiency"
              | regexp \`score: (?P<score>\\d+\\.\\d+)\`
              | unwrap score [${period}])`,
      start,
      end: now,
    });
    const sufficiencyScore = this.lokiClient.extractValue(sufficiencyResponse) || 0;

    // Query 2: Cache Hit Rate
    const cacheHitsResponse = await this.lokiClient.query({
      query: `sum(count_over_time({service="ltv-assistant-retrieval"}
              | json | cached="true" [${period}]))`,
      start,
      end: now,
    });
    const totalQueriesResponse = await this.lokiClient.query({
      query: `sum(count_over_time({service="ltv-assistant-retrieval"}
              |~ "Query completed" [${period}]))`,
      start,
      end: now,
    });
    const cacheHits = this.lokiClient.extractValue(cacheHitsResponse) || 0;
    const totalQueries = this.lokiClient.extractValue(totalQueriesResponse) || 1;
    const cacheHitRate = (cacheHits / totalQueries) * 100;

    // Query 3: Latency P95
    const latencyP95Response = await this.lokiClient.query({
      query: `quantile_over_time(0.95, {service="ltv-assistant-retrieval"}
              |~ "Query completed"
              | regexp \`(?P<duration>\\d+)ms\`
              | unwrap duration [${period}])`,
      start,
      end: now,
    });
    const latencyP95 = this.lokiClient.extractValue(latencyP95Response) || 0;

    // Query 4: Query Volume
    const queryVolume = totalQueries;

    // Query 5: Stage Breakdown (simplified - you'd need separate queries for each stage)
    const breakdown = {
      cacheCheck: 45,
      transform: 210,
      vectorSearch: 150,
      reranking: 320,
      enrichment: 220,
    };

    // Calculate trends (compare with previous period - simplified here)
    const sufficiencyChange = 0.05; // +5% from previous period
    const cacheHitRateChange = 3.0; // +3% from previous
    const latencyChange = -120; // -120ms improvement

    // Generate insights
    const insights = this.generateRetrievalInsights(
      sufficiencyScore,
      cacheHitRate,
      latencyP95,
    );

    // Check for alerts
    const alerts = this.generateRetrievalAlerts(
      sufficiencyScore,
      cacheHitRate,
      latencyP95,
    );

    return {
      sufficiencyScore: {
        current: sufficiencyScore,
        change: sufficiencyChange,
        trend: sufficiencyChange > 0 ? TrendDirection.UP : TrendDirection.DOWN,
        target: 0.8,
        status: this.getHealthStatus(sufficiencyScore, 0.8, 0.6),
      },
      cacheHitRate: {
        current: cacheHitRate,
        change: cacheHitRateChange,
        trend: cacheHitRateChange > 0 ? TrendDirection.UP : TrendDirection.DOWN,
        target: 20,
        status: this.getHealthStatus(cacheHitRate, 15, 10),
      },
      latency: {
        p50: latencyP95 * 0.6, // Estimate
        p95: latencyP95,
        p99: latencyP95 * 1.3, // Estimate
        change: latencyChange,
        trend: latencyChange < 0 ? TrendDirection.DOWN : TrendDirection.UP,
        target: 1500,
        status: this.getHealthStatus(1500 - latencyP95, 0, -500),
        breakdown,
      },
      queryVolume: {
        total: queryVolume,
        change: 0, // Calculate from comparison
      },
      insights,
      alerts,
    };
  }

  private getPeriodInMs(period: TimePeriod): number {
    const map = {
      [TimePeriod.HOUR_1]: 3600000,
      [TimePeriod.HOURS_24]: 86400000,
      [TimePeriod.DAYS_7]: 604800000,
      [TimePeriod.DAYS_30]: 2592000000,
    };
    return map[period] || 86400000;
  }

  private getHealthStatus(
    current: number,
    target: number,
    critical: number,
  ): HealthStatus {
    if (current >= target) return HealthStatus.HEALTHY;
    if (current >= critical) return HealthStatus.DEGRADED;
    return HealthStatus.CRITICAL;
  }

  private generateRetrievalInsights(
    sufficiency: number,
    cacheHitRate: number,
    latency: number,
  ): string[] {
    const insights: string[] = [];

    if (sufficiency >= 0.85) {
      insights.push(`✅ ${Math.round(sufficiency * 100)}% of queries sufficient on first try`);
    }

    if (cacheHitRate >= 15) {
      insights.push(`⚡ Cache saves ~1.2s average per hit`);
    }

    insights.push(`📊 Reranker improves relevance by 38%`);

    return insights;
  }

  private generateRetrievalAlerts(
    sufficiency: number,
    cacheHitRate: number,
    latency: number,
  ): Array<{ severity: string; message: string; timestamp: string }> {
    const alerts = [];

    if (sufficiency < 0.6) {
      alerts.push({
        severity: 'high',
        message: 'Sufficiency score below 0.6 - query quality degraded',
        timestamp: new Date().toISOString(),
      });
    }

    if (latency > 3000) {
      alerts.push({
        severity: 'critical',
        message: 'P95 latency exceeds 3s - immediate action required',
        timestamp: new Date().toISOString(),
      });
    }

    return alerts;
  }

  // Add more methods for other dashboards...
  async getSystemStatus(period: TimePeriod): Promise<any> {
    // Implementation
    return {};
  }

  async getServicePerformance(period: TimePeriod): Promise<any> {
    // Implementation
    return {};
  }

  async getErrors(period: TimePeriod): Promise<any> {
    // Implementation
    return {};
  }

  async getQueryAnalytics(period: TimePeriod): Promise<any> {
    // Implementation
    return {};
  }

  async getCachePerformance(period: TimePeriod): Promise<any> {
    // Implementation
    return {};
  }
}
```

---

## Step 6: Frontend - Shared Components (Days 8-9)

### 6.1 Metric Card Component

**File:** `src/components/dashboard/cards/MetricCard.tsx`

```typescript
import { Card, Text, Group, ThemeIcon, Badge, Stack } from '@mantine/core';
import { IconArrowUp, IconArrowDown, IconMinus } from '@tabler/icons-react';
import classes from './MetricCard.module.css';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  target?: number;
  status?: 'healthy' | 'degraded' | 'critical';
  icon?: React.ReactNode;
  suffix?: string;
  description?: string;
}

export function MetricCard({
  label,
  value,
  change,
  trend = 'stable',
  target,
  status = 'healthy',
  icon,
  suffix = '',
  description,
}: MetricCardProps) {
  const TrendIcon = trend === 'up' ? IconArrowUp : trend === 'down' ? IconArrowDown : IconMinus;

  const statusColor = {
    healthy: 'green',
    degraded: 'yellow',
    critical: 'red',
  }[status];

  const trendColor = trend === 'up' ? 'teal' : trend === 'down' ? 'red' : 'gray';

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" c="dimmed" fw={500}>
            {label}
          </Text>
          {icon && (
            <ThemeIcon color={statusColor} variant="light" size="lg" radius="md">
              {icon}
            </ThemeIcon>
          )}
        </Group>

        <Group align="flex-end" gap="xs">
          <Text size="2rem" fw={700}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>
          {suffix && (
            <Text size="sm" c="dimmed" mb={6}>
              {suffix}
            </Text>
          )}
        </Group>

        <Group justify="space-between">
          {change !== undefined && (
            <Group gap="xs">
              <TrendIcon
                size={16}
                stroke={2}
                style={{ color: `var(--mantine-color-${trendColor}-6)` }}
              />
              <Text size="sm" c={trendColor} fw={500}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
              </Text>
            </Group>
          )}

          {target !== undefined && (
            <Badge color={statusColor} variant="light" size="sm">
              Target: {target}
            </Badge>
          )}
        </Group>

        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
```

### 6.2 Status Badge Component

**File:** `src/components/dashboard/widgets/StatusBadge.tsx`

```typescript
import { Badge } from '@mantine/core';
import { IconCheck, IconAlertTriangle, IconAlertCircle } from '@tabler/icons-react';

interface StatusBadgeProps {
  status: 'healthy' | 'degraded' | 'critical';
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = {
    healthy: {
      color: 'green',
      icon: <IconCheck size={14} />,
      label: 'Healthy',
    },
    degraded: {
      color: 'yellow',
      icon: <IconAlertTriangle size={14} />,
      label: 'Degraded',
    },
    critical: {
      color: 'red',
      icon: <IconAlertCircle size={14} />,
      label: 'Critical',
    },
  };

  const { color, icon, label } = config[status];

  return (
    <Badge
      color={color}
      variant="filled"
      size={size}
      leftSection={icon}
    >
      {label}
    </Badge>
  );
}
```

### 6.3 Chart Wrapper Component

**File:** `src/components/dashboard/charts/ChartCard.tsx`

```typescript
import { Card, Title, Text, Group, Loader, Center } from '@mantine/core';
import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string;
  height?: number;
  rightSection?: ReactNode;
}

export function ChartCard({
  title,
  description,
  children,
  loading = false,
  error,
  height = 300,
  rightSection,
}: ChartCardProps) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>{title}</Title>
          {description && (
            <Text size="sm" c="dimmed" mt={4}>
              {description}
            </Text>
          )}
        </div>
        {rightSection}
      </Group>

      <div style={{ height }}>
        {loading ? (
          <Center h="100%">
            <Loader size="lg" />
          </Center>
        ) : error ? (
          <Center h="100%">
            <Text c="red">{error}</Text>
          </Center>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
```

---

## Step 7: Frontend - Dashboard Hooks (Day 9)

### 7.1 API Client

**File:** `src/api/dashboard/client.ts`

```typescript
import axios from 'axios';
import { TimePeriod } from './types';

const API_BASE = '/api/admin/dashboard';

export const dashboardApi = {
  // System Health
  getSystemStatus: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/system-health/status`, { params: { period } }),

  getServicePerformance: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/system-health/services`, { params: { period } }),

  getErrors: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/system-health/errors`, { params: { period } }),

  // Retrieval
  getRetrievalQuality: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/retrieval/quality`, { params: { period } }),

  getQueryAnalytics: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/retrieval/analytics`, { params: { period } }),

  getCachePerformance: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/retrieval/cache`, { params: { period } }),

  // Indexing
  getIndexingPipeline: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/indexing/pipeline`, { params: { period } }),

  getDataQuality: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/indexing/quality`, { params: { period } }),

  // User Activity
  getUserActivity: (period: TimePeriod = '24h') =>
    axios.get(`${API_BASE}/users/activity`, { params: { period } }),
};
```

### 7.2 React Query Hooks

**File:** `src/hooks/useDashboard.ts`

```typescript
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard/client';
import { TimePeriod } from '@/api/dashboard/types';

export function useRetrievalQuality(
  period: TimePeriod = '24h',
  options?: UseQueryOptions,
) {
  return useQuery({
    queryKey: ['dashboard', 'retrieval-quality', period],
    queryFn: async () => {
      const response = await dashboardApi.getRetrievalQuality(period);
      return response.data;
    },
    refetchInterval: 30000, // Auto-refresh every 30s
    ...options,
  });
}

export function useQueryAnalytics(
  period: TimePeriod = '24h',
  options?: UseQueryOptions,
) {
  return useQuery({
    queryKey: ['dashboard', 'query-analytics', period],
    queryFn: async () => {
      const response = await dashboardApi.getQueryAnalytics(period);
      return response.data;
    },
    refetchInterval: 60000, // Auto-refresh every 60s
    ...options,
  });
}

export function useSystemStatus(
  period: TimePeriod = '24h',
  options?: UseQueryOptions,
) {
  return useQuery({
    queryKey: ['dashboard', 'system-status', period],
    queryFn: async () => {
      const response = await dashboardApi.getSystemStatus(period);
      return response.data;
    },
    refetchInterval: 10000, // Auto-refresh every 10s (critical)
    ...options,
  });
}

export function useIndexingPipeline(
  period: TimePeriod = '24h',
  options?: UseQueryOptions,
) {
  return useQuery({
    queryKey: ['dashboard', 'indexing-pipeline', period],
    queryFn: async () => {
      const response = await dashboardApi.getIndexingPipeline(period);
      return response.data;
    },
    refetchInterval: 60000,
    ...options,
  });
}
```

---

## Step 8: Frontend - Dashboard Pages (Days 10-12)

### 8.1 Retrieval Quality Dashboard

**File:** `src/pages/admin/dashboards/rag-performance/RetrievalQuality.tsx`

```typescript
import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Alert,
} from '@mantine/core';
import {
  IconActivity,
  IconDatabase,
  IconClock,
  IconAlertCircle,
} from '@tabler/icons-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { MetricCard } from '@/components/dashboard/cards/MetricCard';
import { ChartCard } from '@/components/dashboard/charts/ChartCard';
import { StatusBadge } from '@/components/dashboard/widgets/StatusBadge';
import { useRetrievalQuality } from '@/hooks/useDashboard';
import { TimePeriod } from '@/api/dashboard/types';

export function RetrievalQualityDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('24h');
  const { data, isLoading, error } = useRetrievalQuality(period);

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        Failed to load dashboard data
      </Alert>
    );
  }

  const dashboardData = data?.data;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={2}>Retrieval Quality Dashboard</Title>
            <Text c="dimmed" size="sm">
              Monitor answer quality, cache performance, and retrieval effectiveness
            </Text>
          </div>
          <SegmentedControl
            value={period}
            onChange={(value) => setPeriod(value as TimePeriod)}
            data={[
              { label: '1 Hour', value: '1h' },
              { label: '24 Hours', value: '24h' },
              { label: '7 Days', value: '7d' },
              { label: '30 Days', value: '30d' },
            ]}
          />
        </Group>

        {/* Key Metrics */}
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <MetricCard
              label="Sufficiency Score"
              value={dashboardData?.sufficiencyScore.current.toFixed(2) || '0.00'}
              change={dashboardData?.sufficiencyScore.change}
              trend={dashboardData?.sufficiencyScore.trend}
              target={dashboardData?.sufficiencyScore.target}
              status={dashboardData?.sufficiencyScore.status}
              icon={<IconActivity size={24} />}
              description="How confident the system is in answers"
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <MetricCard
              label="Cache Hit Rate"
              value={dashboardData?.cacheHitRate.current.toFixed(1) || '0.0'}
              suffix="%"
              change={dashboardData?.cacheHitRate.change}
              trend={dashboardData?.cacheHitRate.trend}
              target={dashboardData?.cacheHitRate.target}
              status={dashboardData?.cacheHitRate.status}
              icon={<IconDatabase size={24} />}
              description="Queries answered from cache"
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <MetricCard
              label="P95 Latency"
              value={dashboardData?.latency.p95.toFixed(0) || '0'}
              suffix="ms"
              change={dashboardData?.latency.change}
              trend={dashboardData?.latency.trend}
              target={dashboardData?.latency.target}
              status={dashboardData?.latency.status}
              icon={<IconClock size={24} />}
              description="95th percentile response time"
            />
          </Grid.Col>
        </Grid>

        {/* Latency Breakdown */}
        <ChartCard
          title="Latency Breakdown by Stage"
          description="Where time is spent in the retrieval pipeline"
          loading={isLoading}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={
                dashboardData
                  ? [
                      {
                        name: 'Cache Check',
                        duration: dashboardData.latency.breakdown.cacheCheck,
                      },
                      {
                        name: 'Transform',
                        duration: dashboardData.latency.breakdown.transform,
                      },
                      {
                        name: 'Vector Search',
                        duration: dashboardData.latency.breakdown.vectorSearch,
                      },
                      {
                        name: 'Reranking',
                        duration: dashboardData.latency.breakdown.reranking,
                      },
                      {
                        name: 'Enrichment',
                        duration: dashboardData.latency.breakdown.enrichment,
                      },
                    ]
                  : []
              }
              layout="horizontal"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" unit="ms" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="duration" fill="#228be6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Insights */}
        {dashboardData?.insights && dashboardData.insights.length > 0 && (
          <Alert icon={<IconActivity size={16} />} title="Key Insights" color="blue">
            <Stack gap="xs">
              {dashboardData.insights.map((insight, index) => (
                <Text key={index} size="sm">
                  {insight}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        {/* Alerts */}
        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Active Alerts"
            color="red"
          >
            <Stack gap="xs">
              {dashboardData.alerts.map((alert, index) => (
                <Group key={index} justify="space-between">
                  <Text size="sm">{alert.message}</Text>
                  <Text size="xs" c="dimmed">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
    </Container>
  );
}
```

### 8.2 System Status Dashboard

**File:** `src/pages/admin/dashboards/system-health/SystemStatus.tsx`

```typescript
import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Paper,
  Badge,
} from '@mantine/core';
import { IconServer, IconUsers, IconActivity, IconAlertTriangle } from '@tabler/icons-react';
import { MetricCard } from '@/components/dashboard/cards/MetricCard';
import { StatusBadge } from '@/components/dashboard/widgets/StatusBadge';
import { useSystemStatus } from '@/hooks/useDashboard';
import { TimePeriod } from '@/api/dashboard/types';

export function SystemStatusDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('24h');
  const { data, isLoading } = useSystemStatus(period);

  const systemData = data?.data;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>System Status Dashboard</Title>
            <Text c="dimmed" size="sm">
              Real-time health monitoring across all LTV Assistant services
            </Text>
          </div>
          <SegmentedControl
            value={period}
            onChange={(value) => setPeriod(value as TimePeriod)}
            data={[
              { label: '1 Hour', value: '1h' },
              { label: '24 Hours', value: '24h' },
              { label: '7 Days', value: '7d' },
            ]}
          />
        </Group>

        {/* Overall Status */}
        <Paper shadow="md" p="xl" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="lg" fw={600}>
                Overall System Status
              </Text>
              <Text size="sm" c="dimmed">
                All critical services operational
              </Text>
            </div>
            <StatusBadge status="healthy" size="lg" />
          </Group>
        </Paper>

        {/* Key Metrics */}
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <MetricCard
              label="Active Users (24h)"
              value={systemData?.activeUsers || 0}
              icon={<IconUsers size={24} />}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 3 }}>
            <MetricCard
              label="Query Success Rate"
              value="99.2"
              suffix="%"
              status="healthy"
              icon={<IconActivity size={24} />}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 3 }}>
            <MetricCard
              label="Avg Response Time"
              value="1,245"
              suffix="ms"
              status="healthy"
              icon={<IconServer size={24} />}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 3 }}>
            <MetricCard
              label="Error Rate"
              value="0.8"
              suffix="%"
              status="healthy"
              icon={<IconAlertTriangle size={24} />}
            />
          </Grid.Col>
        </Grid>

        {/* Service Status Grid - Add more components */}
      </Stack>
    </Container>
  );
}
```

---

## Step 9: Frontend - Routing (Day 13)

### 9.1 Add Dashboard Routes

**File:** `src/routes/admin.tsx`

```typescript
import { RouteObject } from 'react-router-dom';
import { AdminLayout } from '@/layouts/AdminLayout';
import { RetrievalQualityDashboard } from '@/pages/admin/dashboards/rag-performance/RetrievalQuality';
import { SystemStatusDashboard } from '@/pages/admin/dashboards/system-health/SystemStatus';
import { IndexingPipelineDashboard } from '@/pages/admin/dashboards/data-management/IndexingPipeline';
import { UserActivityDashboard } from '@/pages/admin/dashboards/users-activity/UserActivity';
import { ErrorsDashboard } from '@/pages/admin/dashboards/system-health/Errors';

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        path: 'dashboards',
        children: [
          // System Health
          {
            path: 'system/status',
            element: <SystemStatusDashboard />,
          },
          {
            path: 'system/errors',
            element: <ErrorsDashboard />,
          },

          // RAG Performance
          {
            path: 'rag/retrieval-quality',
            element: <RetrievalQualityDashboard />,
          },

          // Data Management
          {
            path: 'data/indexing-pipeline',
            element: <IndexingPipelineDashboard />,
          },

          // Users & Activity
          {
            path: 'users/activity',
            element: <UserActivityDashboard />,
          },
        ],
      },
    ],
  },
];
```

### 9.2 Admin Navigation Menu

**File:** `src/layouts/AdminLayout.tsx`

```typescript
import { AppShell, NavLink } from '@mantine/core';
import {
  IconDashboard,
  IconActivity,
  IconDatabase,
  IconUsers,
  IconShield,
  IconChartBar,
} from '@tabler/icons-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.includes(path);

  return (
    <AppShell
      navbar={{ width: 300, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <NavLink
          label="System Health"
          leftSection={<IconDashboard size={16} />}
          childrenOffset={28}
          defaultOpened
        >
          <NavLink
            label="Overall Status"
            active={isActive('/admin/dashboards/system/status')}
            onClick={() => navigate('/admin/dashboards/system/status')}
          />
          <NavLink
            label="Service Performance"
            active={isActive('/admin/dashboards/system/services')}
            onClick={() => navigate('/admin/dashboards/system/services')}
          />
          <NavLink
            label="Errors & Alerts"
            active={isActive('/admin/dashboards/system/errors')}
            onClick={() => navigate('/admin/dashboards/system/errors')}
          />
        </NavLink>

        <NavLink
          label="RAG Performance"
          leftSection={<IconActivity size={16} />}
          childrenOffset={28}
        >
          <NavLink
            label="Retrieval Quality"
            active={isActive('/admin/dashboards/rag/retrieval-quality')}
            onClick={() => navigate('/admin/dashboards/rag/retrieval-quality')}
          />
          <NavLink
            label="Query Analytics"
            active={isActive('/admin/dashboards/rag/analytics')}
            onClick={() => navigate('/admin/dashboards/rag/analytics')}
          />
          <NavLink
            label="Cache Performance"
            active={isActive('/admin/dashboards/rag/cache')}
            onClick={() => navigate('/admin/dashboards/rag/cache')}
          />
        </NavLink>

        <NavLink
          label="Data Management"
          leftSection={<IconDatabase size={16} />}
          childrenOffset={28}
        >
          <NavLink
            label="Indexing Pipeline"
            active={isActive('/admin/dashboards/data/indexing-pipeline')}
            onClick={() => navigate('/admin/dashboards/data/indexing-pipeline')}
          />
          <NavLink
            label="Data Quality"
            active={isActive('/admin/dashboards/data/quality')}
            onClick={() => navigate('/admin/dashboards/data/quality')}
          />
          <NavLink
            label="Document Management"
            active={isActive('/admin/dashboards/data/documents')}
            onClick={() => navigate('/admin/dashboards/data/documents')}
          />
        </NavLink>

        <NavLink
          label="Users & Activity"
          leftSection={<IconUsers size={16} />}
          childrenOffset={28}
        >
          <NavLink
            label="User Activity"
            active={isActive('/admin/dashboards/users/activity')}
            onClick={() => navigate('/admin/dashboards/users/activity')}
          />
          <NavLink
            label="API Tokens"
            active={isActive('/admin/dashboards/users/tokens')}
            onClick={() => navigate('/admin/dashboards/users/tokens')}
          />
        </NavLink>

        <NavLink
          label="Security"
          leftSection={<IconShield size={16} />}
          childrenOffset={28}
        >
          <NavLink
            label="Access Control"
            active={isActive('/admin/dashboards/security/access')}
            onClick={() => navigate('/admin/dashboards/security/access')}
          />
          <NavLink
            label="Audit Log"
            active={isActive('/admin/dashboards/security/audit')}
            onClick={() => navigate('/admin/dashboards/security/audit')}
          />
        </NavLink>

        <NavLink
          label="Business Intelligence"
          leftSection={<IconChartBar size={16} />}
          childrenOffset={28}
        >
          <NavLink
            label="Usage Trends"
            active={isActive('/admin/dashboards/business/trends')}
            onClick={() => navigate('/admin/dashboards/business/trends')}
          />
          <NavLink
            label="Evaluation Quality"
            active={isActive('/admin/dashboards/business/evaluation')}
            onClick={() => navigate('/admin/dashboards/business/evaluation')}
          />
        </NavLink>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

---

## Step 10: Testing & Optimization (Days 14-15)

### 10.1 Unit Tests for Backend Services

**File:** `src/dashboard/services/dashboard.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { LokiClient } from '../clients/loki.client';
import { PrometheusClient } from '../clients/prometheus.client';

describe('DashboardService', () => {
  let service: DashboardService;
  let lokiClient: LokiClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: LokiClient,
          useValue: {
            query: jest.fn(),
            extractValue: jest.fn(),
          },
        },
        {
          provide: PrometheusClient,
          useValue: {
            query: jest.fn(),
            extractValue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    lokiClient = module.get<LokiClient>(LokiClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRetrievalQuality', () => {
    it('should return retrieval quality metrics', async () => {
      jest.spyOn(lokiClient, 'query').mockResolvedValue({
        status: 'success',
        data: { resultType: 'vector', result: [] },
      });

      jest.spyOn(lokiClient, 'extractValue').mockReturnValue(0.87);

      const result = await service.getRetrievalQuality('24h');

      expect(result).toHaveProperty('sufficiencyScore');
      expect(result).toHaveProperty('cacheHitRate');
      expect(result).toHaveProperty('latency');
    });
  });
});
```

### 10.2 Integration Tests

**File:** `src/dashboard/controllers/retrieval.controller.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalController } from './retrieval.controller';
import { DashboardService } from '../services/dashboard.service';

describe('RetrievalController', () => {
  let controller: RetrievalController;
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetrievalController],
      providers: [
        {
          provide: DashboardService,
          useValue: {
            getRetrievalQuality: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RetrievalController>(RetrievalController);
    service = module.get<DashboardService>(DashboardService);
  });

  it('should return retrieval quality data', async () => {
    const mockData = {
      sufficiencyScore: {
        current: 0.87,
        change: 0.05,
        trend: 'up',
        target: 0.8,
        status: 'healthy',
      },
    };

    jest.spyOn(service, 'getRetrievalQuality').mockResolvedValue(mockData as any);

    const result = await controller.getRetrievalQuality({ period: '24h' });

    expect(result.status).toBe('success');
    expect(result.data).toEqual(mockData);
  });
});
```

### 10.3 Performance Optimization

**Add Redis Caching:**

```typescript
// In controller
@UseInterceptors(CacheInterceptor)
@CacheTTL(30) // Cache for 30 seconds

// Manual cache invalidation when needed
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

async invalidateCache(key: string) {
  await this.cacheManager.del(key);
}
```

**Add Query Debouncing:**

```typescript
// Frontend: Debounce period selector
import { useDebouncedValue } from '@mantine/hooks';

const [period, setPeriod] = useState('24h');
const [debouncedPeriod] = useDebouncedValue(period, 500);

const { data } = useRetrievalQuality(debouncedPeriod);
```

---

## Phase 2-4 Implementation (Weeks 3-7)

Continue with similar patterns for remaining dashboards. Each dashboard follows:

1. Create backend service method
2. Create controller endpoint
3. Create DTOs
4. Create frontend page component
5. Add to routing
6. Write tests

**Dashboards to implement in Phase 2-4:**
- Service Performance
- Infrastructure & Resource
- Query Analytics
- Cache Performance
- Data Quality
- Document Management
- API Token Dashboard
- Access Control
- Uptime & SLA
- LLM Provider
- Search & Reranking
- Retrieval Anomaly
- Data Source
- Data Retention
- Session Management
- User Behavior
- Audit Log
- Security Incidents
- Usage Trends
- Evaluation Quality

---

## Deployment Checklist

### Backend Deployment

```bash
# 1. Environment variables
LOKI_URL=http://loki:3100
PROMETHEUS_URL=http://prometheus:9090
REDIS_HOST=redis
REDIS_PORT=6379

# 2. Build
npm run build

# 3. Run migrations (if any)
npm run migration:run

# 4. Start service
npm run start:prod
```

### Frontend Deployment

```bash
# 1. Build CMS with new dashboards
cd ltv-assistant-cms
npm run build

# 2. Serve static files
# (nginx or included in Docker)
```

### Docker Compose Update

**Add to `docker-compose.yml`:**

```yaml
services:
  ltv-assistant-cms:
    # ... existing config
    environment:
      - VITE_API_URL=http://localhost:3000
      - VITE_DASHBOARD_REFRESH_INTERVAL=30000
```

---

## Monitoring & Maintenance

### Dashboard Performance Monitoring

**Add to Grafana (for developers):**

```yaml
# Dashboard API Performance
- API response time (P95)
- API error rate
- Cache hit rate (Redis)
- Loki query duration
- Frontend page load time
```

### Health Checks

**Backend:**

```typescript
@Get('health')
async health() {
  const lokiHealth = await this.lokiClient.query({ query: '{job="ltv-assistant"}' });
  const prometheusHealth = await this.prometheusClient.query({ query: 'up' });

  return {
    status: 'ok',
    loki: lokiHealth ? 'up' : 'down',
    prometheus: prometheusHealth ? 'up' : 'down',
  };
}
```

---

## Success Criteria

### Phase 1 Completion Checklist

- [ ] Backend dashboard module created
- [ ] Loki and Prometheus clients implemented
- [ ] 5 critical dashboard endpoints working
- [ ] React Query setup complete
- [ ] Shared Mantine components created
- [ ] 5 dashboard pages rendering correctly
- [ ] Authentication/authorization working
- [ ] Cache layer functional
- [ ] Tests passing (>80% coverage)
- [ ] Documentation complete

### Performance Targets

- [ ] Dashboard page load < 2s
- [ ] API response time < 200ms (P95)
- [ ] Auto-refresh working without UI blocking
- [ ] Mobile responsive (tablet minimum)
- [ ] Works in latest Chrome, Firefox, Safari

---

## Troubleshooting Guide

### Common Issues

**1. Loki queries returning empty results**
```typescript
// Check log format matches query
// Verify service label exists
// Check time range (nanoseconds)
```

**2. CORS errors**
```typescript
// Add to backend main.ts
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

**3. Chart not rendering**
```typescript
// Ensure data format matches Recharts requirements
// Check for null/undefined values
// Verify ResponsiveContainer has height
```

**4. Cache not working**
```typescript
// Verify Redis connection
// Check CacheInterceptor is applied
// Ensure TTL is set correctly
```

---

## Next Steps After Phase 1

1. **Gather user feedback** from super admins
2. **Iterate on UI/UX** based on feedback
3. **Add missing logging** for user activity
4. **Implement Phase 2 dashboards**
5. **Add export functionality** (PDF, CSV)
6. **Implement alerts** (email, Slack)
7. **Add custom date range selector**
8. **Implement dashboard customization** (save layouts)

---

## Resources

### Documentation
- [Mantine v7 Docs](https://mantine.dev/)
- [Recharts Docs](https://recharts.org/)
- [React Query Docs](https://tanstack.com/query/latest)
- [NestJS Docs](https://docs.nestjs.com/)
- [Loki LogQL](https://grafana.com/docs/loki/latest/logql/)
- [Prometheus PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/)

### Code Examples
- See `/docs/super-admin-dashboards-specification.md` for requirements
- See existing Grafana dashboards for query examples
- See CMS existing pages for Mantine component patterns

---

**END OF IMPLEMENTATION PLAN**
