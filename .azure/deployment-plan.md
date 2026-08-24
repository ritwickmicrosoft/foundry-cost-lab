# Foundry Cost Lab Deployment Plan

**Status:** Validated
**Mode:** New application
**Deployment tool:** Azure Developer CLI (`azd`) with Bicep

## Objective

Build and prepare a tenant-internal Azure AI cost modelling application with a React frontend, an Azure Functions API, auditable rate-card storage, and reproducible Azure infrastructure.

## Approved Scope

- React 18 and TypeScript frontend built with Vite
- Pure, independently tested cost model
- Per-user browser scenario persistence with in-memory fallback
- TypeScript Azure Functions API for rates, regional model catalogs, health, and daily synchronization
- Azure Blob Storage for current and historical rate-card and catalog snapshots
- Azure Static Web Apps Standard hosting
- Managed Entra authentication and named-user invitation roles
- Self-service authenticated access requests with costlab-admin approval and short-lived native SWA invitations
- Managed identity and least-privilege role assignments
- Azure Monitor action group and failed/missed morning-sync alerts
- Safe scenario export/import for colleague handoff
- Audit-ready client-side PDF export with JSON retained as an explicitly labelled editable backup/import format
- Installable PWA manifest, Microsoft-branded icons, secure asset-only service worker, and controlled update prompt
- `azd` and Bicep deployment artifacts

## Architecture

| Component | Technology | Azure target |
|---|---|---|
| Web client | React, TypeScript, Vite | Azure Static Web Apps Standard |
| Rates, catalog, health API | Azure Functions v4, TypeScript | Azure Functions Flex Consumption |
| Last-good snapshots | JSON documents | Azure Blob Storage |
| Scheduled sync | Timer-triggered function | Azure Functions |
| Identity | Static Web Apps managed authentication | Named AAD invitations with `costlab-user` |

## Deployment Parameters

- Azure subscription: `Ritwick - Demo` (`1d53bfb3-a84c-4eb4-8c79-f29dc8424b6a`), approved by the user on 2026-08-21
- Azure hosting location: East US 2, selected by the user on 2026-08-21. Calculator pricing regions are Canada Central, Canada East, East US, and East US 2.
- Named AAD users: Invited after deployment to the Static Web Apps `costlab-user` role
- Operations alert email: Optional; alert rules deploy without an email receiver when omitted

## Execution Plan

1. Scaffold and validate the TypeScript workspace.
2. Implement and test the pure cost domain.
3. Build and verify the modelling interface.
4. Implement and test rate persistence and synchronization.
5. Generate and validate `azd` and Bicep artifacts.
6. Mark this plan `Ready for Validation` and run the Azure validation workflow.

## Implementation Decisions

