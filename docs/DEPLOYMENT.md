# Deployment

Production topology for IntelliDocs. Everything in this file is the
`docker-compose.prod.yml` stack, not the lightweight `docker-compose.yml`
dev stack.

```
                    ┌──────────────┐
   clients ──TLS──▶ │    nginx     │  only exposed port (80/443)
                    │   :80/:443   │
                    └──┬────────┬──┘
          sticky hash   │        │  least-conn
                 ┌──────┘        └──────┐
          ┌──────▼──────┐          ┌──────▼──────┐
          │  server1    │          │  server2    │  Express, stateless
          │  :5000      │          │  :5000      │
          └──────┬──────┘          └──────┬──────┘
                 │                        │
        ┌────────┼────────────────────────┼────────┐
        ▼        ▼                        ▼        ▼
   ┌─────────┐ ┌─────┐  ┌─────────┐  ┌─────┐  ┌──────────┐
   │  redis  │ │ml1  │  │   ml2   │  │ml2  │  │ Supabase │
   │ primary │ │:8000│  │  :8000  │  │:8000│  │  (PgBouncer) │
   └────┬────┘ └─────┘  └─────────┘  └─────┘  └──────────┘
        │  replica + 3 sentinels
   ┌────▼────┐
   │ replica │
   └─────────┘
```

## Prerequisites

Manual steps. Nothing here can be automated from the repo.

| Step | Action |
|---|---|
| 1 | Build the frontend: `cd frontend && npm run build`. Compose mounts `frontend/dist` read-only, so a missing build means nginx serves nothing. |
| 2 | Provision a TLS certificate into `nginx/certs/fullchain.pem` and `nginx/certs/privkey.pem`. nginx will not start without both. |
| 3 | Set every variable in `server/.env` (see `.env.example`). Compose interpolates `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `FRONTEND_URL`. |
| 4 | Enable PgBouncer in the Supabase dashboard and use the pooled connection string for direct Postgres access. Supabase REST already goes through the pooler, so this only matters for analytics and DuckDB flushes. |
| 5 | Confirm DNS points at the host's port 443 and port 80 is reachable for the ACME/redirect flow. |

Validate before starting anything:

```bash
scripts/validate-prod-config.sh
```

## Start

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Startup is dependency-ordered: redis becomes healthy, then ML replicas, then
Express replicas, then nginx. Expect 2-3 minutes on the first run because each
ML replica deserializes its models before reporting healthy.

## Health semantics

The distinction matters operationally:

- `GET /health/live` — dependency-free. Answers in ~12ms. If this fails, the
  process is wedged and should be restarted.
- `GET /health/ready` — verifies Supabase, Redis, and ML. This is what
  container healthchecks and nginx use.
- `GET /health` — alias of `/live`, kept for `render.yaml` compatibility.

Readiness verdicts:

| Status | HTTP | Meaning |
|---|---|---|
| `ready` | 200 | all three dependencies reachable |
| `degraded` | 200 | ML is down; the replica still serves every non-ML route |
| `unavailable` | 503 | Supabase or Redis is down; nginx stops routing here |

ML is deliberately **optional**. Grammar, prediction, and compliance all degrade
explicitly rather than failing the request, so evicting a replica because the
ML service blipped would take down document editing for every user. Verified:
with ML down, readiness returns `200 degraded`.

## Scaling

Add replicas by declaring another service and listing it in the nginx upstream:

```yaml
server3:
  <<: *server-base
  expose: ["5000"]
```

```nginx
server server3:5000 max_fails=3 fail_timeout=30s;
```

The sticky key keeps one user's traffic on one replica, so adding capacity
without sticky routing would break editor autosave debounce coherence.

For a fleet larger than a few replicas, swap the hand-written list for Docker's
own DNS round-robin by pointing the upstream at the service name, or add an
external load balancer in front of nginx.

## Redis failover

Three sentinels monitor `mymaster` with a 2-vote quorum. The primary fails over
after 5s of unresponsiveness. The app reconnects on the next request, since
`getRedisClient()` retries with exponential backoff.

`REDIRECT` the surviving master and restart the replicas:

```bash
docker compose -f docker-compose.prod.yml exec redis-sentinel-1 \
  redis-cli -p 26379 SENTINEL GET-MASTER-ADDRS BYNAME mymaster
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| nginx exits at startup, "no host in upstream" | replica service is down | `docker compose ps`; check the healthcheck log |
| nginx 502 on all requests | both replicas `unavailable` | `curl localhost:5000/health/ready` on each replica |
| ML replicas never become healthy | models missing or slow load | check `start_period` is 90s; verify `ml/models` is populated |
| `502` on uploads over ~30s | proxy timeout too low | raise `proxy_send_timeout` in `nginx.conf` |
| Everything `degraded` | ML unreachable from Express | `ML_API_URL` must have no trailing slash; the bridge appends paths |
| Auth `429` under normal load | `auth_zone` is 10r/m | expected: it is deliberately strict against credential stuffing |

## Shutdown

```bash
docker compose -f docker-compose.prod.yml down
```

Add `-v` only if you intend to discard the Redis AOF volumes. The data holds
behavior buffers and auto-save dirty flags that feed the DuckDB training
pipeline, so dropping it loses unsynced user formatting history.
