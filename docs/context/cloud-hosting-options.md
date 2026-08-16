# Hosting Options for SkillCanon: Personal Self-Host Now, Cloud Multi-Tenant Later

**Status:** Research — not yet decided (no infra provisioned, no PDR filed)
**Written:** 2026-08-15
**Related:** `docs/context/deployment.md` (the existing AWS/ECS SaaS topology decision — separate track, describes a possible *future* multi-tenant path, not the current plan), `docs/context/third-party-services.md`, `charts/skillcanon/` (Helm chart, renamed from `charts/spechub` and reworked from OpenShift-flavored to vanilla Kubernetes — see `charts/skillcanon/README.md` for what changed and its open assumptions before `helm install` is attempted against any of these targets)

## Why this doc exists

The current, real need is much smaller than "deploy to the cloud": **Ben wants to self-host a personal instance of SkillCanon for his own single-tenant use**, most likely on a home NUC he already owns, running a single-node k3s cluster. No cloud spend, no multi-tenant concerns, no autoscaling — just getting `charts/skillcanon` (currently mid-rework from its old OpenShift-specific shape to plain vanilla Kubernetes) running reliably on hardware he already has, plus a sane way to reach it from outside his home network. That's the primary content of this doc now.

A multi-tenant, paid cloud SaaS offering is a **possible future direction only** — worth having researched once, in case this product gets real traction, but not something to act on now. That research is kept below, clearly separated, so it doesn't get lost, but the personal-NUC section is what to actually act on today.

**Chart portability is a separate concern from multi-tenancy, and it already exists today.** The k3s-specific values described below (`ingress.className: "traefik"`, `app.service.type: ClusterIP`, `database.storage.storageClassName: ""` picking up `local-path`) are just `values.yaml` defaults tuned for this homelab use case — nothing is hardcoded. The same chart can be pointed at EKS/GKE/AKS/any conformant cluster today by overriding those values (`ingressClassName`, `storageClassName`, external Postgres connection, resource requests/limits, replica count, `imagePullSecrets`), independent of whether this ever becomes a multi-tenant paid offering. Portability is a property of the chart now; multi-tenancy is a separate, later business decision covered in the "Future" section below.

## Bottom line up front

**Primary recommendation, right now: k3s on your own NUC**, reached from outside via **Cloudflare Tunnel**. Zero additional infrastructure cost (you already own the hardware) beyond a domain name if you want one. `charts/skillcanon`'s defaults are already shaped for exactly this case — `ingress.className: "traefik"` and `app.service.type: ClusterIP` both exist specifically because bare-metal/homelab k3s is the deployment target its author had in mind. Full walkthrough below.

**If this ever becomes a paid multi-tenant product:** see the "Future" section near the bottom — short version, DigitalOcean DOKS for realistic small-scale managed Kubernetes (~$24–39/mo), with k3s-on-Hetzner as a cheaper self-managed runner-up (~$5–10/mo). None of that is relevant to today's task; it's parked there for later.

## Primary recommendation: k3s on your own NUC

### Installing k3s

```
curl -sfL https://get.k3s.io | sh -
```

