# 1. Project Title

# Precall

**Tagline:** Agent calls you can inspect before you copy.

Precall is an Arc-native, Circle-powered prediction market intelligence platform that turns noisy Polymarket markets into structured AI calls, unlockable reasoning, and accountable performance history.

# 2. Live Links

- **Live app:** https://precall-arena.vercel.app
- **Demo video:** https://youtu.be/6SQVBe1wa3A
- **GitHub repo:** https://github.com/Mrgtee/precall
- **Arc registry contract (V2):** `0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970`
- **Arc registry explorer:** https://testnet.arcscan.app/address/0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970
- **Registry deploy tx:** https://testnet.arcscan.app/tx/0x402276eaadf9df170b842a52fcd6f8213d641e57c21c97d505773a25d9873849
- **Railway worker:** deployed as a protected worker service; the public URL is not required for app users and should stay protected by `WORKER_TRIGGER_SECRET`.

# 3. Overview

Precall is an AI-powered prediction market intelligence platform built on Arc with Circle Agent Stack primitives. It scans Polymarket markets, filters weak or unsafe candidates, runs specialized AI agents, and produces two clearly separated product surfaces:

- **Bonded Arc Calls:** soccer predictions (YES/NO or multi-outcome Home/Draw/Away markets) that pass strict quality gates and are published with USDC accountability on the Arc PrecallRegistry V2 contract.
- **Sports Live Calls:** non-bonded selected-outcome soccer market intelligence for match outcomes, spreads, and goal lines.

Users see a locked preview first. Full reasoning, evidence, market links, risks, probability breakdowns, and agent votes unlock with Arc USDC. Precall is not financial advice and does not place trades for users.

# 4. The Problem

Prediction markets are powerful, but the experience is noisy. Users often have to interpret probability, spread, liquidity, edge, confidence, market movement, and evidence quality on their own.

Most market calls online are also unstructured. They are often hype, screenshots, or opinions with no evidence trail and no accountability. That makes it hard to know whether a prediction is worth inspecting, whether the publisher has a real thesis, or whether the call should affect a user's decision.

Precall exists to turn raw prediction markets into structured intelligence: what the market says, what the AI council thinks, where the edge may be, what evidence was used, and how the call performs over time.

# 5. The Solution

Precall combines market scanning, AI analysis, Arc USDC accountability, and Circle-powered evidence/payment rails.

The system discovers markets, rejects low-quality or unclear candidates, builds an evidence packet, runs an AI council, calculates AI probability versus market probability, labels risk and confidence, and publishes only the right kind of output for the right surface.

Bonded YES/NO calls use Arc as the accountability layer. Sports calls remain non-bonded selected-outcome intelligence until generalized selected-outcome resolution is implemented safely. Circle Gateway/x402 can be used to pay for premium evidence when the provider and network support it, and every paid evidence action is tracked honestly.

# 6. Core Features

## A. Bonded Arc Calls

Bonded Arc Calls are the strictest Precall output.

- High-conviction, strict YES/NO market calls.
- Liquidity, spread, edge, confidence, price-band, and size gates.
- Published only when the worker can safely produce a qualifying call.
- USDC bond posted on Arc through `PrecallRegistry`.
- Locked public preview before unlock.
- Full thesis, evidence, probability, risk, sizing, and agent votes unlock with Arc USDC.
- Expiry and resolution flow moves calls out of active views and into historical performance.
- Leaderboard tracks resolved performance rather than hype.

## B. Sports Live Calls

Sports Live Calls are AI-generated soccer market intelligence, locked strictly to the "soccer" category across frontend forms, worker cycles, and API endpoints.

Supported formats include:

- Match winners (1X2 Home/Draw/Away selected outcomes).
- Goal lines (e.g., over/under 0.5, 1.5, 2.5, and 3.5 goals).
- Goal ranges and spreads when pricing is clear.

Sports calls use labels instead of disappearing just because they are not strong:

- `strong_call`
- `lean_call`
- `high_risk_call`

Sports Live Calls are not guaranteed outcomes and are not financial advice.

## C. Arc USDC Unlock Flow

Precall intentionally separates preview from full analysis.

Before unlock, users see only the safe public preview. After a verified Arc USDC unlock, the app reveals:

- Recommendation or selected option.
- Market probability.
- AI probability.
- Edge.
- Confidence.
- Suggested size when relevant.
- Thesis and reasoning.
- Evidence and source URLs.
- Risks and counterarguments.
- Agent votes.
- Polymarket link.

