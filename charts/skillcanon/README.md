# charts/skillcanon

Helm chart for deploying SkillCanon to a plain, vanilla Kubernetes cluster
(EKS/GKE/AKS/DOKS/k3s/etc). Renamed from `charts/spechub` and fully
reworked to be K8s-native — see "What changed" below for the history.

## What changed vs the old `charts/spechub` shape

The chart previously modeled a split, OpenShift-specific deployment: two
separate apps (`frontend`, a Next.js 14 app; `backend`, a Python/FastAPI
service) each with their own Deployment/Service, plus two
`route.openshift.io/v1` `Route` objects for ingress. That whole shape
predates this repo's current architecture — the split backend/frontend
was fully ported into a single unified Next.js/TypeScript app (see
`CLAUDE.md`), and the old `legacy/backend/`/`legacy/frontend/` trees were
deleted 2026-08-12.

This rework:

- **One Deployment + one Service** (`templates/deployment.yaml`,
  `templates/service.yaml`) for the unified app, built from the repo
  root's `Dockerfile` and published as `ghcr.io/mlopstapus/skillcanon`.
  Deleted `frontend-deployment.yaml`/`frontend-service.yaml` and the
  now-redundant backend/frontend split.
- **One plain `networking.k8s.io/v1` Ingress** (`templates/ingress.yaml`)
  replacing both `backend-route.yaml` and `frontend-route.yaml`
  (deleted). Configurable `ingressClassName`/hosts/TLS, no
  OpenShift-specific API group anywhere in the chart.
- **Postgres stays a StatefulSet + Service**
  (`database-statefulset.yaml`/`database-service.yaml`), now built from
  this repo's actual `database/Dockerfile` image shape, with a
  `database.enabled` toggle to instead point at an external managed
  Postgres (`externalDatabase.*`) — see below for why that's a secret
  with three connection strings, not one.
- **The migration Job pattern is kept** (`templates/migration-job.yaml`),
  retargeted at a dedicated `migrator` image (built from a new
  root-`Dockerfile` stage) and `MIGRATION_DATABASE_URL`, instead of the
  old Python image and `alembic upgrade head`. Enabled by default — see
  "Resolved since the initial rework" below.
- **`values.yaml`/`secret.yaml`/`configmap.yaml`/`_helpers.tpl`** rewritten
  around the real env var set this app uses (`src/shared/config/index.ts`,
  `.env.example`), not the old Python backend's `DATABASE_URL`/
  `AUTH_TOKEN`/`ALLOWED_HOSTS`/`LOG_LEVEL`.
- No OpenShift-only resources remain anywhere in the chart (no `Route`,
  no `SecurityContextConstraints`, no `ImageStream`) — confirmed by
  grepping the rendered templates.

## Why the app needs three DB connection strings, not one

This app enforces Postgres Row-Level Security and connects with three
different least-privileged roles depending on the code path (see
`docs/context/database-conventions.md` and the RLS rollout notes in
`CLAUDE.md`):

- `skillcanon_app` (`DATABASE_URL`) — the ordinary, RLS-subject runtime
  role.
- `skillcanon_auth` (`AUTH_DATABASE_URL`) — a wider role used only for
  flows that run *before* any tenant/org context exists (login, session
  and API-key resolution, invitation acceptance, org/team/admin
  bootstrap).
- the schema-owning superuser/migration role (`MIGRATION_DATABASE_URL`) —
  used only by `pnpm db:migrate`/`db:generate`. This role is also what
  *creates* `skillcanon_app`/`skillcanon_auth` the first time migrations
  run against an empty database
  (`drizzle/migrations/0000_create_schemas.sql`).

