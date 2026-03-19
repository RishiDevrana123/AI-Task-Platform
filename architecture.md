# Architecture Document — AI Task Processing Platform

## System Architecture

```
                          ┌─────────────────────────────────────────────┐
                          │              KUBERNETES CLUSTER             │
                          │          (Namespace: ai-task-platform)      │
                          │                                             │
   ┌──────────┐           │  ┌───────────┐       ┌──────────────────┐  │
   │  Client   │ ──HTTPS──│─▶│  Ingress   │──────▶│ Frontend (Nginx) │  │
   │ (Browser) │          │  │  (Nginx)   │       │   React SPA      │  │
   └──────────┘           │  │            │       └──────────────────┘  │
                          │  │  / → FE    │                             │
                          │  │  /api → BE │       ┌──────────────────┐  │
                          │  │            │──────▶│ Backend (Express) │  │
                          │  └───────────┘       │   Node.js API     │  │
                          │                       │                    │  │
                          │                       │  ┌─────────────┐  │  │
                          │                       │  │ Auth (JWT)   │  │  │
                          │                       │  │ Rate Limit   │  │  │
                          │                       │  │ Helmet       │  │  │
                          │                       │  └─────────────┘  │  │
                          │                       └────────┬──────┬───┘  │
                          │                                │      │      │
                          │                      ┌─────────▼─┐  ┌▼────────────┐
                          │                      │   Redis    │  │  MongoDB    │
                          │                      │  (Queue)   │  │ (Database)  │
                          │                      └─────┬──────┘  └▲───────────┘
                          │                            │          │      │
                          │                      ┌─────▼──────────┤      │
                          │                      │  Worker Pool   │      │
                          │                      │  (Python x3)   │      │
                          │                      │  ┌──────────┐  │      │
                          │                      │  │ Worker 1  │  │      │
                          │                      │  │ Worker 2  │  │      │
                          │                      │  │ Worker 3  │  │      │
                          │                      │  └──────────┘  │      │
                          │                      └────────────────┘      │
                          └─────────────────────────────────────────────┘
```

## Task Processing Flow

```
User clicks "Run"
       │
       ▼
┌──────────────┐     ┌───────────┐     ┌────────────┐     ┌───────────┐
│ POST /tasks/ │────▶│ Set status│────▶│ LPUSH to   │────▶│  Return   │
│    :id/run   │     │ = pending │     │ Redis queue│     │  response │
└──────────────┘     └───────────┘     └────────────┘     └───────────┘
                                              │
                                              ▼
                                       ┌────────────┐
                                       │  Worker     │
                                       │  BLPOP      │
                                       └──────┬─────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Update MongoDB  │
                                     │ status=running  │
                                     └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Execute         │
                                     │ Operation       │
                                     │ (upper/lower/   │
                                     │  reverse/wc)    │
                                     └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Update MongoDB  │
                                     │ result + logs   │
                                     │ status=success  │
                                     └─────────────────┘
```

## Worker Scaling

### Horizontal Scaling

Workers are stateless queue consumers. Scaling is done by increasing the `replicas` field in the Kubernetes worker deployment:

```yaml
spec:
  replicas: 3   # Increase this number to scale
```

Each worker runs an independent BLPOP loop against Redis. Redis guarantees that each job is consumed by exactly one worker (BLPOP is atomic), so no job duplication occurs.

### Auto-Scaling

For production, add a Horizontal Pod Autoscaler (HPA) based on Redis queue length:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: redis_queue_length
        target:
          type: AverageValue
          averageValue: "10"
```

## Handling 100k Tasks/Day

### Throughput Analysis

- **100k tasks/day** = ~1.16 tasks/second average, ~5-10 tasks/second peak
- Each text operation completes in <10ms
- A single worker handles ~100 tasks/second
- **3 workers** provide ~300 tasks/second capacity (26M tasks/day theoretical)
- This gives **~25x headroom** over the 100k/day requirement

### Bottleneck Prevention

| Component | Strategy |
|-----------|----------|
| Redis     | Single-threaded but handles 100k+ ops/sec; add Redis Cluster if needed |
| MongoDB   | Indexed queries on `userId` + `status`; add replica set for read scaling |
| Workers   | Scale horizontally via K8s replicas; no shared state |
| Backend   | Stateless; scale replicas behind load balancer |

## MongoDB Indexing Strategy

```javascript
// Task model indexes
taskSchema.index({ userId: 1, status: 1 });    // Filter by user + status
taskSchema.index({ userId: 1, createdAt: -1 }); // User's tasks sorted by date
```

### Index Justification

| Index | Query Pattern | Benefit |
|-------|--------------|---------|
| `{ userId: 1, status: 1 }` | GET /tasks?status=pending | Filters user tasks by status efficiently |
| `{ userId: 1, createdAt: -1 }` | GET /tasks (sorted) | Returns recent tasks first without full-collection scan |
| `{ email: 1 }` (User model) | Login/register lookups | Unique constraint + fast lookup |

For 100k tasks/day, these indexes keep query times under 5ms even at millions of documents.

## Redis Failure Handling

### Connection Retry

Both backend and worker implement exponential backoff retry:

```
Attempt 1: wait 2s → Attempt 2: wait 4s → ... → Attempt 10: wait 30s (capped)
```

### Job Durability

- Redis is configured with **AOF persistence** (appendonly yes) in production
- If Redis crashes, pending queue items survive restart
- Workers automatically reconnect and resume consuming

### Dead Letter Queue (Production Enhancement)

```python
# If a task fails N times, move to dead-letter queue
if retry_count > MAX_RETRIES:
    redis.lpush("dead_letter_queue", job_data)
```

### Circuit Breaker Pattern

The backend catches Redis push failures and returns 503 to the client, preventing task creation when the queue is down.

## Staging vs Production Strategy

| Aspect | Staging | Production |
|--------|---------|------------|
| Namespace | `ai-task-platform-staging` | `ai-task-platform` |
| Replicas | 1 worker, 1 backend | 3+ workers, 2+ backend |
| MongoDB | Single instance, no auth | Replica set, auth + TLS |
| Redis | Single instance | Redis Sentinel or Cluster |
| Ingress | `staging.ai-tasks.example.com` | `ai-tasks.example.com` |
| TLS | Let's Encrypt (staging) | Let's Encrypt (prod) or custom CA |
| Secrets | Vault dev namespace | Vault prod namespace |
| ArgoCD | Manual sync | Auto-sync + self-heal |
| Monitoring | Basic (logs only) | Prometheus + Grafana + alerting |
| Resources | Minimal CPU/memory | Production-grade limits |

### Deployment Pipeline

```
main branch → CI lint + test → build images → push to registry
                                                    │
                    ┌───────────────────────────────┘
                    ▼
            Update infra repo image tags
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    staging (auto)      prod (manual approve)
```