## D. Circle Agent Stack / x402

Precall uses Circle Agent Stack concepts for agentic payment and evidence workflows.

- Circle Gateway/x402 can pay allowlisted premium APIs for evidence.
- Base Mainnet is the recommended production x402 payment network when the provider supports it.
- Arc Testnet remains available for hackathon/demo x402 flows and Arc-bonded settlement demos.
- The worker checks provider/network support before paying and records paid evidence through `circle_actions`.
- Arc remains the settlement/unlock layer for Precall's own bonded calls and user unlocks.
- The x402 payment network affects paid-evidence settlement, not AI analysis quality. Analysis quality depends on evidence, model behavior, and agent logic.
- Paid evidence is never faked. If x402 fails, Precall records the failure and only continues when required mode is disabled.

## E. Admin / Worker Automation

The worker runs outside the public web app.

- Railway worker scans Polymarket markets.
- Runs bonded YES/NO cycles.
- Runs Sports Live Calls cycles.
- Expires old calls and sports calls.
- Resolves mature supported YES/NO calls.
- Reports skipped reasons, failures, health, Gateway status, and x402 status.
- Long worker jobs can be started asynchronously from the admin UI so Vercel requests do not have to wait 10-30 minutes.

## F. Leaderboard / Top 5

Precall separates active predictions from historical reputation.

- Top 5 shows active bonded calls and top active sports calls separately.
- Leaderboard tracks resolved bonded-call performance.
- Wins and losses are shown after resolution.
- Unresolved sports calls do not inflate reputation.
- Old resolved calls are not shown as live recommendations.

# 7. How It Works

1. The Railway worker discovers live Polymarket markets.
2. It filters expired, unsupported, low-liquidity, bad-spread, already-live, extreme-price, or unclear markets.
3. It builds an evidence packet from Polymarket data and optional x402 evidence.
4. An AI council analyzes the market using supplied evidence IDs only.
5. The system calculates market probability, AI probability, edge, confidence, and risk.
6. Valid sports markets become Sports Live Calls with strong, lean, or high-risk labels.
7. Bonded Arc Calls publish only if strict YES/NO quality gates pass.
8. Users unlock full reasoning with Arc USDC.
9. Expired or resolved calls move out of active views.
10. The leaderboard records historical resolved performance.

# 8. Architecture

- **Frontend:** Next.js on Vercel.
- **Worker:** Node/TypeScript worker on Railway.
- **Database:** Supabase Postgres with Drizzle schema and migrations.
- **Chain:** Arc Testnet.
- **Smart contracts:** Solidity with Foundry.
- **Payments:** Arc USDC for bonds and unlocks.
- **Agentic payment/evidence:** Circle Agent Stack, Circle Gateway, and x402.
- **Market data:** Polymarket Gamma and CLOB APIs.
- **AI provider/model:** OpenAI-compatible provider configured through env vars.

```text
Polymarket Gamma/CLOB
        |
        v
Railway Worker -> Evidence Packet -> AI Council -> Quality Gates
        |                              |              |
        |                              |              +--> Sports Live Calls
        |                              |
        +--> Circle Gateway/x402 -----+
        |
        +--> Arc PrecallRegistry -> Bonded Arc Calls -> USDC Unlocks
                                      |
                                      v
                              Resolution + Leaderboard

Vercel Web App reads Postgres, renders previews, verifies unlocks, and calls Railway through protected admin triggers.
```

# 9. Arc Usage

Precall uses Arc Testnet as the accountability and settlement layer.

- Bonded YES/NO calls are published through `PrecallRegistry`.
- Agents post USDC bonds on Arc.
- Users unlock full bonded-call reasoning with Arc USDC.
- Sports Live Calls also unlock with Arc USDC, but they are not Arc-bonded yet.
- Resolved bonded calls update historical reputation and leaderboard statistics.
- Arc provides the settlement layer for the app's core trust loop.

# 10. Circle Usage

Precall uses Circle in three main ways:

- **USDC rails:** Arc USDC powers bonds and unlock payments.
- **Circle Agent Stack / Gateway / x402:** the worker can pay for premium evidence from allowlisted providers. Production paid evidence should use Base Mainnet when supported; Arc Testnet remains available for hackathon/demo configuration.
- **Circle action tracking:** `circle_actions` records x402 payments, Gateway deposits, Arc bonds, thesis unlocks, and sports unlocks.

