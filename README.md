# Precall Arena

Precall is an Arc-native prediction-market intelligence arena for the Agora Agents Hackathon. Separate market-agent roles scan live Polymarket YES/NO markets, produce accountable probabilities, publish only quality-passing calls with USDC bonds on Arc Testnet, let users unlock the full thesis with USDC, and build public reputation after outcomes resolve.

The core proof loop is:

```text
live market -> verified evidence -> agent YES probability -> market edge -> bonded Arc call -> USDC thesis unlock -> resolution -> leaderboard reputation
```

## Why It Matters

Prediction-market advice is usually cheap talk. Precall makes agent calls auditable: every public recommendation has a timestamped market, supplied evidence IDs, an Arc call ID, a USDC bond, a thesis hash, an unlock trail, and a lifecycle state. The product does not custody user trading funds and does not claim to place trades. It gives non-custodial copy signals and links users to the current market page.

## What Is Real Today

- Live Polymarket discovery through Gamma and CLOB/public market data adapters.
- Strict V1 eligibility for active, future, binary YES/NO markets only.
- Five separate role calls: `MacroScout`, `NewsHawk`, `CrowdPulse`, `BookWatcher`, and `Skeptic`.
- Canonical probability semantics: `yesProbabilityBps` always means probability that YES/first outcome happens.
- Quality gates for liquidity, spread, edge, confidence, and suggested size.
- Arc Testnet registry for agent registration, bonded calls, thesis unlocks, and resolution events.
- Circle Agent Stack tracking for agent USDC bonds, user thesis unlocks, and optional Gateway/x402 paid evidence calls.
- Hosted Postgres persistence with Drizzle migrations.
- Wallet-signed follows and feedback for new user traction events.
- `/demo` page that shows live config booleans, latest run, latest locked call proof, latest Sports Live Calls, latest unlock, and Circle activity without faking empty states.
- Sports Live Calls board for non-bonded selected-outcome sports predictions from Polymarket sports markets.

## Intentionally Not Supported Yet

- Arc-bonding and resolution for non-YES/NO selected-outcome markets. Sports Live Calls can analyze them as non-bonded predictions, but V1 does not bond/resolve them until generalized resolution is safe.
- Custody or automated trade execution for users. Precall links to markets for manual copying.
- Fake social/news enrichment. x402 evidence is shown only when real Circle/x402 enrichment is enabled and succeeds.
- Overclaimed reputation. The leaderboard is honest when no resolved calls exist.

## Architecture

- `apps/web` - Next.js public arena, call pages, admin console, demo page, leaderboard, wallet unlocks, follows, feedback, and share routes.
- `apps/worker` - Node runner for market discovery, eligibility filtering, evidence context, separate role model calls, publishing, expiry, and resolution.
- `packages/contracts` - Foundry Solidity registry deployed on Arc Testnet.
- `packages/shared` - Drizzle schema, migrations, Polymarket adapters, Circle Gateway/x402 buyer client, evidence providers, scoring, market eligibility, contract ABI, and shared types.

## Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run contracts:build
npm run dev
```

Install the Canteen ARC CLI for hackathon RPC/context:

```bash
PATH="$HOME/.local/bin:$PATH" uv tool install git+https://github.com/the-canteen-dev/ARC-cli
PATH="$HOME/.local/bin:$PATH" arc-canteen login
PATH="$HOME/.local/bin:$PATH" arc-canteen context sync
PATH="$HOME/.local/bin:$PATH" arc-canteen rpc-url
```

Set the returned RPC URL as server-side `ARC_TESTNET_RPC_URL`. Never expose the tokenized Canteen RPC through `NEXT_PUBLIC_*`.

## Environment Variables

Required for a real run:

- `DATABASE_URL` - Postgres connection string.
- `OPENAI_API_KEY` - OpenAI-compatible provider key. FreeModel works with `OPENAI_BASE_URL=https://api.freemodel.dev/v1`.
- `OPENAI_MODEL` - chat-completions model ID.
- `ARC_TESTNET_RPC_URL` - server-side Arc Testnet RPC.
- `PRECALL_REGISTRY_ADDRESS` and `NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS` - active registry address.
- `ARC_USDC_ADDRESS` and `NEXT_PUBLIC_ARC_USDC_ADDRESS` - Arc ERC-20 USDC address, currently `0x3600000000000000000000000000000000000000`.
- `AGENT_OWNER_PRIVATE_KEY` - secure worker key for bonded publishing.
- `AGENT_OWNER_WALLET` - public address for the agent wallet.
- `RESOLVER_PRIVATE_KEY` - secure resolver key, or omit to use the agent key.
- `PROTOCOL_TREASURY_ADDRESS` - treasury receiving slashed wrong-call bonds in V2 deployments.
- `SPORTS_UNLOCK_PRICE_USDC` - Arc USDC price to unlock full Sports Live Call analysis. Defaults to `UNLOCK_PRICE_USDC`.
- `SPORTS_UNLOCK_RECEIVER_ADDRESS` and `NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS` - treasury/receiver for direct Arc USDC sports unlock transfers. This address is public, but private keys remain server-only.
- `DEFAULT_ONCHAIN_AGENT_ID` - onchain agent ID after `register-agent`.
- `ADMIN_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_ADMIN_WALLETS` - admin and automation protection.

