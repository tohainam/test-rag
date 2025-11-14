# Deployment Guide

**Last Updated:** 2025-01-09
**Project:** LTV Assistant v1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Docker Compose Files Structure](#docker-compose-files-structure)
3. [Local Development Deployment](#local-development-deployment)
4. [Production Deployment with Docker Swarm](#production-deployment-with-docker-swarm)
5. [Environment Variables](#environment-variables)
6. [Database Migrations](#database-migrations)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Troubleshooting](#troubleshooting)

---

## Overview

LTV Assistant uses a multi-file Docker Compose strategy that supports both local development and production Docker Swarm deployment:

- **docker-compose.yml**: Base infrastructure services (MySQL, Redis, MinIO, Qdrant, monitoring)
- **docker-compose.app.yml**: Application services (API Gateway, Auth, Datasource, Indexing, Retrieval, CMS)
- **docker-compose.prod.yml**: Production-specific configurations for Docker Swarm (replicas, resources, placement)

---

## Docker Compose Files Structure

### docker-compose.yml (Infrastructure)
Contains all backend infrastructure:
- **Databases**: MySQL, Redis
- **Storage**: MinIO (S3-compatible)
- **Vector DB**: Qdrant
- **LLM**: Ollama + Web UI
- **ML Services**: BGE Reranker
- **Monitoring**: Prometheus, Grafana, Loki, Tempo, Promtail, cAdvisor
- **Admin UIs**: phpMyAdmin, Redis Insight

### docker-compose.app.yml (Applications)
Contains all application services:
- **api-gateway** (Port 50050)
- **ltv-assistant-auth** (Ports 50051, 4001)
- **ltv-assistant-datasource** (Ports 50054, 4004)
- **ltv-assistant-indexing** (Ports 50055, 4005)
- **ltv-assistant-retrieval** (Ports 50053, 4006)
- **ltv-assistant-cms** (Port 30000)

### docker-compose.prod.yml (Production Config)
Production overrides for Docker Swarm:
- Replica configurations
- Resource limits and reservations
- Update and rollback strategies
- Placement constraints
- Restart policies
- Overlay networking

---

## Local Development Deployment

### Option 1: Infrastructure Only (Recommended for Development)

Run infrastructure in Docker, run applications locally with hot-reload:

```bash
# 1. Start infrastructure services
docker-compose up -d

# 2. Verify all services are healthy
docker-compose ps

# 3. Run applications locally (in separate terminals)
cd api-gateway && npm run start:dev
cd ltv-assistant-auth && npm run start:dev
cd ltv-assistant-datasource && npm run start:dev
cd ltv-assistant-indexing && npm run start:dev
cd ltv-assistant-retrieval && npm run start:dev
cd ltv-assistant-cms && npm run dev
```

**Benefits:**
- Fast hot-reload during development
- Easy debugging with source maps
- No need to rebuild Docker images for code changes
- All infrastructure dependencies available

### Option 2: Full Docker Stack

Run everything in Docker (slower for development, but closer to production):

```bash
# 1. Create environment file
cp .env.example .env

# 2. Start infrastructure first
docker-compose up -d

# 3. Wait for infrastructure to be healthy
docker-compose ps

# 4. Start application services
docker-compose -f docker-compose.app.yml up -d

# 5. View all running services
docker-compose ps
docker-compose -f docker-compose.app.yml ps
```

### Stopping Services

```bash
# Stop applications only
docker-compose -f docker-compose.app.yml down

# Stop infrastructure
docker-compose down

# Stop everything and remove volumes (CAUTION: This deletes all data!)
docker-compose down -v
docker-compose -f docker-compose.app.yml down -v
```

---

## Production Deployment with Docker Swarm

### Prerequisites

1. **Docker Swarm initialized**:
   ```bash
   docker swarm init
   ```

2. **Environment variables configured**:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Build and push images** (if using private registry):
   ```bash
   # Build all images
   docker-compose -f docker-compose.app.yml build

   # Tag for registry
   docker tag api-gateway:latest your-registry.com/api-gateway:latest
   docker tag ltv-assistant-auth:latest your-registry.com/ltv-assistant-auth:latest
   # ... tag other services

   # Push to registry
   docker push your-registry.com/api-gateway:latest
   docker push your-registry.com/ltv-assistant-auth:latest
   # ... push other services
   ```

### Deployment

#### Deploy Full Stack

```bash
# Deploy everything (infrastructure + applications) to Swarm
docker stack deploy \
  -c docker-compose.yml \
  -c docker-compose.app.yml \
  -c docker-compose.prod.yml \
  ltv-assistant
```

#### Verify Deployment

```bash
# Check stack services
docker stack services ltv-assistant

# Check running containers
docker service ls

# View logs for a specific service
docker service logs ltv-assistant_api-gateway

# Check replicas
docker service ps ltv-assistant_api-gateway
```

#### Update a Service

```bash
# Method 1: Update via stack deploy (recommended)
# Edit code, rebuild image
docker-compose -f docker-compose.app.yml build api-gateway

# Redeploy stack
docker stack deploy \
  -c docker-compose.yml \
  -c docker-compose.app.yml \
  -c docker-compose.prod.yml \
  ltv-assistant

# Method 2: Manual service update
docker service update \
  --image your-registry.com/api-gateway:v1.1.0 \
  ltv-assistant_api-gateway
```

#### Scale Services

```bash
# Scale retrieval service to 5 replicas
docker service scale ltv-assistant_ltv-assistant-retrieval=5

# Or edit docker-compose.prod.yml and redeploy
```

#### Remove Stack

```bash
# Remove entire stack
docker stack rm ltv-assistant

# Wait for cleanup
watch docker stack ps ltv-assistant
```

---

## Environment Variables

### Required Environment Variables

Create a `.env` file in the project root:

```bash
# Node Environment
NODE_ENV=production

# MySQL
MYSQL_ROOT_PASSWORD=your-secure-password
MYSQL_USER=ltv_user
MYSQL_PASSWORD=your-secure-password

# JWT Authentication
JWT_SECRET=your-very-long-secure-random-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# Object Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your-secure-password

# Frontend
FRONTEND_URL=https://your-domain.com
VITE_API_BASE_URL=https://api.your-domain.com

# Tracing
TEMPO_ENDPOINT=http://tempo:4318/v1/traces
```

### Environment Variables per Service

**api-gateway:**
- `PORT`, `AUTH_SERVICE_HOST`, `AUTH_SERVICE_PORT`

**ltv-assistant-auth:**
- `DATABASE_HOST`, `DATABASE_NAME`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**ltv-assistant-datasource:**
- `DATABASE_HOST`, `MINIO_ENDPOINT`, `REDIS_HOST`

**ltv-assistant-indexing:**
- `DATABASE_HOST`, `QDRANT_URL`, `OLLAMA_BASE_URL`

**ltv-assistant-retrieval:**
- `DATABASE_HOST`, `QDRANT_URL`, `BGE_RERANKER_URL`

---

## Database Migrations

### Running Migrations

**Before first deployment:**

```bash
# Auth database
cd ltv-assistant-auth
npm run db:push

# Datasource database
cd ltv-assistant-datasource
npm run db:push

# Indexing database
cd ltv-assistant-indexing
npm run db:push
```

**In production (using Drizzle Kit):**

```bash
# Generate migration files
npm run db:generate

# Review migration SQL files in ./drizzle

# Apply migrations
npm run db:migrate
```

---

## Monitoring and Logging

### Access Monitoring Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Loki**: http://localhost:3100
- **Tempo**: http://localhost:3200

### Pre-configured Dashboards

Import dashboards from `./monitoring/dashboards/`:
- `ltv-assistant-retrieval-dashboard.json`
- `bge-reranker-dashboard.json`
- `prometheus-all-services-dashboard.json`

### View Logs

**Docker Compose:**
```bash
docker-compose logs -f api-gateway
docker-compose logs -f --tail=100 ltv-assistant-auth
```

**Docker Swarm:**
```bash
docker service logs -f ltv-assistant_api-gateway
docker service logs --tail 100 ltv-assistant_ltv-assistant-retrieval
```

---

## Troubleshooting

### Services Won't Start

**Check health status:**
```bash
docker-compose ps
docker stack services ltv-assistant
```

**View logs:**
```bash
docker-compose logs <service-name>
docker service logs ltv-assistant_<service-name>
```

### Database Connection Issues

**Verify MySQL is running:**
```bash
docker exec -it ltv-mysql mysql -uroot -p
```

**Check network connectivity:**
```bash
docker network inspect ltv-network
```

### Memory Issues

**Check resource usage:**
```bash
docker stats
```

**Increase Docker memory** (Docker Desktop):
- Settings → Resources → Memory → Increase to 8GB+

### Port Conflicts

**Check if ports are in use:**
```bash
lsof -i :50050
lsof -i :3306
```

**Change ports** in docker-compose.yml if needed.

### Build Failures

**Clear build cache:**
```bash
docker-compose -f docker-compose.app.yml build --no-cache
```

**Remove old images:**
```bash
docker image prune -a
```

### Swarm Node Issues

**Check node status:**
```bash
docker node ls
```

**Drain a node:**
```bash
docker node update --availability drain <node-id>
```

**Re-activate node:**
```bash
docker node update --availability active <node-id>
```

---

## Health Checks

All services implement health checks:

- **HTTP Services**: `GET /health` endpoint
- **Databases**: Database-specific health commands
- **Storage**: MinIO health endpoint

**Check service health:**
```bash
curl http://localhost:50050/health  # API Gateway
curl http://localhost:50051/health  # Auth
curl http://localhost:50054/health  # Datasource
curl http://localhost:50055/health  # Indexing
curl http://localhost:50053/health  # Retrieval
curl http://localhost:30000/health  # CMS
```

---

## Production Checklist

Before deploying to production:

- [ ] Set strong passwords in `.env`
- [ ] Configure Google OAuth credentials
- [ ] Set up SSL/TLS certificates (use reverse proxy like Nginx/Traefik)
- [ ] Configure firewall rules
- [ ] Set up automated backups for volumes
- [ ] Enable monitoring alerts
- [ ] Test disaster recovery procedures
- [ ] Review and adjust resource limits
- [ ] Set up CI/CD pipeline
- [ ] Configure log rotation
- [ ] Enable security scanning

---

## Quick Reference

### Useful Commands

```bash
# Development: Infrastructure only
docker-compose up -d

# Development: Full stack
docker-compose up -d && docker-compose -f docker-compose.app.yml up -d

# Production: Deploy to Swarm
docker stack deploy -c docker-compose.yml -c docker-compose.app.yml -c docker-compose.prod.yml ltv-assistant

# View all services
docker service ls

# Scale a service
docker service scale ltv-assistant_api-gateway=5

# Update a service
docker service update --force ltv-assistant_api-gateway

# Remove stack
docker stack rm ltv-assistant

# Clean up everything (CAUTION!)
docker system prune -a --volumes
```

---

For more information, see:
- [System Architecture](./system-architecture.md)
- [Project Overview PDR](./project-overview-pdr.md)
- [Diagrams](./diagrams.md)
