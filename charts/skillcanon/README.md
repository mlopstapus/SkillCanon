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
  retargeted at the unified app image and `MIGRATION_DATABASE_URL`
  instead of the old Python image and `alembic upgrade head`. It's
  **disabled by default** — see "Open assumptions" below, this is the
  one piece that doesn't actually work yet against the published image.
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

## Open assumptions / questions

1. **The migration Job cannot succeed against the published app image
   today, so `migrationJob.enabled` defaults to `false`.** The root
   `Dockerfile`'s runtime stage (`output: "standalone"`) only copies
   `public/`, `.next/standalone`, and `.next/static` into the final
   image — no `drizzle-kit`, no `drizzle.config.ts`, no
   `drizzle/migrations/`, and no `pnpm`/`corepack` binary. Until the
   image gains a migration-capable stage (or a separate migration image
   is built), run `pnpm db:migrate` from a full source checkout against
   `MIGRATION_DATABASE_URL`, same as the documented self-host operator
   workflow. **Question for you:** do you want a small Dockerfile change
   (e.g. a `migrate` build target that keeps `node_modules`/
   `drizzle.config.ts`/`drizzle/migrations`) so this Job can actually
   run, or is "operator runs `pnpm db:migrate` by hand" an acceptable
   permanent story for self-hosted k8s installs?
2. **No Postgres image is published by CI.** `docker-publish.yml` only
   builds/pushes `ghcr.io/mlopstapus/skillcanon`; nothing publishes
   `database/Dockerfile` anywhere. `database.image.repository` defaults
   to a placeholder (`ghcr.io/mlopstapus/skillcanon-database`) that
   doesn't exist in the registry yet. Either build/push that image
   yourself (and maybe add it to `docker-publish.yml`), or set
   `database.enabled: false` and use `externalDatabase` for anything
   beyond local chart testing.
3. **No semver release tags exist yet.** `docker-publish.yml` only tags
   `latest` and `<git-sha>`. `app.image.tag` defaults to `"latest"`
   rather than `.Chart.AppVersion` (the old chart's convention) since no
   image tagged with this chart's `appVersion` will ever exist until a
   real release pipeline lands. Pin to a `<git-sha>` tag for anything
   beyond local/dev use.
4. **No dedicated health-check route exists** (`src/app/api` has none).
   `deployment.yaml`'s liveness/readiness probes use a plain `tcpSocket`
   check on the app port rather than an `httpGet`, since no path is safe
   to assume works unauthenticated. Switch to `httpGet` if/when a real
   health endpoint is added.
5. **Secrets default to empty placeholders**, matching `.env.example`'s
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
DB via an existing secret, the migration Job):

```sh
helm template charts/skillcanon \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set app.smtp.enabled=true \
  --set migrationJob.enabled=true

helm template charts/skillcanon \
  --set database.enabled=false \
  --set externalDatabase.existingSecret=my-managed-postgres-secret
```