This installs k3s as a systemd service, single-node, with its embedded SQLite datastore (no external etcd needed — that's the k3s default for a lone control-plane node, and the right choice here). **Keep the two components k3s bundles by default** rather than swapping them for ingress-nginx/a separate CSI driver — neither substitution buys anything at single-node/personal scale, and both are already what `charts/skillcanon`'s own `values.yaml` defaults assume:

- **Traefik** as the ingress controller. `values.yaml`'s `ingress.className` already defaults to `"traefik"`, with a comment explaining why: "k3s ships Traefik as its built-in default ingress controller, the zero-extra-install path for a small single-node/homelab k3s cluster."
- **local-path-provisioner** for PVCs — the bundled dynamic StorageClass that backs the chart's Postgres StatefulSet PVC out of the box. `values.yaml`'s `database.storage.storageClassName` is left `""` (cluster default) specifically so it picks this up with no extra install.

The chart's `app.service.type` default (`ClusterIP`, not `LoadBalancer`) matches this setup too — `values.yaml`'s own comment: "bare-metal k3s (e.g. a home NUC with no MetalLB or cloud LB provisioner) leaves a LoadBalancer Service stuck Pending forever." ClusterIP + the Traefik Ingress in front of it is the only shape that actually resolves to something on a plain k3s install with no LB provisioner — no override needed.

### Getting a kubeconfig onto your workstation

k3s writes its kubeconfig to `/etc/rancher/k3s/k3s.yaml` (root-only) on the NUC. From your workstation:

```
scp nuc-user@nuc-hostname:/etc/rancher/k3s/k3s.yaml ~/.kube/skillcanon-nuc.yaml
```

Edit the `server:` line inside it — it defaults to `https://127.0.0.1:6443`, which only resolves correctly when run locally on the NUC itself — and point it at the NUC's real address instead:

- Its LAN IP/hostname (`https://192.168.x.x:6443`) if your workstation is always on the same home network.
- Its Tailscale IP/MagicDNS name (`https://nuc.your-tailnet.ts.net:6443`), if you set up Tailscale per the section below — the more robust choice, since it works identically whether you're home or away with no "am I on the LAN right now" branching.

Then either `export KUBECONFIG=~/.kube/skillcanon-nuc.yaml`, or merge it into your default `~/.kube/config` as its own context and `kubectl config use-context skillcanon-nuc`.

### `helm install charts/skillcanon`

Once the chart's vanilla-k8s rework lands, its defaults need no ingress/service-type overrides for this target:

```
helm install skillcanon charts/skillcanon \
  --set secrets.jwtSecret=$(openssl rand -base64 32) \
  --set secrets.appDbPassword=... \
  --set secrets.authDbPassword=... \
  --set secrets.postgresPassword=... \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=skillcanon.yourdomain.com \
  --set app.env.appBaseUrl=https://skillcanon.yourdomain.com
```

Two gaps already documented in `charts/skillcanon/README.md`'s "Open assumptions" section matter specifically for a real NUC install, not just local `helm template` validation:

1. **No Postgres image is published anywhere yet** — `database.image.repository` defaults to a placeholder (`ghcr.io/mlopstapus/skillcanon-database`) that doesn't exist in the registry. Simplest fix on a personal NUC: build `database/Dockerfile` locally and import it straight into k3s's own containerd, skipping a registry round-trip entirely:
   ```
   docker build -t skillcanon-database database/
   docker save skillcanon-database | sudo k3s ctr images import -
   ```
   then set `database.image.repository=skillcanon-database`, `database.image.pullPolicy=Never`. (Or push it to your own `ghcr.io` package first, if you'd rather pull it normally — either works.)
2. **The migration Job can't run against the published app image** (the root `Dockerfile`'s `output: "standalone"` runtime stage has no `drizzle-kit`/`drizzle/migrations`) — `migrationJob.enabled` defaults to `false` for exactly this reason. Run `pnpm db:migrate` by hand from a full source checkout, `MIGRATION_DATABASE_URL` pointed at the NUC (via a `kubectl port-forward` to the Postgres Service, or its LAN/Tailscale address) — the same self-host operator workflow `CLAUDE.md` already documents for `docker-compose.yaml`.

### ghcr.io image pulls on k3s

Public GHCR images pull with no `imagePullSecret` in general, but **k3s specifically** has had reported (version-dependent, not universal) cases where containerd's anonymous-token exchange with GHCR fails even for genuinely public images (k3s-io/k3s#2401). Cheap insurance: create a `read:packages`-scoped GitHub PAT and set `imagePullSecrets` in `values.yaml` regardless of whether the anonymous pull works on your particular k3s version — two minutes of setup that removes the uncertainty entirely.

## Reaching it from outside your home network

A NUC behind a home router almost certainly has no static public IP, and many residential ISPs now run CGNAT (carrier-grade NAT) — there may not even *be* a public IP to forward a port to, let alone a stable one. None of the cloud-managed "just get a LoadBalancer IP" story applies here. Three real options, in order of recommendation:

### Cloudflare Tunnel (`cloudflared`) — recommended default

Free, opens **zero** inbound ports on your router/firewall (the NUC makes an outbound-only connection to Cloudflare's edge — nothing to scan or port-forward into), and works even behind CGNAT since no inbound connection is ever needed. Rough shape:

1. `cloudflared tunnel login` + `cloudflared tunnel create skillcanon`, then `cloudflared tunnel route dns skillcanon skillcanon.yourdomain.com` (needs your domain's nameservers on Cloudflare — free tier is fine).
2. Run `cloudflared` as a Deployment inside the k3s cluster (official `cloudflare/cloudflared` image) with an `ingress` rule mapping `skillcanon.yourdomain.com` → the in-cluster Traefik Ingress/Service — no change to `charts/skillcanon` itself needed, `cloudflared` is just another workload reaching the existing Ingress from inside the cluster.
3. You still get a real domain and valid TLS in the browser with **zero open inbound ports**: Cloudflare terminates public TLS at their edge, and cert-manager's Cloudflare DNS-01 challenge (a `ClusterIssuer` using a scoped Cloudflare API token) can still issue a real Let's Encrypt cert *on the origin* for "Full (strict)" mode — DNS-01 only needs outbound access to Cloudflare's API to prove domain ownership, unlike HTTP-01 it never needs anything to reach back into your network.

### Tailscale (or Tailscale Funnel) — if you only want access from your own devices

If public internet access was never really the goal — just reaching the app from your own laptop/phone wherever you are — Tailscale is simpler and more private than a tunnel: install it on the NUC (or run it as a k8s subnet router), join your tailnet, and reach the app directly via its Tailscale IP/MagicDNS name from any device on that tailnet, no public exposure at all. **Tailscale Funnel** is the middle ground — it *can* expose a specific service to the public internet (Let's Encrypt TLS handled automatically through Tailscale), functionally similar to Cloudflare Tunnel but scoped to Tailscale's own infrastructure. Worth it only if you're already using Tailscale for other reasons; Cloudflare Tunnel is the more common/battle-tested choice if the goal is a real public domain.

### Port-forwarding + DDNS — works, not recommended

Forwarding a router port straight to the NUC plus a dynamic-DNS client (e.g. `ddclient`) to track your IP technically works with no third-party tunnel involved — but isn't recommended: it's direct inbound exposure of your home network with nothing absorbing scans/abuse first, your ISP may not even hand out a forwardable public IP if you're behind CGNAT, and a changed IP has a propagation lag DDNS never fully eliminates.

---

## Future: if this becomes a paid multi-tenant offering

Everything below is the original cloud-hosting survey, kept for when/if this product gets real traction and a multi-tenant paid tier becomes a real near-term plan — **not relevant to the current personal self-host task above.** Assumes the same "one app pod, Postgres in-cluster or managed add-on, ingress-nginx + cert-manager" small/demo-scale shape, just on someone else's infrastructure instead of the NUC.

### Bottom line, for this future scenario

**Primary recommendation: DigitalOcean DOKS.** Free control plane, official CNCF-conformant Kubernetes (no proprietary extensions to work around later), the fastest realistic zero-to-`helm install` path of any option surveyed, and by far the most prior art for "small Next.js + Postgres app on k8s" of anything here. Realistic all-in cost: **~$24–39/mo** (single 2 vCPU/4GB node, in-cluster Postgres to start; add DO's managed Postgres for +$15/mo once you want off DIY backups) plus ~$12/mo if you want a real cloud LoadBalancer rather than the free hostNetwork-ingress trick described below.

**Runner-up: k3s on a Hetzner Cloud VPS**, self-managed. Cheapest real option (~$5–10/mo all-in) and still genuinely vanilla/portable (k3s is CNCF-certified conformant — the same chart applies unmodified), but it makes you the control-plane operator: OS patching, k3s version upgrades, and your own etcd-equivalent backup story. Worth it if minimizing spend matters more than managed convenience; otherwise DOKS's $15–30/mo premium buys back a meaningful amount of operational risk.

**Notable third option:** Civo — its managed Kubernetes is *literally k3s under the hood*, so it's a genuine hybrid of the two above: managed convenience (free control plane, ~90-second cluster creation) at close to self-managed prices (~$5–12/mo nodes). Worth a look if DOKS ever feels like more than you need.

### Comparison table

| Option | Control plane | Cheapest usable node (~2 vCPU/4GB) | Managed Postgres add-on | LB for ingress-nginx | ghcr.io pull | Zero→`helm install` |
|---|---|---|---|---|---|---|
| **DigitalOcean DOKS** | Free (HA: +$40/mo) | ~$24/mo | ~$15/mo (1 vCPU/1GB) | ~$12/mo (or skip, see below) | Works out of the box | ~10 min |
| **Linode/Akamai LKE** | Free (HA: +$60/mo) | ~$24/mo | ~$15/mo | ~$10/mo (NodeBalancer) | Works out of the box | ~10 min |
| **Vultr VKE** | Free (HA: +$40–50/mo) | ~$20/mo (2 vCPU/4GB) | ~$15/mo | ~$10/mo | Works out of the box | ~10–15 min |
| **Civo** | Free | ~$10–12/mo | ~$10–20/mo | ~$10/mo per 10k req | Works out of the box | ~5 min (fastest cluster creation of any option) |
| **Oracle OKE (Always Free)** | Free | **$0** within Ampere A1 Always Free quota (now 2 OCPU/12GB total, cut from 4/24 in June 2026) | None free — run Postgres in-cluster inside the free quota | Free (flexible LB, 1 instance) | Works, but OCI networking/IAM setup is the most fiddly of any option here | ~45–90 min (console UX and VCN/IAM setup are the friction) |
| **Scaleway Kapsule** | Free (classic offer) | ~€8/mo (DEV1-S, 2 vCPU/2GB) | ~€15–20/mo | ~€8–10/mo | Works out of the box | ~15 min |
| **Hetzner + k3s** (self-managed) | N/A — you run it | ~€4.35–4.59/mo (CX22, 2 vCPU/4GB) | None — in-cluster or a second tiny VPS | $0 (hostNetwork or Hetzner LB ~€5.39/mo optional) | Works out of the box (same k3s/GHCR caveat as the NUC section above) | ~20–30 min (install k3s, then same helm steps) |
| **EKS / GKE / AKS** (scale-up path) | EKS $73/mo · GKE $73/mo (first cluster ~free via $74.40 credit) · AKS free | ~$30–70/mo (smallest usable managed-node-group instance) | RDS/Cloud SQL/Azure DB, $15–50+/mo | Built-in but requires its own controller (ALB/GCLB/AGIC) — noticeably more setup than ingress-nginx alone | Works out of the box | ~30–60 min (IAM/service-account wiring is the real time cost, especially EKS) |

Everything in this table assumes ingress-nginx + cert-manager (Let's Encrypt via HTTP-01 or DNS-01) — that combination works identically on every option except the big three, where it's still the simplest path but competes with a "should I just use the cloud-native ingress controller instead" temptation you don't need to give in to.

### (a) Managed control planes — the realistic small-scale field

All six of these are functionally interchangeable for this workload: free control plane, `kubectl`/Helm work exactly the same, and none of them impose a proprietary API surface the vanilla chart would need to special-case (this is the whole point of having moved off OpenShift Routes). The differences that actually matter at this scale:

- **DigitalOcean** and **Linode/Akamai** are the two most "boring" choices — mature docs, huge community footprint, predictable pricing, `doctl`/`linode-cli` are both pleasant. DO edges out Linode slightly for this project specifically because self-hosted SkillCanon's docs (`docs/context/deployment.md`, `third-party-services.md`) already lean on AWS-adjacent conventions the DO ecosystem mirrors more closely (S3-compatible Spaces, similarly-shaped managed Postgres), and DO's managed-Postgres pricing is marginally cheaper.
- **Vultr** is priced almost identically to DO/Linode and is a fine substitute if either of those is ever unavailable/undesirable — no strong reason to pick it over DOKS otherwise.
- **Civo** is the standout for pure speed (cluster ready in under two minutes) and is unusual in that its "managed Kubernetes" *is* k3s — so it inherits k3s's small footprint and fast boot while still being someone else's control plane to operate. Good pick if DOKS ever feels heavier than needed.
- **Oracle OKE** is the only genuinely **$0/mo compute** option in this list if you stay inside the Always Free Ampere A1 quota — but that quota was just cut in half (June 2026: 4 OCPU/24GB → 2 OCPU/12GB, existing over-quota tenancies had until August 18, 2026 to comply), and OCI's console/VCN/IAM setup is real friction compared to any other provider here. Reasonable if the target is literally zero dollars and you're willing to spend an extra half hour on setup; not the pick if you value your time over the marginal $24–39/mo DOKS costs.
- **Scaleway** is a fine EU-region option (useful if data residency in the EU matters) but has no particular edge over DO/Linode otherwise, and its docs/community are thinner.

### (b) Self-managed k3s/k0s on a cheap VPS

k3s (CNCF-certified, single binary, SQLite datastore for single-node) is the better pick over k0s here specifically *because* it bundles Traefik and a local-path provisioner by default, which for a single-node demo box means less to configure — though both are fine, conformant choices and the chart doesn't care which one is under it. **Hetzner Cloud's CX22** (2 vCPU/4GB, ~€4.35–4.59/mo) is the cheapest real compute anywhere in this survey — even DigitalOcean's equivalent droplet runs ~$24/mo, over 4x the price for the same shape. A single Hetzner VPS running k3s, with ingress-nginx set to `hostNetwork: true` (no cloud LoadBalancer needed — just point DNS straight at the VPS's public IP) and Postgres running in-cluster, gets you a fully working, genuinely portable k8s deployment for **under $10/mo total**.

The tradeoff is real, not cosmetic: you own OS security patching, k3s version upgrades (`k3s` itself, not just app-level updates), and backup/restore for the SQLite datastore and any in-cluster Postgres volume. None of that is hard at this scale, but it's ongoing ops surface that DOKS/LKE/etc. simply remove.

### (c) EKS / GKE / AKS — noted, not recommended at this stage

Included for completeness since they're the "default" answer many people reach for, but they're the wrong fit here: control-plane fees alone ($73/mo for EKS, effectively-free-for-one-cluster GKE, free AKS) plus pricier smallest-usable nodes push realistic monthly cost to **$100–150+** for a workload that needs none of what these platforms are actually good at (autoscaling fleets, multi-team RBAC, deep cloud-native integrations). GKE is the least painful of the three to stand up solo (its first-cluster credit + `gcloud` UX are both smoother than EKS's IAM/OIDC dance), so if a future scale-up ever justifies moving to one of the big three, start there rather than EKS. Not worth deeper comparison until there's an actual scale trigger — mirrors the posture `deployment.md` already takes toward RDS Multi-AZ and separate AWS accounts (defer until a real trigger, not before).

### Get-started outline (future primary: DigitalOcean DOKS)

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
6. **`helm install charts/skillcanon`**, pointing `app.image.repository` at `ghcr.io/mlopstapus/skillcanon` and `app.image.tag` at a real published tag from `docker-publish.yml` (only `latest`/`<git-sha>` exist today — no semver release pipeline yet). Verify the image pulls with no `imagePullSecret` configured; only add one if you hit a pull failure (see the ghcr.io section above — unlikely on DOKS specifically, containerd on DO's node image hasn't shown the k3s-specific issue).
7. **Run `pnpm db:migrate`** (or the chart's migration Job/hook, once the Dockerfile gap it depends on is closed) against the new cluster's Postgres before declaring it live — same "empty database, Drizzle owns schema creation" starting state `CLAUDE.md` already documents for local dev.