x402 has optional and required modes:

- `REQUIRE_CIRCLE_GATEWAY_X402=false`: record failures and allow free evidence fallback.
- `REQUIRE_CIRCLE_GATEWAY_X402=true`: fail the market if required x402 evidence cannot be fetched.

Private keys stay in Railway/server environments only. They are never moved into `NEXT_PUBLIC_*` variables.

# 11. Arc OSS Primitives

Precall exposes several reusable primitives for Arc/Circle builders:

- **USDC-backed agent accountability:** agents publish bonded calls with onchain consequences.
- **Arc USDC unlockable reasoning:** users pay a small USDC unlock to reveal full analysis.
- **Selected-outcome sports prediction model:** sports calls can select outcomes beyond YES/NO.
- **Evidence-based agent analysis:** every agent vote must reference supplied evidence IDs.
- **Public frontend + private worker architecture:** Vercel renders the product while Railway owns long-running, key-bearing work.
- **Market filtering and quality gates:** liquidity, spread, price-band, confidence, edge, and expiry gates protect output quality.
- **Performance tracking and leaderboard:** resolved calls drive reputation instead of unresolved hype.
- **x402 paid evidence flow:** provider support detection, budget controls, allowlists, and paid-evidence metadata.

How this differs from `circlefin/arc-*` reference repos:

Existing Arc/Circle repos are excellent commerce and payment references. Precall builds a higher-level autonomous market-intelligence layer on top of those primitives. It combines Arc settlement, Circle payment rails, agent decision-making, evidence gating, sports selected-outcome calls, locked reasoning, and reputation tracking into one end-to-end app.

# 12. Smart Contracts

- **Contract:** `PrecallRegistry` (V2 Upgrade)
- **Network:** Arc Testnet
- **Registry address:** `0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970`
- **Explorer:** https://testnet.arcscan.app/address/0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970

`PrecallRegistry` V2 features:

- **Multi-Outcome Prediction Bonding**: Uses a `uint8 selectedOutcomeIndex` representation, enabling arbitrary non-binary predictions (Home/Draw/Away, exact scores, over/under goal lines) to be bonded onchain.
- **Push/Void Match Support**: Added a `bool isPush` flag inside `resolveCall` that returns USDC bonds safely to publishers if a match is voided, cancelled, or postponed.
- **Agent Registration**: Register agents using `registerAgent(string name, string metadataURI)` to post bonds.
- **Bond Return/Slash Logic**: If `isPush` is true, or if `selectedOutcomeIndex == resolvedOutcomeIndex`, the bond is returned to the publisher; otherwise, the bond is slashed and sent to the protocol treasury.

Current defaults are configurable through env:

- `BOND_AMOUNT_USDC=1`
- `UNLOCK_PRICE_USDC=0.05`
- `SPORTS_UNLOCK_PRICE_USDC=0.05`

Sports Live Calls are not Arc-bonded yet. They are non-bonded intelligence outputs with Arc USDC unlocks.

Run contract tests:

```bash
npm run contracts:test
```

# 13. Database

Key tables:

- `agents`: agent identities and onchain agent IDs.
- `markets`: normalized Polymarket market metadata.
- `calls`: bonded strict YES/NO call rows.
- `sports_predictions`: selected-outcome Sports Live Calls.
- `thesis_unlocks`: bonded-call unlock records.
- `sports_unlocks`: sports-call unlock records.
- `circle_actions`: normalized Circle/x402/bond/unlock activity.
- `evidence_items`: evidence used by bonded calls.
- `resolutions`: resolved call outcomes, ROI, Brier score, and resolver tx data.
- `agent_runs`: worker run inputs, outputs, failures, and evidence context.

This is intentionally high-level. No secrets or private keys belong in database migrations or public docs.

# 14. Environment Variables

## A. Vercel / Frontend Env

These values are safe or required for the public web/server app. `WORKER_TRIGGER_SECRET` is server-side only on Vercel and must not be exposed to the browser.

```bash
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS=0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970
NEXT_PUBLIC_ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS=0xYourTreasuryOrReceiver
NEXT_PUBLIC_ADMIN_WALLETS=0xAdminWallet1,0xAdminWallet2
DATABASE_URL=postgresql://...
WORKER_TRIGGER_URL=https://your-railway-worker-url.up.railway.app
WORKER_TRIGGER_SECRET=generate-a-long-random-secret
WORKER_ROUTE_TIMEOUT_MS=295000
WORKER_ASYNC_COMMANDS=run-once,sports,resolve
DISABLE_SCHEDULED_WORKERS=true
```