- The Azure Functions infrastructure will preserve the official TypeScript HTTP-trigger AZD/Bicep template as its base and compose the official timer-trigger pattern into it.
- Production storage access will use managed identity and scoped RBAC; local development may use `DefaultAzureCredential`.
- Enabled blocks with unavailable rates will make the result explicitly incomplete rather than inventing a numeric value.
- All estimates and exports use native CAD Azure retail prices. No USD-to-CAD conversion or hidden exchange-rate assumption is permitted.
- Model pricing is keyed by model ID and deployment SKU. Exact Retail meters take precedence; Marketplace, private-offer, and managed-compute fallbacks require a matching source- and date-stamped profile and never carry across SKUs.
- Pricing readiness exposes processing geography, required model dimensions, and independent agent-tool, RAG, observability, networking, and disaster-recovery coverage before an estimate can be treated as approval-ready.
- PWA installation reuses the existing Static Web Apps service. The worker precaches only versioned static assets and never caches HTML navigation, API, or authentication responses; managed Entra authorization remains mandatory at launch.
- Access requests reuse private Blob storage. Requester endpoints require `authenticated`, approval endpoints require `costlab-admin`, Functions repeat role checks, and the managed identity receives only Static Web App read plus create-invitation at the target site.
- PDF reports include known totals, unpriced decisions, formulas, assumptions, and rate provenance. PDF libraries are lazy-loaded and excluded from service-worker precache, adding no backend or Azure resource.
- Disaster recovery uses explicit secondary capacity per service. It does not combine with the legacy blanket secondary-region multiplier.
- All four rate cards are independently synced and stored under region-specific current/history paths. An unsynchronized region remains explicitly unpriced and never inherits another region's fallback values.
- Canada East has no availability zones. Its Standard Agent Setup file-storage estimate uses exact Hot LRS CAD meters and surfaces the resilience downgrade; Canada Central, East US, and East US 2 use exact Hot ZRS meters. Azure AI Search uses the exact regional S1 meter in each card.
- Standalone Content Safety uses an exact regional Standard text-record meter. Canada Central intentionally uses Canada East because the Retail API publishes no Canada Central Standard meter.
- Analytics Logs ingestion selects the paid tier beginning at 5 GB; the cost input is billable volume after the free allowance.
- Static Web Apps uses its managed Entra provider and built-in named-user invitations. Calculator routes require `costlab-user`; non-invited users fail closed without custom Graph permissions or stored Entra client secrets.
- Linux Flex Consumption does not support `WEBSITE_TIME_ZONE`. The timer runs hourly in UTC and accepts delayed invocation anywhere in the 06:00 `America/Toronto` hour, preserving DST behavior.
- A new deployment also runs one off-hour bootstrap synchronization while any required regional rate-card or catalog snapshot is absent. Once all eight current snapshots exist, off-hour ticks return to no-op behavior.
- All four regions execute independently. One regional failure cannot block successful rate or catalog promotion for the other regions; the invocation then fails in aggregate for alerting.
- The live model feed is the supported regional ARM inventory. It is merged in the UI with a visibly dated full-provider snapshot because the ARM feed does not return every managed-compute catalog family.
- The Function identity receives a custom subscription role containing only `Microsoft.CognitiveServices/locations/models/read` for daily catalog discovery.
- `/api/health` returns `503` when any regional rate or catalog snapshot is missing or older than 36 hours. Unsampled heartbeat traces drive failure and missed-run alerts.
- Subscription policy disables public Storage access. The Function therefore uses a delegated Flex subnet and a Blob private endpoint/private DNS zone; this adds Private Link and DNS charges.
- Static Web Apps and Functions keep public service endpoints. Storage public network access and shared-key access are disabled; the Function reaches Blob through the approved private endpoint by using its user-assigned managed identity.
- Flex Functions, storage, monitoring, and the Static Web Apps control plane deploy to East US 2. Calculator pricing and Foundry availability remain independent for all four configured regions.
- Infrastructure is composed from pinned Azure Verified Modules and the official TypeScript Flex Consumption template.

## Verification Evidence

- Web unit/property suite: 62 passing tests
- Functions/API suite: 31 passing tests
- Chromium application workflow suite: 14 passing tests across desktop and mobile
- Production PWA suite: 3 passing device profiles covering desktop, Android, and iPhone-sized metadata/layout
- Automated accessibility scan: zero detected violations
- Full cost-model recalculation: under 100 ms p95 acceptance test
- Web and Functions production builds: passing
- Web lint and workspace diagnostics: no errors
- Web and Functions dependency audits: zero known vulnerabilities
- Bicep template and monitoring module: compile with zero diagnostics
- Bicep parameters: compile with only environment name, location, and optional operations email

## All validation checks pass

- [x] 1. AZD Installation - `azd 1.28.0` available
- [x] 2. Schema Validation - stable `azure.yaml` schema passed
- [x] 3. Environment Setup - `prod` exists with the approved subscription, location, and operations receiver
- [x] 4. Authentication Check - authenticated as `ritwickdutta@microsoft.com`
- [x] 5. Subscription/Location Check - `Ritwick - Demo` and East US 2 confirmed; Bicep accepts the region
- [x] 6. Aspire Pre-Provisioning Checks - not applicable; no Aspire project
- [x] 7. Provision Preview - networking repair preview succeeded; VNet, Blob private endpoint, private DNS, and Function integration would be added
- [x] 8. Build Verification - web and Functions builds passed
- [x] 9. Docker Build Context Validation - not applicable; no Dockerfiles
- [x] 10. Package Validation - API and web packages completed successfully
- [x] 11. Azure Policy Validation - deny initiative affects unrelated VM/AKS/OpenAI PTU/Sentinel/SQL/HSM scenarios and classic resource types only; deployment preview passed
- [x] 12. Aspire Post-Provisioning Checks - not applicable; no Aspire project

## Release Blocker

No blocker remains for the current operator. Ritwick Dutta holds `costlab-user,costlab-admin` and verified the calculator in managed Microsoft Edge. Authenticated colleagues can now request access from the denial page and receive an owner-approved native invitation.

The Azure extension context is signed into a different tenant, so deployment and verification use the approved Azure CLI/azd context. Source is pushed to `ritwickmicrosoft/foundry-cost-lab` on `main`; GitHub deployment remains optional until its environment and OIDC settings are configured.

