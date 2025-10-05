# Deployment Guide & Architecture

## 1. Deployment Architecture Overview

```mermaid
graph TB
    subgraph "Edge Layer"
        CDN[Cloudflare CDN]
        DNS[Cloudflare DNS]
    end

    subgraph "Application Layer (Vercel)"
        FRONTEND[Next.js Frontend]
        API_GW[API Gateway]
        EDGE_FN[Edge Functions]
    end

    subgraph "Compute Layer"
        SERVERLESS[Serverless Functions]
        CONTAINERS[Containers (optional)]
    end

    subgraph "Storage Layer"
        LANCEDB_LOCAL[(LanceDB Local)]
        SUPABASE[(Supabase Cloud)]
        VERCEL_KV[(Vercel KV)]
        S3[(AWS S3)]
    end

    subgraph "External Services"
        OPENAI[OpenAI API]
        ZHIPU[智谱AI API]
        DASHSCOPE[阿里云DashScope]
    end

    subgraph "Monitoring"
        VERCEL_ANAL[Vercel Analytics]
        SENTRY[Sentry Error Tracking]
        UPTIME[Uptime Robot]
    end

    CDN --> FRONTEND
    DNS --> CDN
    FRONTEND --> API_GW
    API_GW --> EDGE_FN
    EDGE_FN --> SERVERLESS

    SERVERLESS --> LANCEDB_LOCAL
    SERVERLESS --> SUPABASE
    SERVERLESS --> VERCEL_KV
    SERVERLESS --> S3

    SERVERLESS --> OPENAI
    SERVERLESS --> ZHIPU
    SERVERLESS --> DASHSCOPE

    VERCEL_ANAL -.-> SERVERLESS
    SENTRY -.-> FRONTEND
    UPTIME -.-> DNS
```

## 2. Environment Configuration

### 2.1 Development Environment

```bash
# .env.development
# Database
LANCEDB_PATH=./data/lancedb
EMBEDDING_MODEL_PATH=./models/bge-m3

# LLM Providers (choose one or more)
OPENAI_API_KEY=sk-dev-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

ZHIPU_API_KEY=your-zhipu-key
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4

DASHSCOPE_API_KEY=your-dashscope-key

# Embedding Configuration
EMBEDDING_DIM=1024
EMBEDDING_MODEL=bge-m3

# Feature Flags
HYBRID_SEARCH=true
KV_CACHE=true
DEBUG=true
LOG_LEVEL=debug

# Performance
TIMEOUT_MS=30000
BATCH_SIZE=100
MAX_CONCURRENT_REQUESTS=10
```

### 2.2 Production Environment

```bash
# .env.production
# Database (for >10k records)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
POSTGRES_URL=postgresql://...

# Cache
REDIS_URL=redis://your-redis:6379
VERCEL_KV_URL=your-kv-url
VERCEL_KV_REST_TOKEN=your-token

# External APIs
OPENAI_API_KEY=sk-prod-xxx
ZHIPU_API_KEY=prod-zhipu-key

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
ANALYTICS_ID=your-analytics-id

# Security
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=3600

# Performance
EDGE_LOCATION=auto
COMPRESSION=true
MINIFY=true
```

## 3. Vercel Deployment

### 3.1 Project Configuration

```json
// vercel.json
{
  "version": 2,
  "name": "infi-dao",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "functions": {
    "app/api/embed/route.ts": {
      "runtime": "nodejs18.x",
      "maxDuration": 30,
      "memory": 1024,
      "regions": ["hkg1", "sin1", "sfo1"]
    },
    "app/api/search/route.ts": {
      "runtime": "nodejs18.x",
      "maxDuration": 30,
      "memory": 1024,
      "regions": ["hkg1", "sin1", "sfo1"]
    },
    "app/api/annotate/route.ts": {
      "runtime": "nodejs18.x",
      "maxDuration": 60,
      "memory": 2048,
      "regions": ["hkg1", "sin1", "sfo1"]
    }
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "@api-url",
      "NEXT_PUBLIC_ENVIRONMENT": "@environment"
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=300, stale-while-revalidate=600"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, PUT, DELETE, OPTIONS"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/health",
      "destination": "/api/health"
    }
  ]
}
```

### 3.2 Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Starting InfiDao deployment..."

# 1. Check environment
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found"
    exit 1
fi

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm ci

# 3. Run tests
echo "🧪 Running tests..."
npm run test

# 4. Build application
echo "🔨 Building application..."
npm run build

# 5. Download models (if needed)
if [ ! -d "./models/bge-m3" ]; then
    echo "📥 Downloading embedding model..."
    npm run download-model
fi

# 6. Initialize database
echo "💾 Initializing database..."
npm run init-db

# 7. Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment completed successfully!"
echo "🌐 URL: https://infi-dao.vercel.app"
```

## 4. Alternative Deployment Options

### 4.1 Cloudflare Pages

```yaml
# wrangler.toml
name = "infi-dao"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
vars = { ENVIRONMENT = "production" }

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-id"

[env.production.d1_databases]
binding = "DB"
database_name = "infi-dao-db"
database_id = "your-d1-id"

[[env.production.r2_buckets]]
binding = "STORAGE"
bucket_name = "infi-dao-storage"
```

### 4.2 Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/infi_dao
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - ./data:/app/data

  db:
    image: supabase/postgres:15.1.0.88
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=infi_dao
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    depends_on:
      - app

volumes:
  db_data:
  redis_data:
```

### 4.3 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: infi-dao
  labels:
    app: infi-dao
spec:
  replicas: 3
  selector:
    matchLabels:
      app: infi-dao
  template:
    metadata:
      labels:
        app: infi-dao
    spec:
      containers:
      - name: infi-dao
        image: infi-dao:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: infi-dao-secrets
              key: database-url
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: infi-dao-secrets
              key: openai-api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: infi-dao-service