## B. Railway / Worker Env

Railway should hold private worker keys, RPC credentials, model keys, and Circle buyer keys.

```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
MODEL_TIMEOUT_MS=45000
MODEL_RETRY_COUNT=2

ARC_TESTNET_RPC_URL=https://...
PRECALL_REGISTRY_ADDRESS=0xb8CbE111834f1411AC85c3E72FDc35E14Eb92970
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
DEFAULT_ONCHAIN_AGENT_ID=1
AGENT_OWNER_PRIVATE_KEY=...
AGENT_OWNER_WALLET=0x...
RESOLVER_PRIVATE_KEY=...
PUBLISH_ONCHAIN=true
RESOLVE_ONCHAIN=true

CIRCLE_AGENT_PRIVATE_KEY=...
ENABLE_CIRCLE_GATEWAY_X402=true
REQUIRE_CIRCLE_GATEWAY_X402=false
# Production paid evidence on Base Mainnet. This spends real USDC.
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
# Optional external generic x402 fallback, not required for Gateway proof:
# CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one,stableenrich.dev
# STABLE_ENRICH_X402_REDDIT_SEARCH_ENDPOINT=https://stableenrich.dev/api/reddit/search
# Demo/hackathon alternative:
# CIRCLE_GATEWAY_CHAIN=arcTestnet
# X402_ACCEPTED_NETWORKS=eip155:5042002
# X402_FACILITATOR_URL=https://gateway-api-testnet.circle.com

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
SPORTS_STRATEGY_MODE=hit_rate
SPORTS_TARGET_HIT_RATE_BPS=7000
SPORTS_HIGH_PROB_MIN_PRICE_BPS=6500
SPORTS_HIGH_PROB_MAX_PRICE_BPS=9000
SPORTS_HIGH_PROB_MIN_CONFIDENCE_BPS=4000
SPORTS_HIGH_PROB_MIN_EDGE_BPS=0

DISCOVERY_MARKET_LIMIT=150
MAX_ANALYZED_MARKETS_PER_RUN=8
MIN_LIQUIDITY_USD=10000
MAX_SPREAD_BPS=900
MIN_EDGE_BPS=650
MIN_CONFIDENCE_BPS=5200
MIN_SUGGESTED_SIZE_BPS=100
MIN_ANALYSIS_PRICE_BPS=100
MAX_ANALYSIS_PRICE_BPS=9900

WORKER_TRIGGER_SECRET=generate-a-long-random-secret
```

Note: the supported sports start-buffer variable is `SPORTS_MIN_START_LEAD_MINUTES`. Do not use private keys, tokenized RPC URLs, or secrets in any `NEXT_PUBLIC_*` variable.

# 15. Local Development

```bash
npm install
cp .env.example .env
npm run db:migrate
npm test
npm run typecheck
npm run lint
npm run build
npm run contracts:test
```

For local web development:

```bash
npm run dev
```

# 16. Worker Commands

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

What they do:

- `worker:health`: checks worker, DB, model, Polymarket, Arc, Circle, and config health.
- `worker:run-once`: scans strict YES/NO markets and may publish bonded Arc Calls.
- `worker:sports`: scans sports markets and stores Sports Live Calls.
- `worker:expire`: expires mature bonded calls and sports calls whose event start has passed.
- `worker:resolve`: runs expiry, then resolves supported mature YES/NO calls.
- `worker:gateway:balance`: checks Gateway balance for the configured buyer wallet.
- `worker:gateway:deposit`: deposits USDC into Gateway, subject to safety caps.

# 17. Railway Deployment

Recommended worker deployment:

- **Build command:**

```bash
npm -w @precall/shared run build && npm -w @precall/worker run build
```

- **Persistent worker start command:**

```bash
npm run worker:serve
```

- **Migration command:**

```bash
npm run db:migrate
```

- **Health command:**

```bash
npm run worker:health
```

Railway should own private execution:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `ARC_TESTNET_RPC_URL`
- `AGENT_OWNER_PRIVATE_KEY`
- `RESOLVER_PRIVATE_KEY`
- `CIRCLE_AGENT_PRIVATE_KEY`
- `WORKER_TRIGGER_SECRET`

After deploying the HTTP worker, copy its URL into Vercel as `WORKER_TRIGGER_URL`.

# 18. Railway Cron Jobs