A generic single `DATABASE_URL` (the pattern the task brief's "plain
connection-string secret" suggested for the external-Postgres case) would
silently break login and every other pre-tenant-context flow. So:

- **`database.enabled: true`** (default, bundled StatefulSet): the chart
  assembles all three connection strings from `secrets.appDbPassword` /
  `secrets.authDbPassword` / `secrets.postgresPassword` and renders them
  into its own Secret.
- **`database.enabled: false`** (external managed Postgres): either set
  `externalDatabase.host`/`port`/`database`/`migrationUser` +
  `secrets.*` and let the chart assemble the same three strings, or set
  `externalDatabase.existingSecret` to an operator-managed Secret name
  that already has `database-url`/`auth-database-url`/
  `migration-database-url` keys.

## Deployment target this chart's defaults assume

The near-term target is a single-tenant personal instance self-hosted on
your own hardware — likely a small k3s cluster on a home NUC — not a
cloud provider or a multi-tenant SaaS offering (that's a possible
*future* direction, not something to build for now). Two `values.yaml`
defaults reflect that, while the chart stays fully portable to a real
enterprise cluster (EKS/GKE/AKS) by overriding values — nothing
k3s/Traefik-specific is hardcoded into any template:

- `ingress.className` defaults to `"traefik"` — k3s ships Traefik as its
  built-in ingress controller, the zero-extra-install path for a homelab
  node. `templates/ingress.yaml` just passes `ingress.className`/
  `ingress.annotations`/`ingress.tls` straight through — swap in
  `alb`/`aws-load-balancer-controller` annotations, `nginx`, or anything
  else purely via values for an EKS/GKE/AKS deployment.
- `app.service.type` stays `ClusterIP` (with the Ingress in front) rather
  than `LoadBalancer` — bare-metal k3s has no cloud/MetalLB load-balancer
  provisioner, so a `LoadBalancer` Service would just hang `Pending`
  forever. Override to `LoadBalancer` on a cluster that actually
  provisions one.
- `database.storage.storageClassName` defaults to `""` (empty — uses
  whatever the cluster's default StorageClass is), **not** hardcoded to
  k3s's `local-path`. Set it to `gp3`/`ebs-csi`/`pd-ssd`/etc for a real
  cloud cluster's CSI driver.
- The external-managed-Postgres toggle (`database.enabled: false` +
  `externalDatabase.*`, for RDS/Cloud SQL/etc) is independent of both of
  the above and unaffected by them.
- `app.replicaCount`, `app.resources`, `database.resources`, and
  `imagePullSecrets` are all plain overridable values with modest
  single-node-friendly defaults (1 replica, sub-1-core/512Mi limits) —
  nothing hardcodes a single-node assumption into a template; bump
  `replicaCount`/resources via values for a multi-node enterprise cluster.

## Resolved since the initial rework

- **Migration Job.** The root `Dockerfile` now has a `migrator` build
  stage (after `build`, sibling to `runtime`) that keeps `node_modules`,
  `drizzle.config.ts`, `drizzle/migrations/`, `tsconfig.json`,
  `src/shared/db/`, and `src/bcs/` (drizzle-kit needs the latter to
  resolve `drizzle.config.ts`'s `./src/bcs/*/infrastructure/schema.ts`
  glob) on top of the `build` stage, with `CMD ["pnpm", "db:migrate"]`.
  Published as `ghcr.io/mlopstapus/skillcanon-migrator` by
  `.github/workflows/docker-publish.yml` alongside the app image, on its
  own independent tag (`migrationJob.image.*`, separate from
  `app.image.*`). `migrationJob.enabled` now defaults to `true`. Verified
  end-to-end locally: `docker build --target migrator` + `docker run`
  against a throwaway Postgres actually applies all migrations and
  creates the `skillcanon_app`/`skillcanon_auth` roles.
- **Postgres image.** `database.image` now defaults to plain
  `postgres:16-alpine` — `database/Dockerfile` today only adds an
  OpenShift-specific arbitrary-UID chown workaround on top of that same
  base image and has an empty `init/` (just `.gitkeep`), so there's
  nothing functionally load-bearing to build/publish yet. Still a plain
  overridable value (`database.image.repository`/`tag`) in case
  `database/Dockerfile` ever gains real init scripts worth publishing
  later.
- **Health check.** `src/app/api/health/route.ts` is a real, dependency-
  free liveness endpoint (no auth, no DB round-trip — `{"status":"ok"}`).
  `deployment.yaml`'s liveness/readiness probes now use `httpGet
  /api/health` instead of a bare `tcpSocket` check.

## Open assumptions / questions

1. **No semver release tags exist yet.** `docker-publish.yml` only tags
   `latest` and `<git-sha>` (for both the app and migrator images).
   `app.image.tag`/`migrationJob.image.tag` default to `"latest"` rather
   than `.Chart.AppVersion` (the old chart's convention) since no image
   tagged with this chart's `appVersion` will ever exist until a real
   release pipeline lands. Pin to a `<git-sha>` tag for anything beyond
   local/dev use.
2. **Secrets default to empty placeholders**, matching `.env.example`'s
   `REPLACE_ME` convention, not filled dev defaults — `helm lint`/`helm
   template` succeed with the bare defaults, but the app itself refuses
   to start with an empty/placeholder `JWT_SECRET`
   (`src/shared/config/index.ts`). Supply real values (`--set
   secrets.jwtSecret=...` or a values file) before actually installing.

## Validating locally (no cluster needed)

```sh
helm lint charts/skillcanon
helm template charts/skillcanon
```

To exercise the optional toggles (ingress, SMTP, GitHub token, external
DB via an existing secret):

```sh
helm template charts/skillcanon \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set app.smtp.enabled=true

helm template charts/skillcanon \
  --set database.enabled=false \
  --set externalDatabase.existingSecret=my-managed-postgres-secret
```