Useful hardening controls:

- `MIN_LIQUIDITY_USD=10000`
- `MIN_EDGE_BPS=650`
- `MAX_SPREAD_BPS=900`
- `MIN_CONFIDENCE_BPS=5200`
- `MIN_SUGGESTED_SIZE_BPS=100`
- `DISCOVERY_MARKET_LIMIT=150` - Polymarket markets fetched before eligibility/ranking.
- `MAX_ANALYZED_MARKETS_PER_RUN=8` - top ranked eligible candidates allowed to spend x402/LLM calls.
- `MIN_ANALYSIS_PRICE_BPS=100` and `MAX_ANALYSIS_PRICE_BPS=9900` - skip ultra-extreme lottery-ticket prices before paid/model analysis so runs focus on markets that can produce actionable edge.
- `MODEL_TIMEOUT_MS=45000`
- `MODEL_RETRY_COUNT=2`
- `ALLOW_PUBLISH_FILTERED_RUN=false`

Sports Live Calls controls:

- `ENABLE_SPORTS_EDGE=true` - enables the non-bonded Sports Live Calls scanner.
- `SPORTS_DISCOVERY_MARKET_LIMIT=250` - Polymarket markets fetched for sports classification.
- `SPORTS_DAILY_TARGET=5` - target number of strong sports calls to surface per day. Analyzed valid markets are still stored as strong, lean, high-risk, or avoid calls.
- `MAX_SPORTS_ANALYZED_PER_RUN=16` - max sports markets allowed to spend x402/model calls per run.
- `SPORTS_LOOKAHEAD_HOURS=72` - focus on near-term daily sports markets.
- `SPORTS_MIN_LIQUIDITY_USD=25000`, `SPORTS_MAX_SPREAD_BPS=500`, `SPORTS_MIN_EDGE_BPS=300`, `SPORTS_MIN_CONFIDENCE_BPS=5000`, `SPORTS_MIN_PRICE_BPS=1000`, `SPORTS_MAX_PRICE_BPS=9000`.

Optional Circle Gateway/x402 paid evidence:

- `ENABLE_CIRCLE_GATEWAY_X402=false` - master switch; when false the worker never attempts paid API calls.
- `REQUIRE_CIRCLE_GATEWAY_X402=false` - keep false until at least one provider/chain pair passes `worker:x402:supports`; when false, paid-evidence failures are recorded and the worker may continue with free evidence.
- `CIRCLE_GATEWAY_CHAIN=arcTestnet` - default Gateway chain for balance/deposit commands; Arc Testnet still remains the settlement chain for bonds/unlocks.
- `CIRCLE_X402_CHAIN_CANDIDATES=arcTestnet,baseSepolia,base` - ordered candidate chains tested against each x402 seller URL before payment.
- `CIRCLE_AGENT_PRIVATE_KEY=` - server-only buyer key for Gateway/x402 payments; do not reuse `AGENT_OWNER_PRIVATE_KEY` and never expose it as `NEXT_PUBLIC_*`.
- `CIRCLE_GATEWAY_RPC_URL=` - optional Gateway RPC override; otherwise the Arc RPC is reused when appropriate.
- `CIRCLE_X402_MAX_PAYMENT_USDC=0.005` - per-request spend cap.
- `CIRCLE_X402_DAILY_BUDGET_USDC=0.10` - daily paid-evidence budget.
- `CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one` - comma-separated x402 seller allowlist.
- `CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC=0.25` - minimum Gateway balance before any paid request.
- `CIRCLE_GATEWAY_MAX_DEPOSIT_USDC=10` - safety cap for the worker Gateway deposit command.

## Contract Deployment

The hardened registry constructor is:

```solidity
constructor(address usdc_, address protocolTreasury_)
```

Deploy with a funded Arc Testnet account:

```bash
PATH="$HOME/.foundry/bin:$PATH" cast wallet import precall-deployer --interactive
PATH="$HOME/.foundry/bin:$PATH" forge create src/PrecallRegistry.sol:PrecallRegistry \
  --root packages/contracts \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --account precall-deployer \
  --broadcast \
  --constructor-args "$ARC_USDC_ADDRESS" "$PROTOCOL_TREASURY_ADDRESS"
```

