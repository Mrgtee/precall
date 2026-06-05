# Railway Worker Deployment

Precall uses Vercel for the public web app and Railway for private worker execution. Railway should hold the private keys and run scheduled jobs for market scans, Circle Gateway/x402 paid evidence, Arc publishing, expiry, and resolution.

## Target Split

- Vercel: public Next.js app, wallet UI, admin UI, read-only demo pages, and optional proxy calls to Railway.
- Railway: private worker service, cron jobs, model API key, Arc RPC, Arc publisher/resolver keys, Circle Gateway/x402 buyer key, and all paid evidence execution.

When Railway owns worker execution, set `DISABLE_SCHEDULED_WORKERS=true` on Vercel. Vercel does not need `AGENT_OWNER_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY`, `CIRCLE_AGENT_PRIVATE_KEY`, or tokenized private worker RPC credentials.

## Create The Railway Service From GitHub

1. Push the latest `main` branch to GitHub.
2. In Railway, create a new project from the GitHub repo `Mrgtee/precall`.
3. Choose the root directory as the project root.
4. Add a persistent HTTP worker service named `precall-worker-http`.
5. Railway can use the committed `railway.json`, or you can manually enter the worker-only build and start commands below.
6. Add the required environment variables from the sections below.
7. Deploy the service and copy its public Railway URL.
8. Add that URL to Vercel as `WORKER_TRIGGER_URL`.

## Build Command

Railway can install dependencies automatically. Use this build command for worker-only deploys:

```bash
npm -w @precall/shared run build && npm -w @precall/worker run build
```

If you use a custom install command, use:

```bash
npm install
```

## Start Commands

Persistent Railway HTTP trigger service:

```bash
npm run worker:serve
```

Manual one-shot commands:

```bash
npm run worker:health
npm run worker:run-once
npm run worker:sports
npm run worker:expire
npm run worker:resolve
npm run worker:x402:supports -- "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search?query=bitcoin&queryType=Top"
npm run worker:gateway:balance -- arcTestnet
npm run worker:gateway:balance -- base
npm run worker:gateway:deposit -- base 1
```

The CLI commands close DB connections after completion and exit cleanly. Discovery now fetches deeper market pools, computes CLOB best bid/ask spread, and skips ultra-extreme prices before spending x402/model calls so the worker has a better chance of finding publishable signals without lowering quality gates. The HTTP trigger server closes DB connections after every request and during SIGTERM/SIGINT shutdown.

## Required Railway Env Vars

Railway should hold these private worker values:

