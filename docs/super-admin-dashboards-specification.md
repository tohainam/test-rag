# LTV Assistant - Super Admin Dashboard Specification

**Document Version:** 1.0
**Date:** November 14, 2025
**Target Audience:** Super Administrators (Non-Technical Business Users)
**Current State:** Grafana exists for developers; New CMS-integrated dashboards needed

---

## Executive Summary

This document specifies **25 comprehensive dashboards** designed for super administrators to monitor and manage the LTV Assistant RAG system through an intuitive, user-friendly interface integrated into `ltv-assistant-cms`. These dashboards translate complex technical metrics from Grafana/Loki/Prometheus into actionable business insights.

### Priority Focus Areas
1. **HIGHEST:** Retrieval Performance & Quality (`ltv-assistant-retrieval`)
2. **SECOND:** Indexing Pipeline & Data Quality (`ltv-assistant-indexing`)
3. **THIRD:** User Activity & System Health (`ltv-assistant-cms` + Infrastructure)

---

## Dashboard Organization

Dashboards are grouped into **6 functional categories** across **multiple pages** in the CMS:

```
Super Admin Portal (CMS)
├── 📊 System Health (5 dashboards)
├── 🔍 RAG Performance (6 dashboards)
├── 📁 Data Management (5 dashboards)
├── 👥 Users & Activity (4 dashboards)
├── 🔒 Security & Compliance (3 dashboards)
└── 📈 Business Intelligence (2 dashboards)
```

---

## Category 1: System Health (5 Dashboards)

### 1.1 **Overall System Status Dashboard** ⭐ CRITICAL
**Page:** Home / Overview
**Refresh:** Real-time (10s)

**Purpose:** At-a-glance health of entire LTV Assistant platform

**Key Metrics:**
- **System Status Indicator** (Green/Yellow/Red)
  - All services operational
  - Degraded performance warnings
  - Critical failures
- **Active Users** (Last 24h)
  - Total sessions
  - Active API tokens
  - Peak concurrent users
- **Query Success Rate** (24h rolling)
  - Target: >99%
  - Alert: <95%
- **Average Response Time** (All services)
  - Target: <1.5s
  - Alert: >3s
- **Error Rate** (System-wide, 24h)
  - Target: <0.5%
  - Alert: >2%
- **Infrastructure Status**
  - Database (MySQL, Qdrant, Neo4j)
  - Cache (Redis)
  - Storage (MinIO)
  - Services (6 microservices up/down)

**Widgets:**
- Status Cards (Green/Yellow/Red badges)
- Single-number stats with trend arrows (↑ ↓ →)
- Service uptime percentage (Last 7 days)
- Alert ticker (Recent warnings/errors)

**Data Sources:**
- Loki: Log aggregation from all services
- Prometheus: Infrastructure metrics
- MySQL: User session data

---

### 1.2 **Service Performance Dashboard**
**Page:** System Health / Services
**Refresh:** 30s

**Purpose:** Monitor individual microservice health and performance

**Key Metrics per Service:**

| Service | Critical Metrics | Thresholds |
|---------|------------------|------------|
| **API Gateway** | Request rate, Latency P95, Error rate | <500ms, <1% errors |
| **Auth Service** | Login success rate, Token generation time | >99%, <200ms |
| **Datasource Service** | File upload success, Storage availability | >98%, 99.9% uptime |
| **Indexing Service** | Documents/hour, Job success rate, Queue depth | >360/h, >95%, <100 |
| **Retrieval Service** | Query latency P95, Cache hit rate, Sufficiency score | <1500ms, 15-30%, >0.8 |
| **CMS Frontend** | Page load time, User actions/min | <2s, Monitor trends |

**Widgets:**
- Service health grid (Up/Down status)
- Latency comparison bar chart
- Error rate sparklines
- Request volume heatmap (by hour)

**Alerts:**
- Any service down for >1 min
- Response time >2x threshold for >5 min
- Error rate spike (>5x normal)

---

### 1.3 **Infrastructure & Resource Dashboard**
**Page:** System Health / Infrastructure
**Refresh:** 1m

**Purpose:** Monitor underlying infrastructure health and capacity

**Key Metrics:**

**Database Health:**
- **MySQL**
  - Connection pool usage (Target: <80%)
  - Query latency (Target: <50ms)
  - Storage used (Alert: >80% capacity)
  - Chunk count growth rate
- **Qdrant**
  - Vector count per collection (children, summaries, questions)
  - Search latency (Target: <100ms)
  - Memory usage (Alert: >85%)
- **Redis**
  - Cache hit rate (Target: >70%)
  - Memory usage (Alert: >90%)
  - Connected clients

**Storage Health:**
- **MinIO/S3**
  - Total files stored
  - Storage capacity used (Alert: >75%)
  - Upload/download success rate (Target: >99%)

**Widgets:**
- Capacity gauges (visual fill indicators)
- Trend lines (Storage growth over 30 days)
- Connection pool bars
- Latency histograms

---

### 1.4 **Error & Alert Dashboard**
**Page:** System Health / Errors
**Refresh:** 30s

**Purpose:** Centralize all errors, warnings, and alerts for quick triage

**Key Sections:**

1. **Critical Errors (Last Hour)**
   - Count by service
   - Most recent 10 errors with timestamps
   - Error type distribution (DB errors, API errors, timeout, etc.)

2. **Warning Trends (Last 24h)**
   - Performance degradation warnings
   - Capacity warnings
   - Rate limit warnings

3. **Error Resolution Tracking**
   - Unresolved errors (grouped by type)
   - Time to resolution (average)
   - Recurring error patterns

4. **Top Error Sources**
   - Service ranking by error count
   - User-impacting vs. internal errors

**Widgets:**
- Error timeline (stacked area chart)
- Error type pie chart
- Recent error log table (paginated)
- Alert notification center

**Alerts:**
- Critical errors appear as popup notifications
- Email digest for unresolved errors (daily)

---

### 1.5 **Uptime & SLA Dashboard**
**Page:** System Health / SLA
**Refresh:** 5m

**Purpose:** Track service level agreements and availability

**Key Metrics:**

- **Uptime Percentages** (30-day rolling)
  - Overall system: Target 99.9%
  - Per service: Target 99.5%
  - Scheduled maintenance exclusions

- **Incident Log**
  - Downtime events (date, duration, root cause)
  - MTTR (Mean Time To Recovery)
  - Impact assessment (users affected)

- **SLA Compliance**
  - Current month vs. target
  - Historical trends (last 12 months)
  - Projected end-of-month status

