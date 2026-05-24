# Required Inputs For A Real Precall App

Use this checklist when moving from local verified code to a real public hackathon demo. Never commit secrets. Put local secrets in `.env`; put hosted secrets in your deployment provider environment variables.

## Safe Places To Input Values

- Local development: `/home/gtee/projects/precall/.env`
- Template only: `/home/gtee/projects/precall/.env.example` must stay secret-free.
- Vercel deployment: project dashboard -> Settings -> Environment Variables. Add the same keys there for Production and Preview as needed.
- Foundry deployer key: use `cast wallet import precall-deployer --interactive`; do not paste the private key into a tracked file.

## AI Provider: FreeModel

Precall calls an OpenAI-compatible `/v1/chat/completions` endpoint. FreeModel supports that at `https://api.freemodel.dev/v1`. Do not use the Claude Code URL (`https://cc.freemodel.dev`) for this app because that is the Anthropic Messages API route.

Add these to `.env` and Vercel:

```env
OPENAI_API_KEY=your_freemodel_api_key
OPENAI_BASE_URL=https://api.freemodel.dev/v1
OPENAI_MODEL=gpt-5.4-mini
```

Where to get it: sign in at https://freemodel.dev/dashboard, open the API/docs or key section, and copy the API key/token. The public models endpoint is `https://api.freemodel.dev/v1/models`.

## Database: Supabase Postgres

Add this to `.env` and Vercel:

```env
DATABASE_URL=postgresql://...
```

Where to get it: create/open a Supabase project at https://supabase.com/dashboard, then copy a Postgres connection string from the project database connection settings. Use a pooled connection string for hosted serverless deployments when available.

After setting it locally, run:

```bash
npm run db:migrate
```

## Arc/Canteen RPC

Add this to `.env` and Vercel as a server-side variable only:

```env
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc-node.thecanteenapp.com/v1/YOUR_TOKEN
```

Where to get it locally:

```bash
PATH="$HOME/.local/bin:$PATH" arc-canteen rpc-url
```

Do not expose this through any `NEXT_PUBLIC_*` variable. Verify Arc Testnet with:

```bash
npm run arc:chain-id
```

Expected result: `0x4cef52`.

## Arc Wallets And Contract Deployment

For deployment, import a funded Arc Testnet wallet locally:

```bash
PATH="$HOME/.foundry/bin:$PATH" cast wallet import precall-deployer --interactive
```

Fund it with Arc Testnet USDC from https://faucet.circle.com. Arc uses USDC as native gas.

Deploy the registry:

```bash
PATH="$HOME/.foundry/bin:$PATH" forge create src/PrecallRegistry.sol:PrecallRegistry \
  --root packages/contracts \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --account precall-deployer \
  --broadcast \
  --constructor-args "$ARC_USDC_ADDRESS" "$PROTOCOL_TREASURY_ADDRESS"
```

After deployment, add the contract address to `.env` and Vercel:

```env
PRECALL_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS=0x...
PROTOCOL_TREASURY_ADDRESS=0x...
```

## Worker Agent Wallet

The worker needs a dedicated funded Arc Testnet wallet when publishing bonded calls or resolving markets. For the MVP, this can be the same testnet wallet as the deployer, but a separate agent wallet is cleaner.

Add these to `.env` and your secure worker/deployment environment only:

```env
AGENT_OWNER_PRIVATE_KEY=0x...
RESOLVER_PRIVATE_KEY=0x...
AGENT_OWNER_WALLET=0x...
```

Never paste a main wallet private key. Use a fresh testnet-only wallet with limited funds.

Register the council agent after the registry is deployed:

```bash
npm run worker -- register-agent
```

Then copy the returned agent ID into:

```env
DEFAULT_ONCHAIN_AGENT_ID=1
```

## App/Admin

Set strong admin and cron secrets locally and in Vercel:

```env
ADMIN_SECRET=generate_a_long_random_value
CRON_SECRET=generate_another_long_random_value
WORKER_ROUTE_TIMEOUT_MS=240000
DISABLE_SCHEDULED_WORKERS=true
NEXT_PUBLIC_APP_URL=https://your-public-app-url
NEXT_PUBLIC_ADMIN_WALLETS=0xYourAdminWallet
```

Generate a local secret with:

```bash
openssl rand -hex 32
```

## Cron Automation

The root `vercel.json` schedules two production cron jobs: one daily agent run and one daily resolver run. They call protected API routes and require `CRON_SECRET` to be set in Vercel. If private publishing/resolver keys are not stored on Vercel, set `DISABLE_SCHEDULED_WORKERS=true` and run the bonded worker from a separate secure machine.

Manual test after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-public-app-url/api/cron/agent-run
curl -H "Authorization: Bearer $CRON_SECRET" https://your-public-app-url/api/cron/resolve
```

## Canteen Profile

Complete your hackathon profile with Discord, Telegram, and Luma email.

CLI path:

```bash
PATH="$HOME/.local/bin:$PATH" arc-canteen profile edit
PATH="$HOME/.local/bin:$PATH" arc-canteen status
```

Website: https://arc-node.thecanteenapp.com/

## Optional Circle Gateway/x402 Paid Evidence

The app can run real market agents without paid evidence. Turn this on only after the separate Gateway/x402 buyer wallet is funded and you are comfortable with the spend limits:

```env
ENABLE_CIRCLE_GATEWAY_X402=true
CIRCLE_GATEWAY_CHAIN=arcTestnet
CIRCLE_X402_CHAIN_CANDIDATES=arcTestnet,baseSepolia,base
CIRCLE_AGENT_PRIVATE_KEY=0x...
CIRCLE_GATEWAY_RPC_URL=
CIRCLE_X402_MAX_PAYMENT_USDC=0.005
CIRCLE_X402_DAILY_BUDGET_USDC=0.10
CIRCLE_X402_ALLOWED_HOSTS=api.aisa.one
CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC=0.25
```

`CIRCLE_AGENT_PRIVATE_KEY` is server-only and must never be committed or exposed as `NEXT_PUBLIC_*`. It is intentionally separate from `AGENT_OWNER_PRIVATE_KEY`: Gateway/x402 pays premium API sellers, while the Arc owner key publishes bonded calls.

## Final Smoke Test

After all required values are set:

```bash
npm run db:migrate
npm run worker -- health
npm run worker -- discover
npm run worker -- register-agent
npm run worker -- run-once
npm run build
```

A complete real demo has: live Polymarket markets in the database, a deployed Arc registry address, a registered onchain agent ID, at least one bonded call transaction, and a public web deployment with env vars set.

## Hardened Agent Controls

```env
MODEL_TIMEOUT_MS=45000
MODEL_RETRY_COUNT=2
DISCOVERY_MARKET_LIMIT=150
MAX_ANALYZED_MARKETS_PER_RUN=8
MIN_ANALYSIS_PRICE_BPS=100
MAX_ANALYSIS_PRICE_BPS=9900
MIN_LIQUIDITY_USD=10000
MIN_EDGE_BPS=650
MAX_SPREAD_BPS=900
MIN_CONFIDENCE_BPS=5200
MIN_SUGGESTED_SIZE_BPS=100
```

These defaults intentionally publish fewer calls. No call is better than a weak call.