```env
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
MODEL_TIMEOUT_MS=45000
MODEL_RETRY_COUNT=2

ARC_TESTNET_RPC_URL=
PRECALL_REGISTRY_ADDRESS=
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
PROTOCOL_TREASURY_ADDRESS=
AGENT_OWNER_PRIVATE_KEY=
AGENT_OWNER_WALLET=
RESOLVER_PRIVATE_KEY=
DEFAULT_ONCHAIN_AGENT_ID=
PUBLISH_ONCHAIN=true
RESOLVE_ONCHAIN=true

ENABLE_CIRCLE_GATEWAY_X402=true
REQUIRE_CIRCLE_GATEWAY_X402=false
# Production paid evidence on Base Mainnet. This spends real USDC.
CIRCLE_GATEWAY_CHAIN=base
X402_ACCEPTED_NETWORKS=eip155:8453
X402_FACILITATOR_URL=https://gateway-api.circle.com
CIRCLE_AGENT_PRIVATE_KEY=
CIRCLE_X402_MAX_PAYMENT_USDC=0.025
CIRCLE_X402_DAILY_BUDGET_USDC=0.10
CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one
ENABLE_X402_FALLBACK_PROVIDERS=true
ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE=true
CIRCLE_X402_SELLER_ADDRESS=0x...
INTERNAL_GATEWAY_X402_EVIDENCE_PRICE_USDC=0.001
ENABLE_EXTERNAL_X402_FALLBACK_PROVIDERS=false
# Optional external generic x402 fallback, not required for Gateway proof:
# CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one,stableenrich.dev
# STABLE_ENRICH_X402_REDDIT_SEARCH_ENDPOINT=https://stableenrich.dev/api/reddit/search
CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC=0.25
CIRCLE_GATEWAY_MAX_DEPOSIT_USDC=10
# Demo/hackathon alternative:
# CIRCLE_GATEWAY_CHAIN=arcTestnet
# X402_ACCEPTED_NETWORKS=eip155:5042002
# X402_FACILITATOR_URL=https://gateway-api-testnet.circle.com
# CIRCLE_GATEWAY_RPC_URL=

MIN_LIQUIDITY_USD=10000
MIN_EDGE_BPS=650
MAX_SPREAD_BPS=900
MIN_CONFIDENCE_BPS=5200
MIN_SUGGESTED_SIZE_BPS=100
DISCOVERY_MARKET_LIMIT=150
MAX_ANALYZED_MARKETS_PER_RUN=8
MIN_ANALYSIS_PRICE_BPS=100
MAX_ANALYSIS_PRICE_BPS=9900
BOND_AMOUNT_USDC=1
UNLOCK_PRICE_USDC=0.05
SPORTS_UNLOCK_PRICE_USDC=0.05
SPORTS_UNLOCK_RECEIVER_ADDRESS=0xYourTreasuryOrReceiver
NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS=0xYourTreasuryOrReceiver
ALLOW_PUBLISH_FILTERED_RUN=false

ENABLE_SPORTS_EDGE=true
SPORTS_DISCOVERY_MARKET_LIMIT=350
SPORTS_DAILY_TARGET=8
MAX_SPORTS_ANALYZED_PER_RUN=24
SPORTS_LOOKAHEAD_HOURS=72
SPORTS_MIN_START_LEAD_MINUTES=30
SPORTS_EVENT_EXPIRY_GRACE_MINUTES=360
SPORTS_MIN_LIQUIDITY_USD=25000
SPORTS_MAX_SPREAD_BPS=500
SPORTS_MIN_EDGE_BPS=300
SPORTS_MIN_CONFIDENCE_BPS=5000
SPORTS_MIN_PRICE_BPS=1000
SPORTS_MAX_PRICE_BPS=9000

WORKER_TRIGGER_SECRET=generate-a-long-random-secret
PORT=8080
```

`CIRCLE_AGENT_PRIVATE_KEY` is separate from `AGENT_OWNER_PRIVATE_KEY`. The Circle key is the Gateway/x402 buyer key for paid API evidence. The Arc owner key publishes bonded calls.

## Required Vercel Env Vars For Railway Mode

Keep public/web values on Vercel. Private worker secrets have been removed from Vercel; Vercel should only proxy signed admin requests to Railway:

```env
DATABASE_URL=
NEXT_PUBLIC_APP_URL=https://precall-flax.vercel.app
NEXT_PUBLIC_ADMIN_WALLETS=0xYourAdminWallet
ADMIN_SECRET=
CRON_SECRET=
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS=
NEXT_PUBLIC_ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
PRECALL_REGISTRY_ADDRESS=
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
DISABLE_SCHEDULED_WORKERS=true
WORKER_TRIGGER_URL=https://your-railway-worker-url.up.railway.app
WORKER_TRIGGER_SECRET=same-value-as-railway
WORKER_ROUTE_TIMEOUT_MS=295000
WORKER_ASYNC_COMMANDS=run-once,sports,resolve
```

Do not set these on Vercel in Railway mode unless you intentionally want Vercel to execute private worker code locally:

```env
AGENT_OWNER_PRIVATE_KEY=
RESOLVER_PRIVATE_KEY=
CIRCLE_AGENT_PRIVATE_KEY=
ARC_TESTNET_RPC_URL=
OPENAI_API_KEY=
```

Vercel admin actions will call Railway through `WORKER_TRIGGER_URL` when both trigger env vars are configured. Vercel cron routes return a safe disabled result when `DISABLE_SCHEDULED_WORKERS=true`, so Railway cron should be the only scheduled executor. If trigger env vars are missing and `DISABLE_SCHEDULED_WORKERS=true`, Vercel returns a safe disabled result instead of trying to run private workers.


## Admin Access

The public header hides the Admin link until a connected wallet is confirmed as whitelisted. Admin membership has two layers:

- Bootstrap admins from `NEXT_PUBLIC_ADMIN_WALLETS` / `ADMIN_WALLETS`.
- Database overrides in `admin_wallets`, managed from the Admin page with signed wallet actions.