**Widgets:**
- Uptime calendar heatmap (green/red days)
- Availability donut chart
- Incident timeline
- SLA compliance gauge

---

## Category 2: RAG Performance (6 Dashboards)

### 2.1 **Retrieval Quality Dashboard** ⭐ HIGHEST PRIORITY
**Page:** RAG Performance / Retrieval
**Refresh:** 30s

**Purpose:** Monitor answer quality and retrieval effectiveness

**Key Metrics:**

1. **Answer Quality Indicators**
   - **Sufficiency Score** (Last 100 queries)
     - Average: Target >0.8
     - Distribution histogram
   - **Cache Hit Rate** (24h)
     - Target: 15-30%
     - Semantic cache effectiveness
   - **Retrieval Success Rate**
     - Queries with >0 relevant results
     - Target: >95%

2. **RAG Pipeline Performance**
   - **End-to-End Latency** (P50, P95, P99)
     - Target P95: <1500ms
     - Breakdown by stage:
       - Cache check: 20-50ms
       - Query transformation: 100-300ms
       - Vector search: 100-200ms
       - Reranking: 200-500ms
       - Enrichment: 100-300ms
   - **Adaptive Loop Iterations**
     - Average: 1.2 (most pass first time)
     - Retry rate: <20%

3. **Search Quality**
   - **Multi-Vector Coverage**
     - % queries hitting children vectors
     - % queries using summaries
     - % queries using hypothetical questions
   - **Reranker Effectiveness**
     - Score improvement (RRF → BGE-Reranker)
     - Fallback rate (when reranker unavailable)

**Widgets:**
- Sufficiency score gauge (with trend)
- Latency waterfall chart (stage breakdown)
- Cache hit rate line graph
- Search quality matrix (heatmap)

**Insights:**
- "🎯 85% of queries sufficient on first try"
- "⚡ Cache saves 1.2s average per hit"
- "📊 Reranker improves relevance by 35%"

---

### 2.2 **Query Analytics Dashboard**
**Page:** RAG Performance / Queries
**Refresh:** 1m

**Purpose:** Understand query patterns and user behavior

**Key Metrics:**

1. **Query Volume & Patterns**
   - Total queries (Today, This Week, This Month)
   - Peak query times (hourly heatmap)
   - Queries per user (average, distribution)
   - Query length distribution (tokens)

2. **Query Transformation Usage**
   - Reformulation: X%
   - Rewrite: X%
   - HyDE (Hypothetical Documents): X%
   - Decomposition: X%
   - Fallback rate (transformation failures)

3. **User Role Distribution**
   - Queries by role (SUPER_ADMIN, ADMIN, USER)
   - Role-specific performance differences

4. **Popular Query Topics**
   - Top 20 query themes (extracted keywords)
   - Document access frequency
   - Unanswered query patterns

**Widgets:**
- Query volume time series
- Transformation type pie chart
- User role donut chart
- Topic word cloud
- Query table (recent 50 queries with metadata)

**Insights:**
- "🔥 Peak usage: 9-11 AM weekdays"
- "💬 Average query: 12 words"
- "📚 Most queried document: [Name]"

---

### 2.3 **Cache Performance Dashboard**
**Page:** RAG Performance / Cache
**Refresh:** 30s

**Purpose:** Monitor semantic cache effectiveness and health

**Key Metrics:**

1. **Cache Statistics (24h)**
   - Total cache hits
   - Total cache misses
   - Cache hit rate (%)
   - Cache storage operations
   - Cache invalidations (document updates)

2. **Cache Efficiency**
   - Average time saved per hit (~1.2s)
   - Total latency saved (aggregate)
   - Cache age distribution
   - Hit frequency per cached entry

3. **Public-Only Safety**
   - Queries skipped (non-public documents)
   - Safety block rate

4. **Cache Size & Cleanup**
   - Total cache entries
   - Storage used (Qdrant collection)
   - Cleanup events (TTL expiration)
   - Eviction rate

**Widgets:**
- Hit/Miss stacked area chart
- Latency savings gauge
- Cache size trend line
- Recent cache hits log

**Insights:**
- "💾 Cache saved 2.3 hours of compute today"
- "🔒 Public-only strategy: 15% queries blocked"
- "🧹 Auto-cleanup removed 120 stale entries"

---

### 2.4 **LLM Provider Dashboard**
**Page:** RAG Performance / LLM
**Refresh:** 1m

**Purpose:** Monitor LLM usage, costs, and reliability

**Key Metrics:**

1. **Provider Usage Distribution**
   - OpenAI: X%
   - Google (Gemini): X%
   - Anthropic (Claude): X%
   - Ollama (local): X%

2. **Model Breakdown**
   - Top models by usage
   - Model by provider
   - Cost per model (if tracked)

3. **LLM Performance**
   - Average latency by provider
   - Success rate by provider (Target: >99%)
   - Retry events (rate limiting, timeouts)
   - Fallback triggers

4. **Cost Tracking** (if integrated)
   - Estimated monthly spend
   - Cost per query
   - Cost trend (last 30 days)

**Widgets:**
- Provider usage pie chart
- Model usage table
- Latency comparison bar chart
- Cost trend line (optional)
- Retry events timeline

**Insights:**
- "🤖 Primary: Ollama (local) - 60%"
- "💰 Estimated monthly cost: $150"
- "⚠️ OpenAI fallback triggered 12 times today"

---

### 2.5 **Search & Reranking Dashboard**
**Page:** RAG Performance / Search
**Refresh:** 1m

**Purpose:** Deep dive into vector search and reranking effectiveness

**Key Metrics:**

1. **Vector Search Performance**
   - Qdrant query latency (avg, P95)
   - Results per query (children, summaries, questions)
   - Hybrid search usage (dense+sparse vs. dense-only fallback)
   - Search mode distribution

2. **Reranking Statistics**
   - Reranker usage rate (% queries)
   - BGE-Reranker latency (avg, P95)
   - Reranker timeout/failure rate
   - RRF fallback usage
   - Score improvement metrics

3. **Result Quality**
   - Average results returned
   - Zero-result queries (%)
   - Parent chunk enrichment rate
   - Token count distribution

**Widgets:**
- Search latency histogram
- Reranking effectiveness gauge
- Result count distribution
- Search mode pie chart

**Insights:**
- "🔍 Hybrid search: 92% of queries"
- "🎯 Reranker improves top-3 precision by 40%"
- "📄 Average: 8.5 contexts per query"

