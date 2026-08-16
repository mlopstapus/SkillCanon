# Cloud Hosting Options for a Small Vanilla-Kubernetes Deployment

**Status:** Research — not yet decided (no infra provisioned, no PDR filed)
**Written:** 2026-08-15
**Related:** `docs/context/deployment.md` (the existing AWS/ECS SaaS topology decision — separate track, not superseded by this doc), `docs/context/third-party-services.md`, `charts/skillcanon/` (Helm chart, renamed from `charts/spechub/` and reworked from OpenShift-flavored to vanilla Kubernetes — see `charts/skillcanon/README.md` for what changed and its open assumptions before `helm install` is attempted against any of these targets)

## Why this doc exists

SkillCanon was previously run on OpenShift; the Helm chart is being reworked to plain Deployment/Service/Ingress (no Routes, no OpenShift-specific API objects) so it runs on **any** conformant Kubernetes cluster. That rework is only valuable if there's actually a portable, non-enterprise-priced place to run it — this doc surveys realistic small/demo-scale k8s hosting options for exactly that: one app pod (the unified Next.js image, `ghcr.io/mlopstapus/skillcanon`), Postgres either in-cluster (StatefulSet) or a managed add-on, ingress-nginx + cert-manager for TLS. Not evaluating enterprise/HA scale — that's a future revisit once there's real usage to justify it, same posture `deployment.md` already takes toward the AWS SaaS tier's Multi-AZ/HA triggers.

## Bottom line up front