A whitelisted admin can add or dewhitelist other admin wallets from `/admin`. The current signing wallet cannot dewhitelist itself, and the app refuses to remove the last active admin. Env-configured wallets can be disabled by adding a disabled database override row through the Admin page.

## Protected Worker Trigger Endpoints

The Railway HTTP worker exposes:

```text
POST /worker/health
POST /worker/run-once
POST /worker/sports
POST /worker/expire
POST /worker/resolve
GET /worker/jobs/:id
```

Every request must include one of:

```text
Authorization: Bearer $WORKER_TRIGGER_SECRET
x-worker-trigger-secret: $WORKER_TRIGGER_SECRET
```

Manual test examples:

```bash
curl -sS -X POST "$WORKER_TRIGGER_URL/worker/health" \
  -H "Authorization: Bearer $WORKER_TRIGGER_SECRET"

curl -sS -X POST "$WORKER_TRIGGER_URL/worker/run-once?mode=async" \
  -H "Authorization: Bearer $WORKER_TRIGGER_SECRET" \
  -H "x-worker-async: true"

curl -sS -X POST "$WORKER_TRIGGER_URL/worker/sports?mode=async" \
  -H "Authorization: Bearer $WORKER_TRIGGER_SECRET" \
  -H "x-worker-async: true"

curl -sS -X POST "$WORKER_TRIGGER_URL/worker/expire" \
  -H "Authorization: Bearer $WORKER_TRIGGER_SECRET"

curl -sS -X POST "$WORKER_TRIGGER_URL/worker/resolve" \
  -H "Authorization: Bearer $WORKER_TRIGGER_SECRET"
```

## Recommended Railway Cron Setup

Health is manual only. Use it from the dashboard or curl when debugging.

Create four Railway cron services from the same GitHub repo:

| Job | Schedule | Command | Notes |
| --- | --- | --- | --- |
| Agent run | `0 */3 * * *` | `npm run worker:run-once` | Scans strict YES/NO markets, optionally pays x402 evidence, and publishes only quality-passing bonded calls. |
| Sports Live Calls | `15 */3 * * *` | `npm run worker:sports` | Scans daily sports markets, optionally pays x402 evidence, and stores analyzed valid markets as strong, lean, high-risk, or avoid non-bonded calls. |
| Expire calls | `0 * * * *` | `npm run worker:expire` | Marks matured published calls as awaiting resolution. |
| Resolve calls | `30 */3 * * *` | `npm run worker:resolve` | Runs expiry first, then resolves supported YES/NO markets and updates reputation. |

The cron jobs can share the same Railway variables as the HTTP worker service. If Railway lets you duplicate a service, duplicate `precall-worker-http`, replace the start command with the cron command, then attach the schedule.

## Gateway Funding Commands

Gateway health can succeed while `gatewayAvailableUsdc` is `0`. That means the buyer wallet is configured, but USDC has not yet been deposited into the Circle Gateway Wallet for gasless x402 payments.

Run these commands from Railway shell, a Railway one-off command, or locally with the same Railway env vars loaded. They never print the private key:

```bash
npm run worker:x402:supports -- "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search?query=bitcoin&queryType=Top"
npm run worker:gateway:balance -- arcTestnet
npm run worker:gateway:balance -- base
npm run worker:gateway:deposit -- base 1
npm run worker:gateway:balance -- base
```

Safety notes:

- `CIRCLE_AGENT_PRIVATE_KEY` must control a wallet that already has USDC on the configured Gateway chain. For production paid evidence, use Base Mainnet with `CIRCLE_GATEWAY_CHAIN=base`, `X402_ACCEPTED_NETWORKS=eip155:8453`, and `X402_FACILITATOR_URL=https://gateway-api.circle.com`.
- `ENABLE_CIRCLE_GATEWAY_X402=true` must be set, otherwise deposit returns a disabled result and moves no funds.
- `CIRCLE_GATEWAY_MAX_DEPOSIT_USDC` defaults to `10`; deposits above that cap are blocked before any transaction.
- The deposit command uses the Circle Gateway SDK `deposit()` method, which approves the Gateway Wallet if needed, then deposits the requested USDC.
- The JSON result includes public wallet address, before/after wallet and Gateway balances, and approval/deposit transaction hashes. It does not include or log the private key.