---

### 2.6 **Retrieval Anomaly Dashboard**
**Page:** RAG Performance / Anomalies
**Refresh:** 30s

**Purpose:** Detect unusual patterns in retrieval performance

**Key Anomaly Indicators:**

1. **Performance Anomalies**
   - Sudden latency spikes (>3x baseline)
   - Cache hit rate drop (>50% decrease)
   - Sufficiency score drop (below 0.6)

2. **Query Anomalies**
   - Unusual query volume (>2x or <0.5x normal)
   - High retry rate (>30%)
   - Zero-result spike

3. **Service Degradation**
   - Qdrant slow responses
   - Reranker unavailable
   - LLM rate limiting

4. **Data Quality Issues**
   - Missing parent chunks
   - Embedding mismatches
   - Empty result patterns

**Widgets:**
- Anomaly timeline (flagged events)
- Performance deviation graph
- Alert severity distribution
- Root cause analysis table

**Insights:**
- "🚨 2 anomalies detected in last 6h"
- "⚠️ Latency spike at 10:15 AM (Qdrant slow)"
- "✅ All anomalies resolved"

---

## Category 3: Data Management (5 Dashboards)

### 3.1 **Indexing Pipeline Dashboard** ⭐ SECOND PRIORITY
**Page:** Data Management / Indexing
**Refresh:** 1m

**Purpose:** Monitor document indexing health and progress

**Key Metrics:**

1. **Indexing Throughput**
   - Documents indexed (Today, This Week, Total)
   - Indexing rate (docs/hour)
   - Target: >360 docs/hour
   - Queue depth (pending jobs)

2. **Job Success Metrics**
   - Success rate (Target: >95%)
   - Failed jobs (count, reasons)
   - Retry distribution (attempts)
   - Average processing time per document

3. **Stage Performance** (7 stages)
   - Load: Avg time
   - Parse: Avg time
   - Structure: Avg time
   - Chunk: Avg time (parent + child)
   - Enrich: Avg time (entities, keywords, summaries)
   - Embed: Avg time (multi-vector)
   - Persist: Avg time (MySQL + Qdrant)

4. **Resource Usage**
   - Queue concurrency (current: 1)
   - Redis queue status
   - Storage writes (MB/s)

**Widgets:**
- Indexing rate line graph
- Success/failure stacked bar
- Stage duration waterfall
- Queue depth gauge
- Recent jobs table (last 50)

**Insights:**
- "📊 325 docs/hour (target: 360)"
- "✅ 98% success rate this week"
- "⏱️ Avg time per doc: 11 seconds"
- "🔴 3 failed jobs in last hour"

---

### 3.2 **Data Quality Dashboard**
**Page:** Data Management / Quality
**Refresh:** 5m

**Purpose:** Monitor quality of indexed data and chunks

**Key Metrics:**

1. **Chunk Statistics**
   - Total parent chunks
   - Total child chunks
   - Average parent size: ~1800 tokens
   - Average child size: ~512 tokens
   - Children per parent: ~2-4
   - Orphan chunks (errors): Should be 0

2. **Enrichment Coverage**
   - % chunks with entities (Target: >80%)
   - % parents with keywords (Target: 100%)
   - % parents with summaries (if enabled)
   - % parents with hypothetical questions

3. **Embedding Quality**
   - Total vectors stored (children + summaries + questions)
   - Embedding success rate (Target: >99%)
   - Embedding dimension consistency (1024)
   - Failed embeddings (count, reasons)

4. **Data Integrity**
   - Chunks with missing parents
   - Lineage validation errors
   - Qdrant-MySQL sync status
   - Duplicate detection

**Widgets:**
- Chunk count trend (growth over time)
- Token distribution histogram
- Enrichment coverage pie chart
- Data integrity alerts

**Insights:**
- "📚 1.2M child chunks indexed"
- "🏷️ 95% chunks have entity tags"
- "✅ Zero orphan chunks"
- "⚠️ 12 embeddings failed (retrying)"

---

### 3.3 **Document Management Dashboard**
**Page:** Data Management / Documents
**Refresh:** 1m

**Purpose:** Monitor document lifecycle and access patterns

**Key Metrics:**

1. **Document Statistics**
   - Total documents uploaded
   - Documents by type (PDF, DOCX, TXT, Code)
   - Document by user role
   - Document by access level (PUBLIC, TEAM, PRIVATE)

2. **Storage Metrics**
   - Total storage used (GB)
   - Average document size
   - Storage growth rate (GB/week)
   - Largest documents (top 10)

3. **Access Patterns**
   - Most accessed documents (top 20)
   - Documents never accessed
   - Access by user role
   - Download frequency

4. **Document Health**
   - Documents pending indexing
   - Documents with indexing errors
   - Documents re-indexed (last 7 days)
   - Orphaned files (not in DB)

**Widgets:**
- Document count by type (bar chart)
- Storage usage gauge
- Access frequency heatmap
- Document table (sortable, filterable)

**Insights:**
- "📁 4,523 documents indexed"
- "💾 Storage: 15.2 GB / 50 GB (30%)"
- "🔥 Top doc: 'Product Spec' (1,250 queries)"
- "⚠️ 5 documents stuck in queue"

---

### 3.4 **Data Source Dashboard**
**Page:** Data Management / Sources
**Refresh:** 1m

**Purpose:** Monitor data sources and integrations

**Key Metrics:**

1. **Source Health**
   - Active data sources (count)
   - Source by type (File upload, API, etc.)
   - Source status (Active, Paused, Error)
   - Last sync time per source

2. **Source Performance**
   - Files added per source (last 7 days)
   - Average files per source
   - Upload success rate per source
   - Processing time per source

3. **RBAC (Role-Based Access Control)**
   - Documents per access level
   - PUBLIC: X docs
   - TEAM: X docs
   - PRIVATE: X docs
   - Access violations (attempts to access restricted docs)

4. **Source Errors**
   - Failed uploads
   - Connection errors
   - Permission issues

**Widgets:**
- Source list (status badges)
- Source activity timeline
- Access level pie chart
- Error log table

**Insights:**
- "🔌 12 active data sources"
- "📂 Source 'Sales Docs': 145 files"
- "🔒 65% documents are PUBLIC"
- "✅ All sources healthy"

---

### 3.5 **Data Retention & Cleanup Dashboard**
**Page:** Data Management / Retention
**Refresh:** 1h

**Purpose:** Monitor data lifecycle policies and cleanup operations

**Key Metrics:**