spec:
  selector:
    app: infi-dao
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: infi-dao-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - infi-dao.com
    secretName: infi-dao-tls
  rules:
  - host: infi-dao.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: infi-dao-service
            port:
              number: 80
```

## 5. CI/CD Pipeline

### 5.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Run linting
        run: npm run lint

      - name: Type check
        run: npm run type-check

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level=high

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    needs: [test, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}

      - name: Build Docker image
        run: |
          docker build -t infi-dao:${{ github.sha }} .
          docker tag infi-dao:${{ github.sha }} infi-dao:latest

      - name: Push to registry
        if: github.ref == 'refs/heads/main'
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push infi-dao:${{ github.sha }}
          docker push infi-dao:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'

      - name: Run smoke tests
        run: |
          sleep 30
          curl -f https://infi-dao.vercel.app/api/health || exit 1
          curl -f https://infi-dao.vercel.app || exit 1

      - name: Notify Slack
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        if: always()
```

### 5.2 Monitoring & Observability

```typescript
// lib/monitoring/otel.ts
import { trace, metrics } from '@opentelemetry/api';

const tracer = trace.getTracer('infi-dao');
const meter = metrics.getMeter('infi-dao');

// Create metrics
const requestCounter = meter.createCounter('api_requests_total');
const requestDuration = meter.createHistogram('api_request_duration');
const embeddingGeneration = meter.createCounter('embeddings_generated_total');

// Trace API calls
export function withTracing<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// lib/monitoring/prometheus.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  // Request metrics
  httpRequestsTotal: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
  }),

  httpRequestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5]
  }),

  // LLM metrics
  llmRequestsTotal: new Counter({
    name: 'llm_requests_total',
    help: 'Total number of LLM requests',
    labelNames: ['provider', 'model']
  }),

  llmTokensUsed: new Counter({
    name: 'llm_tokens_used_total',
    help: 'Total number of tokens used',
    labelNames: ['provider', 'model', 'type']
  }),

  // Database metrics
  dbConnectionsActive: new Gauge({
    name: 'db_connections_active',
    help: 'Number of active database connections'
  }),

  dbQueryDuration: new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1]
  })
};

register.registerMetric(metrics.httpRequestsTotal);
register.registerMetric(metrics.httpRequestDuration);
register.registerMetric(metrics.llmRequestsTotal);
register.registerMetric(metrics.llmTokensUsed);
register.registerMetric(metrics.dbConnectionsActive);
register.registerMetric(metrics.dbQueryDuration);
```

## 6. Scaling Strategy

### 6.1 Auto-scaling Configuration

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: infi-dao-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: infi-dao
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### 6.2 Database Scaling

```typescript
// lib/db/scaling.ts
export class DatabaseScalingManager {
  private metrics = {
    queryCount: 0,
    avgResponseTime: 0,
    connectionPoolSize: 10,
    cacheHitRate: 0
  };

  async checkScalingNeeds(): Promise<ScalingDecision> {
    const { queryCount, avgResponseTime, cacheHitRate } = this.metrics;

    // High query load + slow response = need scaling
    if (queryCount > 1000 && avgResponseTime > 500) {
      return {
        action: 'scale_up',
        reason: 'High query load and slow response times',
        targetConnections: Math.min(this.metrics.connectionPoolSize * 2, 100)
      };
    }

    // Low cache hit rate = need more cache
    if (cacheHitRate < 0.5) {
      return {
        action: 'increase_cache',
        reason: 'Low cache hit rate',
        targetCacheSize: '2x'
      };
    }

    // Consider migration to managed DB for large scale
    if (queryCount > 10000) {
      return {
        action: 'migrate',
        reason: 'Exceeded self-hosted capacity',
        target: 'supabase_pro'
      };
    }

    return { action: 'none' };
  }
}
```

## 7. Disaster Recovery

### 7.1 Backup Strategy

```bash
#!/bin/bash
# scripts/backup.sh

# 1. Backup LanceDB
echo "Backing up LanceDB..."
tar -czf "backup/lancedb-$(date +%Y%m%d-%H%M%S).tar.gz" ./data/lancedb

# 2. Backup to cloud storage
echo "Uploading to S3..."
aws s3 sync ./backup s3://infi-dao-backups/$(date +%Y)/$(date +%m)/

# 3. Backup database
echo "Backing up PostgreSQL..."
pg_dump $DATABASE_URL > backup/db-$(date +%Y%m%d-%H%M%S).sql

# 4. Cleanup old backups (keep 30 days)
echo "Cleaning up old backups..."
find ./backup -name "*.tar.gz" -mtime +30 -delete
find ./backup -name "*.sql" -mtime +30 -delete

echo "Backup completed!"
```

### 7.2 Recovery Procedure

```bash
#!/bin/bash
# scripts/recover.sh

BACKUP_DATE=$1

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: ./recover.sh YYYY-MM-DD"
    exit 1
fi

echo "Starting recovery from $BACKUP_DATE..."

# 1. Stop application
docker-compose down

# 2. Restore database
echo "Restoring database..."
psql $DATABASE_URL < backup/db-$BACKUP_DATE.sql

# 3. Restore LanceDB
echo "Restoring LanceDB..."
aws s3 sync s3://infi-dao-backups/$(date -d $BACKUP_DATE +%Y)/$(date -d $BACKUP_DATE +%m)/ ./backup/
tar -xzf backup/lancedb-$BACKUP_DATE-*.tar.gz

# 4. Start application
docker-compose up -d

echo "Recovery completed!"
```

This comprehensive deployment guide covers all aspects of deploying the InfiDao system from development to production, with multiple deployment options, CI/CD pipelines, monitoring, and disaster recovery procedures.