**Primary recommendation: DigitalOcean DOKS.** Free control plane, official CNCF-conformant Kubernetes (no proprietary extensions to work around later), the fastest realistic zero-to-`helm install` path of any option surveyed, and by far the most prior art for "small Next.js + Postgres app on k8s" of anything here. Realistic all-in cost: **~$24–39/mo** (single 2 vCPU/4GB node, in-cluster Postgres to start; add DO's managed Postgres for +$15/mo once you want off DIY backups) plus ~$12/mo if you want a real cloud LoadBalancer rather than the free hostNetwork-ingress trick described below.

**Runner-up: k3s on a Hetzner Cloud VPS**, self-managed. Cheapest real option (~$5–10/mo all-in) and still genuinely vanilla/portable (k3s is CNCF-certified conformant — the same chart applies unmodified), but it makes you the control-plane operator: OS patching, k3s version upgrades, and your own etcd-equivalent backup story. Worth it if minimizing spend matters more than managed convenience; otherwise DOKS's $15–30/mo premium buys back a meaningful amount of operational risk.

**Notable third option:** Civo — its managed Kubernetes is *literally k3s under the hood*, so it's a genuine hybrid of the two above: managed convenience (free control plane, ~90-second cluster creation) at close to self-managed prices (~$5–12/mo nodes). Worth a look if DOKS ever feels like more than you need.

## Comparison table

| Option | Control plane | Cheapest usable node (~2 vCPU/4GB) | Managed Postgres add-on | LB for ingress-nginx | ghcr.io pull | Zero→`helm install` |
|---|---|---|---|---|---|---|
| **DigitalOcean DOKS** | Free (HA: +$40/mo) | ~$24/mo | ~$15/mo (1 vCPU/1GB) | ~$12/mo (or skip, see below) | Works out of the box | ~10 min |
| **Linode/Akamai LKE** | Free (HA: +$60/mo) | ~$24/mo | ~$15/mo | ~$10/mo (NodeBalancer) | Works out of the box | ~10 min |
| **Vultr VKE** | Free (HA: +$40–50/mo) | ~$20/mo (2 vCPU/4GB) | ~$15/mo | ~$10/mo | Works out of the box | ~10–15 min |
| **Civo** | Free | ~$10–12/mo | ~$10–20/mo | ~$10/mo per 10k req | Works out of the box | ~5 min (fastest cluster creation of any option) |
| **Oracle OKE (Always Free)** | Free | **$0** within Ampere A1 Always Free quota (now 2 OCPU/12GB total, cut from 4/24 in June 2026) | None free — run Postgres in-cluster inside the free quota | Free (flexible LB, 1 instance) | Works, but OCI networking/IAM setup is the most fiddly of any option here | ~45–90 min (console UX and VCN/IAM setup are the friction) |
| **Scaleway Kapsule** | Free (classic offer) | ~€8/mo (DEV1-S, 2 vCPU/2GB) | ~€15–20/mo | ~€8–10/mo | Works out of the box | ~15 min |
| **Hetzner + k3s** (self-managed) | N/A — you run it | ~€4.35–4.59/mo (CX22, 2 vCPU/4GB) | None — in-cluster or a second tiny VPS | $0 (hostNetwork or Hetzner LB ~€5.39/mo optional) | Works out of the box (see k3s-specific caveat below) | ~20–30 min (install k3s, then same helm steps) |
| **EKS / GKE / AKS** (scale-up path) | EKS $73/mo · GKE $73/mo (first cluster ~free via $74.40 credit) · AKS free | ~$30–70/mo (smallest usable managed-node-group instance) | RDS/Cloud SQL/Azure DB, $15–50+/mo | Built-in but requires its own controller (ALB/GCLB/AGIC) — noticeably more setup than ingress-nginx alone | Works out of the box | ~30–60 min (IAM/service-account wiring is the real time cost, especially EKS) |

Everything in this table assumes ingress-nginx + cert-manager (Let's Encrypt via HTTP-01 or DNS-01) — that combination works identically on every option except the big three, where it's still the simplest path but competes with a "should I just use the cloud-native ingress controller instead" temptation you don't need to give in to.

## (a) Managed control planes — the realistic small-scale field

All six of these are functionally interchangeable for this workload: free control plane, `kubectl`/Helm work exactly the same, and none of them impose a proprietary API surface the vanilla chart would need to special-case (this is the whole point of having moved off OpenShift Routes). The differences that actually matter at this scale:

- **DigitalOcean** and **Linode/Akamai** are the two most "boring" choices — mature docs, huge community footprint, predictable pricing, `doctl`/`linode-cli` are both pleasant. DO edges out Linode slightly for this project specifically because self-hosted SkillCanon's docs (`docs/context/deployment.md`, `third-party-services.md`) already lean on AWS-adjacent conventions the DO ecosystem mirrors more closely (S3-compatible Spaces, similarly-shaped managed Postgres), and DO's managed-Postgres pricing is marginally cheaper.
- **Vultr** is priced almost identically to DO/Linode and is a fine substitute if either of those is ever unavailable/undesirable — no strong reason to pick it over DOKS otherwise.
- **Civo** is the standout for pure speed (cluster ready in under two minutes) and is unusual in that its "managed Kubernetes" *is* k3s — so it inherits k3s's small footprint and fast boot while still being someone else's control plane to operate. Good pick if DOKS ever feels heavier than needed.
- **Oracle OKE** is the only genuinely **$0/mo compute** option in this list if you stay inside the Always Free Ampere A1 quota — but that quota was just cut in half (June 2026: 4 OCPU/24GB → 2 OCPU/12GB, existing over-quota tenancies had until August 18, 2026 to comply), and OCI's console/VCN/IAM setup is real friction compared to any other provider here. Reasonable if the target is literally zero dollars and you're willing to spend an extra half hour on setup; not the pick if you value your time over the marginal $24–39/mo DOKS costs.
- **Scaleway** is a fine EU-region option (useful if data residency in the EU matters) but has no particular edge over DO/Linode otherwise, and its docs/community are thinner.

## (b) Self-managed k3s/k0s on a cheap VPS

k3s (CNCF-certified, single binary, SQLite datastore for single-node) is the better pick over k0s here specifically *because* it bundles Traefik and a local-path provisioner by default, which for a single-node demo box means less to configure — though both are fine, conformant choices and the chart doesn't care which one is under it. **Hetzner Cloud's CX22** (2 vCPU/4GB, ~€4.35–4.59/mo) is the cheapest real compute anywhere in this survey — even DigitalOcean's equivalent droplet runs ~$24/mo, over 4x the price for the same shape. A single Hetzner VPS running k3s, with ingress-nginx set to `hostNetwork: true` (no cloud LoadBalancer needed — just point DNS straight at the VPS's public IP) and Postgres running in-cluster, gets you a fully working, genuinely portable k8s deployment for **under $10/mo total**.

The tradeoff is real, not cosmetic: you own OS security patching, k3s version upgrades (`k3s` itself, not just app-level updates), and backup/restore for the SQLite datastore and any in-cluster Postgres volume. None of that is hard at this scale, but it's ongoing ops surface that DOKS/LKE/etc. simply remove.

## (c) EKS / GKE / AKS — noted, not recommended at this stage

Included for completeness since they're the "default" answer many people reach for, but they're the wrong fit here: control-plane fees alone ($73/mo for EKS, effectively-free-for-one-cluster GKE, free AKS) plus pricier smallest-usable nodes push realistic monthly cost to **$100–150+** for a workload that needs none of what these platforms are actually good at (autoscaling fleets, multi-team RBAC, deep cloud-native integrations). GKE is the least painful of the three to stand up solo (its first-cluster credit + `gcloud` UX are both smoother than EKS's IAM/OIDC dance), so if a future scale-up ever justifies moving to one of the big three, start there rather than EKS. Not worth deeper comparison until there's an actual scale trigger — mirrors the posture `deployment.md` already takes toward RDS Multi-AZ and separate AWS accounts (defer until a real trigger, not before).

## ghcr.io image pulls — works out of the box, with one caveat

A **public** GHCR package (`ghcr.io/mlopstapus/skillcanon` — confirm the package visibility is set to Public in the repo's Package settings, not just the repo itself) pulls with no `imagePullSecret` on every option above; this is standard OCI registry behavior and matches how `docker-publish.yml` already publishes the image. The one documented wrinkle: **k3s specifically** has had reported cases where containerd's anonymous-token exchange with GHCR fails even for genuinely public images (k3s-io/k3s#2401) — inconsistent across k3s versions, not something every deployment hits. Cheap insurance for the Hetzner/k3s path: create a `read:packages`-scoped GitHub PAT and wire it as an `imagePullSecret` regardless of whether the anonymous pull works — two minutes of setup, and it sidesteps the whole class of "which k3s/containerd version am I on" uncertainty. Not needed on any of the fully-managed options (none of them showed this issue).

## Get-started outline (primary recommendation: DigitalOcean DOKS)

1. **Sign up** at digitalocean.com, add a payment method, generate a Personal Access Token (API → Tokens) and install `doctl` (`brew install doctl` on macOS), then `doctl auth init`.
2. **Create the cluster** (adjust region/size as needed — `s-2vcpu-4gb` is the comfortable floor for app + ingress-nginx + cert-manager on one node):
   ```
   doctl kubernetes cluster create skillcanon-demo \
     --region nyc1 \
     --node-pool "name=pool1;size=s-2vcpu-4gb;count=1"
   ```
   This also writes the kubeconfig and sets your local `kubectl` context automatically (equivalent to a manual `doctl kubernetes cluster kubeconfig save skillcanon-demo`).
3. **Install ingress-nginx:**
   ```
   helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
   helm install ingress-nginx ingress-nginx/ingress-nginx \
     -n ingress-nginx --create-namespace
   ```
   `kubectl get svc -n ingress-nginx` gives you the LoadBalancer's external IP (DO provisions a real cloud LB here, ~$12/mo) — point your domain's A record at it. To skip that $12/mo for a pure demo, redeploy the chart with `controller.hostNetwork=true` / `service.type=ClusterIP` and point DNS straight at the node's public IP instead (same trick as the Hetzner path above, works on DOKS too since it's just one node).
4. **Install cert-manager:**
   ```
   helm repo add jetstack https://charts.jetstack.io
   helm install cert-manager jetstack/cert-manager \
     -n cert-manager --create-namespace --set installCRDs=true
   ```
   Then apply a `ClusterIssuer` for Let's Encrypt (HTTP-01 is simplest once DNS is pointed at the ingress IP).
5. **Provision Postgres.** Fastest path for a first pass: run Postgres in-cluster (a plain StatefulSet + PVC, DO's block storage backs PVCs automatically) — zero extra cost, you own backups. Once that's proven out, swap in DO's Managed Postgres (`doctl databases create` or the console, ~$15/mo) and point `DATABASE_URL`/`MIGRATION_DATABASE_URL` at it instead — no app-code changes either way, matches the same env-var-driven credential pattern `docker-compose.yaml` already uses.
6. **`helm install charts/skillcanon`** (the chart's vanilla-k8s rework has landed, renamed from `charts/spechub`), pointing `app.image.repository` at `ghcr.io/mlopstapus/skillcanon` and `app.image.tag` at a real published tag from `docker-publish.yml` (only `latest`/`<git-sha>` exist today — no semver release pipeline yet). Verify the image pulls with no `imagePullSecret` configured; only add one if you hit a pull failure (see the ghcr.io section above — unlikely on DOKS specifically, containerd on DO's node image hasn't shown the k3s-specific issue).
7. **Run `pnpm db:migrate`** (or the chart's migration Job/hook, once defined) against the new cluster's Postgres before declaring it live — same "empty database, Drizzle owns schema creation" starting state `CLAUDE.md` already documents for local dev.