1. **Retention Policy Status**
   - Documents approaching expiry (next 30 days)
   - Expired documents (not yet cleaned)
   - Cleanup jobs scheduled
   - Cleanup jobs completed (last 7 days)

2. **Cache Cleanup**
   - Cache entries removed (TTL expired)
   - Cache size before/after cleanup
   - Next scheduled cleanup

3. **Storage Reclamation**
   - Storage freed by cleanup (GB)
   - Deleted chunks (MySQL)
   - Deleted vectors (Qdrant)

4. **Audit Trail**
   - Documents deleted (by whom, when)
   - Data export requests
   - Compliance requirements met

**Widgets:**
- Expiry calendar (upcoming deletions)
- Cleanup history timeline
- Storage freed gauge
- Audit log table

**Insights:**
- "🗑️ 23 documents expiring this month"
- "💾 Cleanup freed 1.2 GB yesterday"
- "✅ Retention policy: 365 days"

---

## Category 4: Users & Activity (4 Dashboards)

### 4.1 **User Activity Dashboard**
**Page:** Users & Activity / Overview
**Refresh:** 1m

**Purpose:** Monitor user engagement and activity patterns

**Key Metrics:**

1. **User Statistics**
   - Total users (Active, Inactive, Suspended)
   - New users (Last 7/30 days)
   - User by role (SUPER_ADMIN, ADMIN, USER)
   - Active sessions (current)

2. **Activity Metrics**
   - Daily active users (DAU)
   - Weekly active users (WAU)
   - Monthly active users (MAU)
   - Sessions per user (average)

3. **Feature Usage**
   - Queries performed (per user role)
   - Documents uploaded (per user role)
   - File downloads
   - Evaluation runs

4. **Login Patterns**
   - Login success rate (Target: >99%)
   - Failed login attempts
   - Login method distribution (Email/Password, Google OAuth)
   - Peak login times

**Widgets:**
- Active users gauge
- DAU/WAU/MAU trend lines
- User role distribution pie
- Activity heatmap (day x hour)
- Recent user actions table

**Insights:**
- "👥 342 active users (Last 30 days)"
- "📈 12% user growth this month"
- "🔥 Peak activity: 9-11 AM"
- "🔑 98% login success rate"

---

### 4.2 **API Token Dashboard**
**Page:** Users & Activity / API Tokens
**Refresh:** 5m

**Purpose:** Monitor API token usage and security

**Key Metrics:**

1. **Token Statistics**
   - Total tokens issued
   - Active tokens (used in last 30 days)
   - Expired tokens
   - Revoked tokens

2. **Token Usage**
   - API calls per token (top 20)
   - Token by user role
   - Token creation rate
   - Token expiry distribution (next 30/60/90 days)

3. **API Security**
   - Invalid token attempts
   - Rate limit violations per token
   - Suspicious activity (high volume, unusual patterns)

**Widgets:**
- Active tokens gauge
- Usage ranking table (top tokens)
- Expiry timeline
- Security alerts log

**Insights:**
- "🔑 156 active API tokens"
- "📊 Top token: 4,200 calls this week"
- "⚠️ 8 tokens expiring in 7 days"
- "🚨 2 suspicious tokens flagged"

---

### 4.3 **Session Management Dashboard**
**Page:** Users & Activity / Sessions
**Refresh:** 30s

**Purpose:** Monitor active sessions and user connections

**Key Metrics:**

1. **Session Overview**
   - Current active sessions
   - Average session duration
   - Sessions per hour (trend)
   - Peak concurrent sessions (today)

2. **Session Details**
   - Active sessions by user role
   - Active sessions by device (Web, Mobile, API)
   - Session duration distribution
   - Idle sessions (>30 min inactive)

3. **Session Termination**
   - Logout rate (voluntary vs. timeout)
   - Forced logouts (admin action)
   - Expired sessions

**Widgets:**
- Active sessions real-time counter
- Session duration histogram
- Device type pie chart
- Active sessions table (user, start time, last activity)

**Insights:**
- "🟢 45 active sessions right now"
- "⏱️ Avg session: 32 minutes"
- "💻 85% web, 10% API, 5% mobile"

---

### 4.4 **User Behavior Analytics Dashboard**
**Page:** Users & Activity / Behavior
**Refresh:** 1h

**Purpose:** Understand how users interact with the system

**Key Metrics:**

1. **Query Behavior**
   - Queries per user (avg, median, top 10%)
   - Query complexity (short/medium/long)
   - Repeat queries (same query by same user)
   - Failed query patterns

2. **Document Interaction**
   - Documents uploaded per user
   - Documents accessed per user
   - Download behavior
   - Favorite documents

3. **Feature Adoption**
   - % users using search
   - % users uploading documents
   - % users running evaluations
   - % users using API tokens

4. **User Journeys**
   - Typical workflows (query → download, upload → verify)
   - Drop-off points
   - Feature discovery rate

**Widgets:**
- Query distribution histogram
- Feature adoption funnel
- User journey Sankey diagram
- Power user list (top 10)

**Insights:**
- "💪 Top 10% users generate 60% of queries"
- "📊 78% users only use search (no uploads)"
- "🔄 Average: 8 queries per session"

---

## Category 5: Security & Compliance (3 Dashboards)

### 5.1 **Access Control Dashboard**
**Page:** Security & Compliance / Access
**Refresh:** 1m

**Purpose:** Monitor access control and authorization

**Key Metrics:**

1. **RBAC Enforcement**
   - Access attempts by role
   - Successful access (authorized)
   - Denied access (unauthorized)
   - Permission violations

2. **Document-Level Security**
   - PUBLIC document access
   - TEAM document access
   - PRIVATE document access
   - Cross-team access attempts (denied)

3. **Admin Actions**
   - User role changes
   - Permission grants/revokes
   - Bulk operations (by admins)

4. **Suspicious Activity**
   - Multiple failed access attempts
   - Privilege escalation attempts
   - Unusual access patterns

**Widgets:**
- Access attempts by role (bar chart)
- Authorized vs. denied pie chart
- Admin actions log
- Security alerts table

**Insights:**
- "✅ 99.8% access attempts authorized"
- "🔒 12 unauthorized access attempts blocked"
- "👮 No privilege escalation attempts"

---

### 5.2 **Audit Log Dashboard**
**Page:** Security & Compliance / Audit
**Refresh:** 1m

**Purpose:** Comprehensive audit trail for compliance

**Key Sections:**

