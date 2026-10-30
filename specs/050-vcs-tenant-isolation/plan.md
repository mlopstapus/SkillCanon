# Plan
Tests only (`tenant-isolation.test.ts`, Testcontainers). Query audit result:
- Org-filtered: `findByOrgAndId`, `listActiveByOrg`, `findLiveRepoLink`, `listLiveRepoLinks`, `listPrChecksForLink`, `listLatestPrChecksForProject`, `countPrChecksByStatus`.
- Resolved-then-by-id (the id came from an org-filtered read or the stored link): `updateInstallation`, `markRepoLinkUnlinked`, `findPrCheck`, `upsertPrCheck` (writes the link's own org).
- Intentionally unfiltered, webhook role only (no session; the GitHub ids identify the tenant): `findByGithubInstallationId`, `listLiveLinksForGithubRepo`, `claimDelivery`. `completeInstall` also calls `findByGithubInstallationId` but under the app role, where RLS limits it to the caller's org (a duplicate id in another org surfaces as a unique violation, mapped to a clear error).