## Role Assignment Verification

- Status: Verified
- Identity checked: `id-foundry-cost-*` user-assigned managed identity
- Storage scope: generated storage account only
- Storage role: Storage Blob Data Owner, required for identity-based `AzureWebJobsStorage`, timer locks, deployment packages, and rate/catalog snapshot reads and writes
- Monitoring scope: generated Application Insights component only
- Monitoring role: Monitoring Metrics Publisher for Entra-authenticated telemetry ingestion
- Catalog scope: subscription, because `Microsoft.CognitiveServices/locations/models/read` is a subscription/location ARM operation
- Catalog role: custom role containing only `Microsoft.CognitiveServices/locations/models/read`
- Unneeded roles: no Queue, Table, Cosmos, or Service Bus bindings exist in the deployed calculator API
- Issues: none

## Production Deployment Evidence

- Deployment date: 2026-08-21
- Pricing-matrix update: deployed 2026-08-21 Toronto time (`2026-08-22` UTC) with model/SKU profiles and agent-tool, RAG, observability, networking, and service-specific DR blocks
- Four-region update: deployed `2026-08-23` UTC with independent Canada Central, Canada East, East US, and East US 2 pricing cards and Foundry catalogs
- Installable PWA update: deployed `2026-08-23` UTC with Microsoft-branded install icons, standalone manifest, native install/update controls, and an asset-only service worker; no Azure resource was added
- PDF export update: deployed `2026-08-23` UTC; the header now downloads a multipage audit report, while Backup JSON and Import JSON remain in Scenarios for editable handoff. Generation is browser-only and added no Azure resource or backend consumption
- Access request update: deployed `2026-08-24` UTC with authenticated self-service requests, private Blob queue, `costlab-admin` approvals, 24-hour native SWA invitations, direct-backend spoof protection, and invitation-only managed-identity RBAC
- Static Web Apps: `https://salmon-plant-01ce70c0f.7.azurestaticapps.net/` (`Ready`)
- Linked Functions API: `https://func-foundry-cost-rm6kp7ehyjzk.azurewebsites.net/` (`Running`)
- Anonymous root request: `302` to the Entra sign-in flow
- Anonymous `/.auth/me`: `200` with a null principal
- Managed AAD invitation: accepted for the current operator with `costlab-user`; calculator opened successfully in compliant Microsoft Edge
- Owner role: current operator holds `costlab-user,costlab-admin`; Ahmed completed the live request/approve/accept flow and verified `costlab-user` in `/.auth/me` before opening the app
- Access RBAC: custom role `Foundry Cost Lab Access Inviter` contains only `Microsoft.Web/staticSites/read` and `Microsoft.Web/staticSites/createinvitation/action`; deterministic assignment `e7c2d6ef-b2cf-5371-9bd0-0953f3ff7809` is scoped to the one production Static Web App and converged with Bicep
- Access incident resolution: the original custom flow first required admin consent, then exposed tenant error `530004` for the guest identity. Managed AAD invitations avoid both dependencies; the current operator accepted `costlab-user` and opened the calculator in compliant Microsoft Edge.
- Custom-auth cleanup: no Graph permissions, role-source Function, `AAD_CLIENT_ID`, or `AAD_CLIENT_SECRET` remain in the deployed application. The retained legacy app object has zero credentials and zero API permissions.
- Protected rate and catalog routes: `302` for anonymous callers
- Protected PWA routes: root, `manifest.webmanifest`, and `sw.js` return managed-Entra `302` redirects for anonymous callers; authenticated production behavior is covered by the exact production-preview bundle tests
- Anonymous `/api/health`: `200 healthy`
- Canada Central snapshot: refreshed `2026-08-23T04:26:08.382Z`; 59 exact meters matched, 20 definitions remain unmatched, and 167 models are region-confirmed
- Canada East snapshot: refreshed `2026-08-23T04:26:08.382Z`; 53 exact meters matched, 26 definitions remain unmatched, and 156 models are region-confirmed
- East US snapshot: refreshed `2026-08-23T04:26:08.382Z`; 59 exact meters matched, 20 definitions remain unmatched, and 168 models are region-confirmed
- East US 2 snapshot: refreshed `2026-08-23T04:26:08.382Z`; 58 exact meters matched, 21 definitions remain unmatched, and 203 models are region-confirmed
- Snapshot storage: reached through the approved Blob private endpoint; all eight current snapshots were initialized from the deployed Function
- Meter correction: Analytics Logs uses the paid tier beginning at 5 GB (East US CAD `$3.2408/GB`; East US 2 CAD `$3.889/GB`), and Content Safety uses exact regional Standard meters except for the documented Canada Central-to-Canada East fallback
- Controlled refresh: `FORCE_RATE_SYNC=true` was enabled only for one secured host-admin invocation, four-region `MORNING_SYNC_SUCCESS` completed in 33.1 seconds, and the setting was removed and verified absent
- Monitoring: both scheduled-query alerts are enabled and target the `Foundry Cost Lab operations` email receiver; Azure accepted a `logalertv2` action-group test notification, with inbox receipt pending human confirmation
- Static Web Apps deployment credential: the AZD npm step again hit `ECOMPROMISED`; its debug log was removed, the preinstalled SWA CLI deployed from `web/dist` with an environment-only credential, and the token was rotated after use
- Live RBAC: managed identity `82cef8db-5006-489e-830f-3d2b3331ef49` retains Storage Blob Data Owner, Monitoring Metrics Publisher, and the custom catalog-only subscription role at their intended scopes