1. **User Actions Audit**
   - User login/logout
   - User creation/modification/deletion
   - Role changes
   - Password resets

2. **Data Actions Audit**
   - Document uploads (who, when, what)
   - Document deletions (who, when, what)
   - Data exports (who, when, what data)
   - Document access (who accessed what, when)

3. **System Actions Audit**
   - Configuration changes
   - Service restarts
   - Manual interventions
   - Bulk operations

4. **Compliance Reports**
   - GDPR data access requests
   - Data retention compliance
   - Export logs for external audit

**Widgets:**
- Audit log table (searchable, filterable, exportable)
- Action type distribution (pie chart)
- Timeline view (hourly)
- Export to CSV/JSON button

**Insights:**
- "📋 1,245 audit events logged today"
- "🔍 Full audit trail available"
- "✅ Compliance-ready logs"

---

### 5.3 **Security Incidents Dashboard**
**Page:** Security & Compliance / Incidents
**Refresh:** 30s

**Purpose:** Track and manage security incidents

**Key Metrics:**

1. **Incident Overview**
   - Open incidents (severity: Critical, High, Medium, Low)
   - Closed incidents (last 30 days)
   - Average time to resolution
   - Recurring incident patterns

2. **Incident Categories**
   - Failed login attempts (brute force)
   - Unauthorized access attempts
   - Suspicious API usage
   - Data export anomalies
   - Token theft/abuse

3. **Response Metrics**
   - Time to detection
   - Time to containment
   - Time to resolution
   - Incident ownership (assigned to whom)

4. **Preventive Actions**
   - User accounts locked
   - API tokens revoked
   - IP addresses blocked
   - Services temporarily disabled

**Widgets:**
- Incident severity gauge (Critical/High/Medium/Low)
- Incident timeline
- Response time trend
- Active incidents table (sortable by severity)

**Insights:**
- "✅ No critical incidents"
- "⚠️ 2 medium-severity incidents open"
- "📉 Incident rate: -30% vs. last month"

---

## Category 6: Business Intelligence (2 Dashboards)

### 6.1 **Usage Trends & Analytics Dashboard**
**Page:** Business Intelligence / Trends
**Refresh:** 1h

**Purpose:** Identify trends and business insights

**Key Metrics:**

1. **Growth Trends**
   - User growth rate (MoM, YoY)
   - Query volume growth
   - Document growth rate
   - Storage growth projection

2. **Engagement Trends**
   - DAU/WAU/MAU trends (6 months)
   - Query frequency trends
   - Feature adoption trends
   - User retention rate

3. **Performance Trends**
   - Response time trends (last 30 days)
   - Cache hit rate trends
   - Indexing throughput trends

4. **Cost Trends** (if integrated)
   - LLM cost trends
   - Storage cost trends
   - Infrastructure cost trends
   - Cost per user trends

**Widgets:**
- Multi-line growth chart (users, queries, docs)
- Engagement heatmap (weekly)
- Performance trend lines
- Cost projection graph

**Insights:**
- "📈 User base grew 45% in Q4 2025"
- "🚀 Query volume up 120% YoY"
- "💰 Cost per user decreased 15%"

---

### 6.2 **Evaluation & Quality Dashboard**
**Page:** Business Intelligence / Evaluation
**Refresh:** 5m

**Purpose:** Monitor RAG evaluation results and quality metrics

**Key Metrics:**

1. **RAGAS Evaluation Results** (if ltv-ragas-evaluation integrated)
   - Overall RAGAS score (0-1)
   - Faithfulness score (groundedness)
   - Answer relevancy score
   - Context relevancy score
   - Context precision score
   - Context recall score

2. **Evaluation Jobs**
   - Total evaluation runs
   - Avg evaluation duration
   - Evaluation success rate
   - Failed evaluations

3. **Quality Trends**
   - RAGAS score over time (last 30 runs)
   - Quality by query type
   - Quality by document type
   - A/B test results (if implemented)

4. **Improvement Tracking**
   - Best performing configurations
   - Worst performing queries
   - Suggested improvements

**Widgets:**
- RAGAS score gauge (with target line)
- Score component radar chart
- Evaluation history table
- Quality trend line

**Insights:**
- "🎯 Overall RAGAS score: 0.87"
- "✅ Faithfulness: 0.92 (excellent)"
- "⚠️ Context recall: 0.76 (improvement needed)"
- "📊 Quality improved 12% this month"

---

## Implementation Roadmap

### Phase 1: Critical Foundation (Weeks 1-2)
**Goal:** Deploy 5 most critical dashboards

1. **Overall System Status Dashboard** (1.1)
2. **Retrieval Quality Dashboard** (2.1)
3. **Indexing Pipeline Dashboard** (3.1)
4. **User Activity Dashboard** (4.1)
5. **Error & Alert Dashboard** (1.4)

**Technical Tasks:**
- Create `/ltv-assistant-cms/src/pages/admin/dashboards/` directory
- Build React components for:
  - Status cards
  - Line charts (using Chart.js or Recharts)
  - Gauges
  - Data tables (using Mantine DataTable)
- Create API endpoints in `ltv-assistant-cms` backend:
  - `GET /api/admin/dashboard/system-status`
  - `GET /api/admin/dashboard/retrieval-quality`
  - `GET /api/admin/dashboard/indexing-pipeline`
  - `GET /api/admin/dashboard/user-activity`
  - `GET /api/admin/dashboard/errors`
- Integrate with:
  - Loki API (logs)
  - Prometheus API (metrics)
  - MySQL (user/document data)

---

### Phase 2: Core Monitoring (Weeks 3-4)
**Goal:** Deploy 8 additional monitoring dashboards

6. **Service Performance Dashboard** (1.2)
7. **Infrastructure & Resource Dashboard** (1.3)
8. **Query Analytics Dashboard** (2.2)
9. **Cache Performance Dashboard** (2.3)
10. **Data Quality Dashboard** (3.2)
11. **Document Management Dashboard** (3.3)
12. **API Token Dashboard** (4.2)
13. **Access Control Dashboard** (5.1)

**Technical Tasks:**
- Build complex visualizations:
  - Heatmaps
  - Waterfall charts
  - Sankey diagrams
- Implement data aggregation layer (reduce API calls)
- Add dashboard navigation menu in CMS
- Implement role-based dashboard access (SUPER_ADMIN only)

---

### Phase 3: Advanced Analytics (Weeks 5-6)
**Goal:** Deploy remaining 12 dashboards