After deployment, update `PRECALL_REGISTRY_ADDRESS`, `NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS`, and keep old call rows with their original `registryAddress` so legacy calls can still be verified.

## Worker Commands

```bash
npm run worker -- health
npm run worker -- discover
npm run worker -- register-agent
npm run worker -- run-once
npm run worker:sports
npm run worker -- publish-run <agentRunId>
npm run worker -- expire
npm run worker -- resolve
npm run worker:x402:supports -- "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search?query=bitcoin&queryType=Top"
npm run worker:gateway:balance -- arcTestnet
npm run worker:gateway:balance -- baseSepolia
npm run worker:gateway:deposit -- baseSepolia 1
npm run worker:gateway:balance -- baseSepolia
```

`worker:x402:supports -- <url>` checks each `CIRCLE_X402_CHAIN_CANDIDATES` entry and reports the first provider-supported chain. `worker:gateway:balance -- <chain>` checks the Circle Gateway wallet and unified balance for `CIRCLE_AGENT_PRIVATE_KEY` on that chain. `worker:gateway:deposit -- <chain> 1` deposits 1 USDC from that buyer wallet into Gateway using the Circle Gateway SDK. Commands return public tx hashes and balances only; they never print the private key.

`run-once` checks live strict YES/NO markets, computes real CLOB best bid/ask spread, skips unsupported or ultra-extreme markets with transparent reasons, builds verified evidence context, runs the five role agents, filters weak outputs, and publishes only qualifying bonded calls. `worker:sports` separately scans sports markets, runs a sports-focused council, stores non-bonded selected-outcome ideas, and never forces weak picks to satisfy the daily target. `expire` marks matured unresolved calls as awaiting resolution. `resolve` calls expiry first, resolves supported YES/NO markets, updates reputation metrics, and submits Arc resolver transactions when enabled.

## How Precall Uses Circle Agent Stack

Precall does not just generate text. The agent uses Circle-powered financial rails across three clearly separated rails:

- Public market data: Polymarket Gamma/CLOB provide free market metadata, prices, spreads, and depth. Precall never labels these public requests as paid.
- Paid agent evidence: when `ENABLE_CIRCLE_GATEWAY_X402=true`, the worker uses `@circle-fin/x402-batching` GatewayClient with `CIRCLE_AGENT_PRIVATE_KEY` to pay allowlisted premium APIs such as AISA (`api.aisa.one`) using USDC nanopayments. The seller API decides which x402 networks it supports; Precall checks `CIRCLE_X402_CHAIN_CANDIDATES` in order, pays on the first supported Gateway chain, and records the selected chain in `circle_actions`. Host allowlists, per-request caps, daily budgets, and minimum Gateway balance checks run before every payment.
- Settlement and accountability: agents bond calls with USDC on Arc, users unlock reasoning with USDC on Arc, and `circle_actions` records normalized `x402_api_payment`, `arc_bond`, and `thesis_unlock` events.

If x402 is disabled or a paid request fails, the worker records the disabled/failure state and continues with free Polymarket evidence unless `REQUIRE_CIRCLE_GATEWAY_X402=true`. Do not set required=true until `worker:x402:supports -- <provider-url>` returns a supported chain and that chain has Gateway balance. It does not fake paid evidence, loosen publish gates, or expose secrets to the browser. `/admin`, `/demo`, and call pages show Gateway status, paid-evidence badges, USDC volumes, Arc tx links, and disabled states honestly.

## Demo Flow

1. Open `/demo` to show DB, model, Arc registry, Circle/x402 status, latest run, latest call, and latest unlock.
2. Open `/admin`, connect the whitelisted admin wallet, and run health.
3. Run the agent. If no call is published, show the filtered reasons instead of forcing a weak signal.
4. Open a live call and show only the locked title, Arc bond, unlock price, freshness, and unlock button.
5. Unlock the thesis with USDC on Arc to reveal selected option, Polymarket link, thesis, evidence, sizing, risks, and agent votes.
6. Return to `/demo` and `/leaderboard` to show unlock activity and reputation state.
7. Run `resolve` for mature supported calls and show Brier/ROI after resolution.

## Security Notes

- Never commit `.env`, private keys, tokenized RPC URLs, admin secrets, cron secrets, or service-role database credentials.
- Keep private keys in local/server env only. Browser env vars must be public addresses/config only.
- New follows and feedback require wallet signatures. Existing unsigned rows are treated as legacy.
- Vercel can host the app, but long-running bonded publishing is safest from a secure worker or protected admin action.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run contracts:test
```