## How To Confirm x402 Evidence Was Paid And Stored

1. Confirm Railway has:

```env
ENABLE_CIRCLE_GATEWAY_X402=true
REQUIRE_CIRCLE_GATEWAY_X402=false
CIRCLE_AGENT_PRIVATE_KEY=0x...
CIRCLE_GATEWAY_CHAIN=base
X402_ACCEPTED_NETWORKS=eip155:8453
X402_FACILITATOR_URL=https://gateway-api.circle.com
CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one
CIRCLE_X402_MAX_PAYMENT_USDC=0.025
CIRCLE_X402_DAILY_BUDGET_USDC=0.10
CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC=0.25
ENABLE_X402_FALLBACK_PROVIDERS=true
ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE=true
CIRCLE_X402_SELLER_ADDRESS=0x...
INTERNAL_GATEWAY_X402_EVIDENCE_PRICE_USDC=0.001
ENABLE_EXTERNAL_X402_FALLBACK_PROVIDERS=false
```

2. Run:

```bash
npm run worker:health
npm run worker:run-once
```

3. Check `/admin` or `/demo` on Vercel. The Circle Agent Stack panel should show Gateway/x402 enabled, x402 payment network, Gateway balance, daily x402 spend, latest x402 payment or latest x402 error, Arc bond volume, and thesis unlock volume.

4. Inspect a published call page. Paid evidence rows show the `x402-paid evidence` badge, provider, payment amount, payment network, and payment reference when a paid evidence call succeeded.

5. Query the database if needed:

```sql
select action_type, provider, amount_usdc, status, payment_ref, related_market_id, related_agent_run_id, error, created_at
from circle_actions
where action_type = 'x402_api_payment'
order by created_at desc
limit 10;

select evidence_id, source_type, provider, paid, payment_amount_usdc, payment_network, payment_ref, fetched_at
from evidence_items
where paid = true
order by fetched_at desc
limit 10;
```

With `REQUIRE_CIRCLE_GATEWAY_X402=false`, admin-triggered `run-once` records paid-evidence failures and may continue with free Polymarket evidence if the market still passes normal quality gates. It does not fake paid evidence. After `worker:x402:supports -- <provider-url>` returns a supported chain and that chain has Gateway balance, you can deliberately switch required mode on to refuse free-only publishing for candidates.


## Final Railway Deployment Checklist

1. Push this commit to GitHub.
2. Create the Railway service from GitHub and let it use `railway.json`, or manually set the build/start commands above.
3. Add all Railway env vars, especially `ENABLE_CIRCLE_GATEWAY_X402=true`, `REQUIRE_CIRCLE_GATEWAY_X402=false`, `ENABLE_SPORTS_EDGE=true`, `CIRCLE_AGENT_PRIVATE_KEY`, `AGENT_OWNER_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY`, and `WORKER_TRIGGER_SECRET`.
4. Deploy the Railway HTTP worker and open `/healthz`.
5. Copy the Railway URL into Vercel as `WORKER_TRIGGER_URL`.
6. Add the same `WORKER_TRIGGER_SECRET` to Vercel.
7. Redeploy Vercel after adding the trigger variables.
8. From `/admin`, connect a whitelisted wallet and run `Check worker health`; the output should say `proxiedToRailway: true`.
9. Run `Run agent now`; with required x402 enabled, candidates only proceed if the paid evidence API succeeds.

## Known Limitations

- Railway owns worker secrets, but Vercel still needs `DATABASE_URL` to render public pages and admin/demo data.
- `WORKER_TRIGGER_SECRET` is a powerful server-to-server secret. Rotate it if exposed.
- Gateway/x402 requires funded Gateway balance and a seller endpoint that actually supports x402. Public Polymarket APIs remain free and are never treated as paid.
- `run-once` may publish no calls when markets fail strict YES/NO eligibility or quality gates. That is expected and healthier than forcing weak calls.
- The admin proxy starts `run-once`, `sports`, and `resolve` as async Railway jobs by default because they can take 10-30 minutes. The Railway service prevents duplicate concurrent jobs for the same command in one worker process.
- The current worker trigger is command-based, not a durable queue. Avoid running multiple `run-once` jobs concurrently across separate Railway one-off commands.