14. **Uptime & SLA Dashboard** (1.5)
15. **LLM Provider Dashboard** (2.4)
16. **Search & Reranking Dashboard** (2.5)
17. **Retrieval Anomaly Dashboard** (2.6)
18. **Data Source Dashboard** (3.4)
19. **Data Retention & Cleanup Dashboard** (3.5)
20. **Session Management Dashboard** (4.3)
21. **User Behavior Analytics Dashboard** (4.4)
22. **Audit Log Dashboard** (5.2)
23. **Security Incidents Dashboard** (5.3)
24. **Usage Trends & Analytics Dashboard** (6.1)
25. **Evaluation & Quality Dashboard** (6.2)

**Technical Tasks:**
- Implement anomaly detection algorithms
- Build advanced filters and drill-down capabilities
- Add export functionality (CSV, JSON, PDF reports)
- Implement email/Slack alerts
- Add dashboard customization (save custom views)

---

### Phase 4: Polish & Optimization (Week 7)
**Goal:** Production-ready, optimized, and documented

**Tasks:**
- Performance optimization (caching, query optimization)
- Mobile responsiveness
- Dark/light theme support
- User documentation (help tooltips)
- Admin guide (how to interpret metrics)
- Load testing (1000+ concurrent users)
- Security audit
- Accessibility compliance (WCAG 2.1 AA)

---

## Technical Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────┐
│                 LTV Assistant Services              │
│  (Retrieval, Indexing, Auth, Datasource, etc.)     │
└──────────────┬────────────────┬─────────────────────┘
               │                │
          (Logs via Pino)  (Metrics via OTel)
               │                │
               ▼                ▼
       ┌──────────────┐  ┌──────────────┐
       │     Loki     │  │  Prometheus  │
       │  (Log Store) │  │ (Metrics DB) │
       └───────┬──────┘  └──────┬───────┘
               │                │
               │  ┌──────────┐  │
               └──┤  Grafana ├──┘ (Existing, for devs)
                  └──────────┘

                  ┌──────────────────────────────────┐
                  │   CMS Admin Dashboard Layer      │
                  │  (React Components + API Layer)  │
                  └────────────┬─────────────────────┘
                               │
                  (REST APIs for dashboard data)
                               │
                ┌──────────────┴─────────────────┐
                │                                │
         ┌──────▼──────┐              ┌─────────▼─────────┐
         │   Loki API  │              │  Prometheus API   │
         │ (LogQL)     │              │  (PromQL)         │
         └─────────────┘              └───────────────────┘
                │                                │
         ┌──────▼──────────────────────────────▼────┐
         │      MySQL (ltv-assistant-mysql)         │
         │  (Users, Documents, Chunks, Sessions)    │
         └──────────────────────────────────────────┘
```

### Tech Stack

**Frontend (CMS Dashboard Pages):**
- React 19 (existing CMS framework)
- Mantine UI v7 (existing component library)
- Recharts or Chart.js (for visualizations)
- Axios (API calls)
- React Query (data fetching + caching)

**Backend (CMS API Endpoints):**
- NestJS (if CMS has backend) OR
- New Express microservice `ltv-assistant-dashboard-api`
- Loki API client (`@grafana/loki`)
- Prometheus API client (`prom-client`)
- MySQL client (Drizzle ORM, existing)

**Data Sources:**
- Loki (logs from all services)
- Prometheus (infrastructure metrics)
- MySQL (user, document, chunk data)
- Redis (cache statistics)

---

## Key Design Principles

### 1. **User-Friendly First**
- **No technical jargon** in dashboard titles/labels
- Use icons and color coding (Green/Yellow/Red)
- Provide context: "What is this metric and why does it matter?"
- Show actionable insights, not just raw numbers

### 2. **Mobile-Responsive**
- All dashboards must work on tablets (iPad)
- Critical metrics accessible on mobile phones
- Responsive grid layouts

### 3. **Performance**
- Dashboard page load: <2 seconds
- Auto-refresh without blocking UI
- Lazy loading for heavy components
- API response caching (5-60s depending on metric)

### 4. **Accessibility**
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- High contrast mode

### 5. **Actionable Alerts**
- Every alert includes:
  - What happened
  - Why it matters
  - What to do about it
  - Severity level (Critical/High/Medium/Low)

---

## Sample Dashboard Wireframe

**Example: Retrieval Quality Dashboard (2.1)**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Retrieval Quality Dashboard           🔄 Auto-refresh: 30s │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Sufficiency  │  │  Cache Hit   │  │  Avg Latency │        │
│  │    Score     │  │     Rate     │  │   (P95)      │        │
│  │              │  │              │  │              │        │
│  │    0.87      │  │    24.5%     │  │   1,245 ms   │        │
│  │     ▲5%      │  │     ▲3%      │  │    ▼120ms    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📊 Latency Breakdown (Waterfall)                       │   │
│  │                                                          │   │
│  │  Cache Check:     ███ 45ms                              │   │
│  │  Transform:       ████████ 210ms                        │   │
│  │  Vector Search:   ██████ 150ms                          │   │
│  │  Reranking:       ███████████ 320ms                     │   │
│  │  Enrichment:      ████████ 220ms                        │   │
│  │  ────────────────────────────────────────────────────   │   │
│  │  Total:           ██████████████████████ 945ms          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐   │
│  │  🎯 Quality Score    │  │  💡 Insights                  │   │
│  │  Distribution        │  │                               │   │
│  │                      │  │  ✅ 87% queries sufficient    │   │
│  │  [Histogram graph]   │  │     on first try              │   │
│  │                      │  │  ⚡ Cache saves 1.2s per hit  │   │
│  │                      │  │  📊 Reranker improves         │   │
│  │                      │  │     relevance by 38%          │   │
│  └──────────────────────┘  └──────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📈 Sufficiency Score Trend (Last 24 Hours)             │   │
│  │                                                          │   │
│  │  [Line graph showing score over time with target line]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Metrics Collection Strategy

### From Existing Grafana Dashboards

**Already Tracked (can query directly):**
- Retrieval: Query latency, cache hits, sufficiency scores, error rates
- Indexing: Job counts, stage durations, success rates
- Infrastructure: Service uptime, Redis stats, error logs

**Queries via Loki (LogQL):**
```
# Query latency P95
quantile_over_time(0.95, {service="ltv-assistant-retrieval"}
  |~ "Query completed"
  | regexp `(?P<duration>\d+)ms`
  | unwrap duration [5m])