Recommended Railway cron jobs:

| Job | Schedule | Command | Purpose |
| --- | --- | --- | --- |
| Sports Live Calls | Every 3 hours | `npm run worker:sports` | Scans daily sports markets and stores active Sports Live Calls. |
| Bonded agent run | Every 4 hours | `npm run worker:run-once` | Scans strict YES/NO markets and publishes only quality-passing bonded calls. |
| Expire calls | Every hour | `npm run worker:expire` | Removes expired or already-started calls from active views. |
| Resolve calls | Every 4 hours | `npm run worker:resolve` | Resolves supported mature YES/NO calls and updates leaderboard history. |

Cron jobs can share the same Railway env vars as the HTTP worker. Avoid running multiple copies of the same long worker job concurrently.

# 19. Vercel Deployment

Deploy the web app to Vercel from the GitHub repo.

Vercel should hold public/web server values only:

- `DATABASE_URL` for rendering pages and admin/demo data.
- `NEXT_PUBLIC_*` public addresses/config.
- `WORKER_TRIGGER_URL` and server-side `WORKER_TRIGGER_SECRET` for admin-triggered worker calls.
- `DISABLE_SCHEDULED_WORKERS=true` so Vercel cron does not execute private worker code locally.

Vercel calls Railway through `WORKER_TRIGGER_URL`. Long-running worker commands are started asynchronously so the admin UI does not wait for a 10-30 minute worker cycle.

# 20. Testing

Run the full verification suite:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run contracts:test
```

Test coverage protects:

- Sports classification and selected-outcome semantics.
- Locked analysis behavior before unlock.
- Unlock analysis visibility after verified unlock.
- x402 provider support detection and failure handling.
- Sports active/expired filtering.
- Bonded YES/NO resolution flow.
- Admin worker actions and async trigger behavior.
- Contract bond, unlock, and resolve behavior.

# 21. Security Notes

- Private keys belong only in Railway/server env.
- Do not commit `.env` files.
- Do not put private keys, tokenized RPC URLs, model keys, or worker secrets in `NEXT_PUBLIC_*` variables.
- Admin routes require wallet authorization.
- Worker triggers are protected by `WORKER_TRIGGER_SECRET`.
- Locked analysis must not be exposed before a verified unlock.
- x402 hosts are allowlisted and spend-capped.
- Gateway deposits are capped by `CIRCLE_GATEWAY_MAX_DEPOSIT_USDC`.

# 22. Product Safety / NFA

Precall does not provide financial advice. Sports Live Calls and Bonded Arc Calls are AI-generated market intelligence, not guaranteed outcomes.

Precall does not custody user trading funds and does not place trades for users. Users must do their own research and decide independently whether to act on any market information.

# 23. Known Limitations

- Precall does not execute trades.
- Sports Live Calls are not fully Arc-bonded yet.
- Sports selected-outcome resolution is expiry-safe for now; full selected-outcome settlement is future work.
- Circle Gateway/x402 paid evidence depends on provider and network support.
- Bonded calls are intentionally strict and may publish less often.
- Model output depends on available evidence.
- Railway worker cycles can be long-running, especially with deeper market scans and model calls.

# 24. Roadmap

- Generalized selected-outcome Arc bonding.
- Stronger sports resolution against Polymarket outcomes.
- More evidence providers.
- Improved agent reputation scoring.
- Richer leaderboard analytics.
- Better mobile UX and call comparison views.
- More market categories beyond current sports and YES/NO markets.
- Better x402 provider discovery and support diagnostics.
- User profiles, follows, and personalized alerts.

# 25. Contributing

Builders can fork Precall to reuse its Arc/Circle primitives:

- Arc USDC unlock flows.
- Agent accountability contracts.
- Private worker + public frontend architecture.
- Sports selected-outcome modeling.
- Evidence-gated AI council patterns.
- Circle Gateway/x402 payment checks.
- Market quality gates and leaderboard tracking.

To contribute:

1. Fork the repo.
2. Create a feature branch.
3. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Open a pull request with a clear explanation and screenshots if UI changed.
5. Never include secrets, private keys, `.env` files, or tokenized RPC URLs.

# 26. License

No repository-level license file is present yet. The Solidity contracts currently include SPDX `MIT` headers, but the full repository license has not been selected.

Before broad OSS reuse, the maintainer should choose and add a top-level license such as MIT, Apache-2.0, or another license that matches the intended open-source strategy.
