# Agora Arc Setup

This project is built for the Agora Agents Hackathon with Arc and Circle infrastructure. Use the Canteen ARC CLI for the hackathon RPC, Arc docs context, and submission profile tooling.

## 1. Install the Canteen ARC CLI

Install `uv` if it is missing, then install the CLI:

```bash
curl -LsSf https://astral.sh/uv/install.sh -o /tmp/install-uv.sh
sh /tmp/install-uv.sh
PATH="$HOME/.local/bin:$PATH" uv tool install git+https://github.com/the-canteen-dev/ARC-cli
```

Verify the CLI:

```bash
PATH="$HOME/.local/bin:$PATH" arc-canteen --help
```

## 2. Login and sync Arc context

```bash
PATH="$HOME/.local/bin:$PATH" arc-canteen login
PATH="$HOME/.local/bin:$PATH" arc-canteen context sync
PATH="$HOME/.local/bin:$PATH" arc-canteen rpc eth_chainId
```

The expected Arc Testnet chain ID is `0x4cef52` / `5042002`.

## 3. Configure local environment

Copy `.env.example` to `.env`, then set the tokenized Canteen RPC URL locally:

```bash
cp .env.example .env
PATH="$HOME/.local/bin:$PATH" arc-canteen rpc-url
```

Paste the returned URL into `ARC_TESTNET_RPC_URL`. Do not commit the returned tokenized URL.

## 4. Install Foundry and verify contracts

```bash
curl -L https://foundry.paradigm.xyz -o /tmp/foundry-install.sh
bash /tmp/foundry-install.sh
PATH="$HOME/.foundry/bin:$PATH" foundryup
npm run contracts:build
npm run contracts:test
```

## 5. Deploy PrecallRegistry to Arc Testnet

Fund the deployer wallet with Arc Testnet USDC from https://faucet.circle.com first. Arc uses USDC as native gas, while the ERC-20 USDC interface at `0x3600000000000000000000000000000000000000` uses 6 decimals.

Use an encrypted Foundry account rather than committing or pasting private keys into scripts:

```bash
PATH="$HOME/.foundry/bin:$PATH" cast wallet import precall-deployer --interactive
PATH="$HOME/.foundry/bin:$PATH" forge create src/PrecallRegistry.sol:PrecallRegistry \
  --root packages/contracts \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --account precall-deployer \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
```

After deployment, set both `PRECALL_REGISTRY_ADDRESS` and `NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS` to the deployed contract address.

## Current Local Setup Status

- Canteen ARC CLI installed locally as `arc-canteen`.
- Canteen login completed for GitHub user `@Mrgtee`.
- Arc context synced to the local machine.
- Arc Testnet RPC verified with chain ID `0x4cef52`.
- Foundry installed locally with `forge` and `cast`.
- Contract build and tests pass locally.

## Still Needed From The Project Owner

- Complete the Canteen profile with Discord, Telegram, and preferred hackathon email.
- Provide Supabase Postgres `DATABASE_URL`.
- Provide an `OPENAI_API_KEY` from OpenAI or an OpenAI-compatible provider. For FreeModel also set `OPENAI_BASE_URL=https://api.freemodel.dev/v1` and a FreeModel model such as `gpt-5.4-mini`.
- Create or choose a deployer/agent wallet, fund it with Arc Testnet USDC, and import it as `precall-deployer`.
- Deploy `PrecallRegistry`, then set the registry address in local and hosting environment variables.
- Optional: provide Circle wallet/x402 credentials if paid enrichment should be enabled for live demos.