# Cache hit rate
(sum(count_over_time({service="ltv-assistant-retrieval"}
  | json | cached="true" [1h]))
/ sum(count_over_time({service="ltv-assistant-retrieval"}
  |~ "Query completed" [1h]))) * 100

# Indexing success rate
(sum(count_over_time({service="ltv-assistant-indexing"}
  |~ "Job completed successfully" [1h]))
/ sum(count_over_time({service="ltv-assistant-indexing"}
  |~ "Job started" [1h]))) * 100
```

**Queries via Prometheus (PromQL):**
```
# Service uptime
up{job="ltv-assistant-retrieval"}

# Redis memory usage
(redis_memory_used_bytes / redis_memory_max_bytes) * 100

# Redis cache hit rate
rate(redis_keyspace_hits_total[5m])
/ (rate(redis_keyspace_hits_total[5m])
   + rate(redis_keyspace_misses_total[5m]))
```

**Direct MySQL Queries:**
```sql
-- Total users by role
SELECT role, COUNT(*) FROM users GROUP BY role;

-- Active sessions in last 24h
SELECT COUNT(*) FROM sessions
WHERE last_activity > NOW() - INTERVAL 24 HOUR;

-- Documents indexed today
SELECT COUNT(*) FROM indexing_jobs
WHERE status='completed' AND completed_at > CURDATE();

-- Top accessed documents
SELECT file_id, COUNT(*) as access_count
FROM query_logs
GROUP BY file_id
ORDER BY access_count DESC
LIMIT 20;
```

### New Metrics to Add

**Need to instrument (Pino logging):**

1. **User Activity:**
   - Log user actions: `logger.info('User action', { userId, action: 'query', metadata })`
   - Track feature usage
   - Session start/end events

2. **API Tokens:**
   - Token usage counters
   - Token validation attempts

3. **Security Events:**
   - Failed access attempts
   - Suspicious patterns

4. **Cost Tracking:**
   - LLM token usage
   - Cost estimates per query

---

## Alerting Strategy

### Alert Levels

**Critical (Red) - Immediate Action Required:**
- System downtime (any service down >1 min)
- Error rate >5%
- P95 latency >3s
- Indexing stopped (no jobs in 15 min)
- Security breach attempt

**High (Orange) - Action Within 1 Hour:**
- Error rate >2%
- P95 latency >2s
- Cache hit rate <10%
- Sufficiency score <0.6
- Queue depth >500

**Medium (Yellow) - Action Within 24 Hours:**
- Error rate >1%
- Performance degradation (>1.5x baseline)
- Storage >75% capacity
- Failed jobs >10%

**Low (Blue) - Informational:**
- Performance improvements
- Capacity planning alerts
- Scheduled maintenance reminders

### Alert Channels

1. **In-Dashboard Notifications**
   - Alert banner at top of dashboard
   - Badge count on menu items

2. **Email Alerts** (configurable)
   - Critical: Immediate email to super admin
   - Daily digest: Summary of all alerts

3. **Slack Integration** (optional)
   - Critical alerts to `#admin-alerts` channel

---

## Dashboard Export & Reporting

### Export Options

**For Each Dashboard:**
1. **PDF Report** (for presentations)
   - Header: Dashboard name, date/time, period
   - All widgets rendered as images
   - Insights summary

2. **CSV Export** (for analysis)
   - Raw data behind each metric
   - Timestamp, value, metadata

3. **JSON Export** (for integrations)
   - Structured data for external tools

4. **Scheduled Reports**
   - Daily email: System health summary
   - Weekly email: Usage trends
   - Monthly email: Business intelligence report

---

## Access Control

### Role-Based Access

**SUPER_ADMIN:**
- Access to ALL 25 dashboards
- Can export data
- Can configure alerts
- Can view audit logs

**ADMIN:**
- Access to dashboards: 1.1-1.4, 2.1-2.3, 3.1-3.4, 4.1-4.2
- Cannot access: Security, Compliance, Business Intelligence
- Limited export (own team data only)

**USER:**
- No dashboard access (feature blocked)

---

## Performance Targets

### Dashboard Performance SLOs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial page load | <2s | Time to interactive |
| Dashboard refresh | <500ms | Data fetch + render |
| API response time | <200ms | P95 |
| Concurrent users | 100+ | Load test |
| Dashboard uptime | 99.9% | Availability |

### Optimization Strategies

1. **Caching:**
   - API responses cached 5-60s (per metric)
   - Client-side caching with React Query
   - Browser cache for static assets

2. **Lazy Loading:**
   - Load widgets on viewport entry
   - Load heavy data tables on demand

3. **Data Aggregation:**
   - Pre-aggregate metrics in background jobs
   - Store aggregated data in Redis (TTL: 5 min)

4. **Compression:**
   - Gzip API responses
   - Minify JavaScript/CSS

---

## Maintenance & Support

### Ongoing Tasks

**Daily:**
- Monitor dashboard performance (load times)
- Review alert noise (false positives)
- Check data freshness

**Weekly:**
- Review user feedback (if feedback form added)
- Update documentation
- Test new metric queries

**Monthly:**
- Performance review (SLO compliance)
- Capacity planning (storage, API rate limits)
- Feature requests review

**Quarterly:**
- Dashboard redesign based on feedback
- Add new metrics as platform evolves
- Remove unused/irrelevant metrics

---

## Success Metrics

### Adoption Metrics
- % super admins using dashboards weekly: Target >80%
- Avg time spent on dashboards per session: Target >5 min
- Most viewed dashboards (top 5)

### Impact Metrics
- Reduced time to detect issues: Target <5 min (down from ~30 min)
- Reduced time to resolution: Target <30 min (down from ~2 hours)
- Reduced Grafana usage by non-devs: Target -90%

### Satisfaction Metrics
- User satisfaction score (survey): Target >4.5/5
- Feature request volume: Target <5/month (after initial feedback)

---

## Appendix A: Dashboard Comparison Matrix