## Section 7: Validation Proof

Validation refreshed: `2026-08-24 17:42:07 -04:00`.

| Check | Command or evidence | Result |
|---|---|---|
| AZD installation | `Get-Command azd` | Passed: 1.31.300.0 |
| Project schema | Azure MCP `validate_azure_yaml` | Passed against stable schema |
| Environment | `azd env get-values` (names/presence only) | Passed: approved subscription/location and operations settings configured |
| Authentication | `azd auth login --check-status` | Passed as `ritwickdutta@microsoft.com` |
| Subscription/location | User confirmation + Bicep compilation | Passed: `Ritwick - Demo`, East US 2 |
| Provision preview | `azd provision --preview --no-prompt` | Passed: existing resources only show provider-normalization drift; no changes applied and code-only deployment selected |
| Web verification | `npm --prefix web test`, `lint`, `build` | Passed: 62 tests, lint, production bundle |
| API verification | `npm --prefix api test`, `lint`, `build` | Passed: 31 tests, principal parsing, private request storage, invitation ARM client, workflow, handler authorization, strict typecheck, and production build |
| Browser verification | `npm --prefix web run test:e2e` | Passed: 14 Chromium workflows, requester/admin approval, PDF/JSON downloads, mobile install prompt, model/SKU isolation, technical-domain coverage, and zero Axe violations |
| PWA verification | `npm --prefix web run test:pwa` | Passed: manifest/icons, service-worker registration, desktop/Android/iPhone-sized layouts, static asset caching, and network-only navigation/API/auth |
| Regional grounding | Production synchronizers + Azure Retail Prices API + Foundry ARM inventory | Passed: independent Canada Central, Canada East, East US, and East US 2 cards; 59/53/59/58 exact meter specs and 167/156/168/203 regional models |
| Bicep | Azure Bicep MCP + `az bicep build-params` with process-scoped environment values | Passed: all modules and parameters compile with no diagnostics |
| Packaging | `azd package --no-prompt` | Passed for API and web |
| RBAC | Static review against API Blob, telemetry, and catalog operations | Passed; resource-scoped data roles and the catalog-only subscription role are documented above |
| Policy | Azure Policy MCP assignment review + provision preview | Passed: current managed-identity/private-Storage topology remains compliant; no policy conflict for this code-only update |
| Deployer role | `az role assignment list --include-inherited` | Passed: Owner at approved subscription scope |
| Dependency audit | `npm audit --audit-level=high` in web and API | Passed: zero reported vulnerabilities |

Access verification: Static Web Apps recorded the accepted AAD user with `costlab-user,anonymous,authenticated`; managed Edge loaded the calculator successfully.

Private networking cost approval: user approved approximately CAD `$11.00/month` baseline on 2026-08-21, plus CAD `$0.0141/GB` data processing and private DNS queries. `Microsoft.App` provider registration was completed for Flex subnet delegation.

## Constraints

- No fabricated rates; missing rates remain explicitly unpriced.
- The browser never calls Azure Retail Prices directly.
- Failed and zero-match syncs preserve the last-good card and surface staleness.
- No customer credentials or customer-identifying shared data are stored.
- Future Azure changes require the approved subscription and location to remain explicit.
- Only users who accept a named Static Web Apps invitation to `costlab-user` can access calculator routes.
- Microsoft Conditional Access policies still apply; invited Microsoft users may need a supported browser on a compliant managed device.
- Alert inbox receipt remains the only pending human-side operational confirmation.