| Dashboard | Category | Priority | Complexity | Data Sources | Est. Dev Time |
|-----------|----------|----------|------------|--------------|---------------|
| 1.1 System Status | Health | ⭐⭐⭐ | Medium | Loki, Prometheus, MySQL | 3 days |
| 1.2 Service Performance | Health | ⭐⭐ | Medium | Loki, Prometheus | 2 days |
| 1.3 Infrastructure | Health | ⭐ | High | Prometheus, MySQL | 3 days |
| 1.4 Errors & Alerts | Health | ⭐⭐⭐ | Medium | Loki | 2 days |
| 1.5 Uptime & SLA | Health | ⭐ | Low | Prometheus, MySQL | 1 day |
| 2.1 Retrieval Quality | RAG | ⭐⭐⭐ | High | Loki | 4 days |
| 2.2 Query Analytics | RAG | ⭐⭐ | Medium | Loki, MySQL | 2 days |
| 2.3 Cache Performance | RAG | ⭐⭐ | Medium | Loki | 2 days |
| 2.4 LLM Provider | RAG | ⭐ | Medium | Loki | 2 days |
| 2.5 Search & Reranking | RAG | ⭐ | High | Loki | 3 days |
| 2.6 Retrieval Anomaly | RAG | ⭐ | High | Loki (ML detection) | 4 days |
| 3.1 Indexing Pipeline | Data | ⭐⭐⭐ | High | Loki, MySQL | 4 days |
| 3.2 Data Quality | Data | ⭐⭐ | Medium | MySQL | 2 days |
| 3.3 Document Management | Data | ⭐⭐ | Medium | MySQL | 2 days |
| 3.4 Data Sources | Data | ⭐ | Low | MySQL | 1 day |
| 3.5 Data Retention | Data | ⭐ | Low | MySQL | 1 day |
| 4.1 User Activity | Users | ⭐⭐ | Medium | MySQL, Loki | 2 days |
| 4.2 API Tokens | Users | ⭐ | Low | MySQL | 1 day |
| 4.3 Session Management | Users | ⭐ | Low | MySQL | 1 day |
| 4.4 User Behavior | Users | ⭐ | High | MySQL, Loki (ML) | 3 days |
| 5.1 Access Control | Security | ⭐⭐ | Medium | MySQL, Loki | 2 days |
| 5.2 Audit Log | Security | ⭐⭐ | Medium | MySQL (audit table) | 2 days |
| 5.3 Security Incidents | Security | ⭐ | Medium | MySQL, Loki | 2 days |
| 6.1 Usage Trends | Business | ⭐ | High | MySQL (time-series) | 3 days |
| 6.2 Evaluation Quality | Business | ⭐ | Medium | MySQL (ragas results) | 2 days |
| **TOTAL** | - | - | - | - | **59 days** |

**Note:** Estimated 59 dev days = ~12 weeks for 1 developer OR ~6 weeks for 2 developers (with 50% overhead for testing, reviews, etc.)

---

## Appendix B: Sample API Endpoint Specification

**Endpoint:** `GET /api/admin/dashboard/retrieval-quality`

**Authentication:** JWT token (SUPER_ADMIN role required)

**Query Parameters:**
- `period` (optional): `1h` | `24h` | `7d` | `30d` (default: `24h`)
- `refresh` (optional): `true` | `false` (bypass cache, default: `false`)

**Response:**
```json
{
  "status": "success",
  "data": {
    "sufficiencyScore": {
      "current": 0.87,
      "change": 0.05,
      "trend": "up",
      "target": 0.80,
      "status": "healthy"
    },
    "cacheHitRate": {
      "current": 24.5,
      "change": 3.0,
      "trend": "up",
      "target": 20.0,
      "status": "healthy"
    },
    "latency": {
      "p50": 645,
      "p95": 1245,
      "p99": 2100,
      "change": -120,
      "trend": "down",
      "target": 1500,
      "status": "healthy",
      "breakdown": {
        "cacheCheck": 45,
        "transform": 210,
        "vectorSearch": 150,
        "reranking": 320,
        "enrichment": 220
      }
    },
    "insights": [
      "✅ 87% of queries sufficient on first try",
      "⚡ Cache saves 1.2s average per hit",
      "📊 Reranker improves relevance by 38%"
    ],
    "alerts": [],
    "timestamp": "2025-11-14T10:30:00Z",
    "period": "24h"
  }
}
```

---

## Appendix C: Glossary for Non-Technical Users

| Term | Simple Explanation |
|------|-------------------|
| **Cache Hit Rate** | % of queries answered from fast memory (cache) instead of full search |
| **P95 Latency** | Response time where 95% of requests are faster (removes outliers) |
| **Sufficiency Score** | How confident the system is that the answer is complete (0-1 scale) |
| **Vector Search** | Finding similar documents using AI embeddings |
| **Reranking** | Re-sorting search results to put best matches first |
| **Indexing** | Processing documents to make them searchable |
| **Chunk** | Small piece of a document (usually 1-2 paragraphs) |
| **LLM** | Large Language Model (AI that understands/generates text) |
| **RAGAS** | Quality scoring system for RAG (retrieval + generation) |
| **Uptime** | % of time the system is working (99.9% = 8.6 hours downtime/year) |
| **SLA** | Service Level Agreement (promised uptime/performance) |
| **RBAC** | Role-Based Access Control (permissions by user role) |
| **API Token** | Secret key that allows programs to access the system |
| **Audit Log** | Record of who did what and when (for compliance) |

---

**END OF SPECIFICATION**

---

## Quick Reference: Dashboard Checklist

✅ **Category 1: System Health** (5 dashboards)
- [ ] 1.1 Overall System Status ⭐
- [ ] 1.2 Service Performance
- [ ] 1.3 Infrastructure & Resource
- [ ] 1.4 Error & Alert ⭐
- [ ] 1.5 Uptime & SLA

✅ **Category 2: RAG Performance** (6 dashboards)
- [ ] 2.1 Retrieval Quality ⭐
- [ ] 2.2 Query Analytics
- [ ] 2.3 Cache Performance
- [ ] 2.4 LLM Provider
- [ ] 2.5 Search & Reranking
- [ ] 2.6 Retrieval Anomaly

✅ **Category 3: Data Management** (5 dashboards)
- [ ] 3.1 Indexing Pipeline ⭐
- [ ] 3.2 Data Quality
- [ ] 3.3 Document Management
- [ ] 3.4 Data Source
- [ ] 3.5 Data Retention & Cleanup

✅ **Category 4: Users & Activity** (4 dashboards)
- [ ] 4.1 User Activity
- [ ] 4.2 API Token
- [ ] 4.3 Session Management
- [ ] 4.4 User Behavior Analytics

✅ **Category 5: Security & Compliance** (3 dashboards)
- [ ] 5.1 Access Control
- [ ] 5.2 Audit Log
- [ ] 5.3 Security Incidents

✅ **Category 6: Business Intelligence** (2 dashboards)
- [ ] 6.1 Usage Trends & Analytics
- [ ] 6.2 Evaluation & Quality

**TOTAL: 25 Dashboards**
