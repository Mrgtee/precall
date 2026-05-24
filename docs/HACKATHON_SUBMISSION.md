# Precall Agora Hackathon Submission

## Project Summary

Precall is an Arc-native prediction-market intelligence arena. Autonomous market-agent roles scan live Polymarket YES/NO markets, identify mispriced opportunities, bond public calls with USDC on Arc Testnet, sell full reasoning traces through USDC unlocks, and build reputation after outcomes resolve. A separate Daily Sports Edge scans sports markets for non-bonded selected-outcome ideas so the demo can show daily market intelligence without weakening YES/NO settlement safety.

Core loop:

```text
live market -> verified evidence -> agent probability -> market edge -> bonded Arc call -> USDC unlock -> resolution -> leaderboard
```

## Agora Fit

Precall directly targets the hackathon theme: agents as market participants. The agent is not only writing analysis. It takes financial actions: pays for signal when x402 is enabled, bonds calls with USDC, and earns USDC thesis unlocks when users want deeper reasoning.

## Circle / Arc Usage

- Public market data comes from free Polymarket Gamma/CLOB endpoints and is not presented as paid.
- Paid agent evidence uses Circle Gateway/x402 through `@circle-fin/x402-batching` with a separate server-only `CIRCLE_AGENT_PRIVATE_KEY`. The first configured seller provider is AISA social evidence on `api.aisa.one`.
- Spending controls run before every paid request: seller host allowlist, per-request max, daily USDC budget, and minimum Gateway balance.
- Arc Testnet is the settlement and reputation layer. Arc USDC is used for call bonds and thesis unlock payments.
- The registry emits call, unlock, resolution, bond-return, and bond-slash events.
- `circle_actions` tracks real Circle-powered actions: `x402_api_payment`, `arc_bond`, and `thesis_unlock`, while legacy rows are still summarized safely.
- If Gateway/x402 is disabled or fails, Precall shows that honestly, records the failure when applicable, and continues with free evidence only.

## Agentic Sophistication

Precall runs separate role prompts for:

- `MacroScout` - macro and major event framing.
- `NewsHawk` - live news/event analysis.
- `CrowdPulse` - social and sentiment signals.
- `BookWatcher` - market microstructure and price quality.
- `Skeptic` - adversarial review.

Publishing requires Skeptic plus at least four valid votes. Every vote must reference supplied evidence IDs. Unknown evidence IDs are rejected. The model cannot invent source URLs.

## How Precall Uses Circle Agent Stack

The demo line is: "The agent does not just generate text. It uses Circle-powered financial rails: it pays for signal through Gateway/x402 when enabled, bonds its call with USDC on Arc, and sells reasoning access through USDC unlocks."

For judges, show the `/demo` Circle proof section. It displays Gateway enabled status, chain, allowed hosts, daily x402 spend, latest x402 payment/error, latest Arc bond tx, latest thesis unlock tx, and total Circle-powered activity. Empty states are real, not filler.

## Product Honesty

- V1 Arc-bonded calls support strict YES/NO markets only.
- Non-YES/NO sports markets can appear only on Daily Sports Edge as non-bonded ideas until selected-outcome resolution is generalized.
- Non-sports or low-quality markets are skipped with transparent reasons.
- Low-confidence sports signals may appear only as watchlist analysis, never as strong picks or guaranteed calls.
- Low-confidence or tiny-size bonded-call signals are stored as filtered runs, not presented as strong buys.
- The product does not custody user funds or place trades.
- The leaderboard does not overclaim quality before resolved calls exist.

## Current Traction Metrics To Show

Use `/demo` and `/admin` for the latest real numbers:

- total calls
- live calls
- expired/awaiting-resolution calls
- resolved calls
- thesis unlocks
- follows
- feedback
- unique wallets
- USDC unlock volume
- Circle action count

Frame these as real testnet activity, not inflated production traction.

## Three-Minute Video Script

1. Open `/demo` and show system status: DB, model, Arc registry, Circle Gateway/x402, counts, latest run, latest paid evidence payment, latest Arc bond, and latest unlock.
2. Open `/admin`, connect the whitelisted wallet, run health, then run the agent.
3. If a call publishes, show the Arc bond tx and the call page. If no call publishes, show filtered reasons and explain quality gates.
4. On the call page, show that pick direction, Polymarket link, thesis, evidence, sizing, and votes are locked.
5. Unlock the thesis with USDC on Arc and show the selected option, analysis, evidence, and unlock transaction.
6. Open `/sports` and show Daily Sports Edge ideas with selected options, risk level, reasoning, and no guarantee language.
7. Open `/leaderboard` and explain reputation activates after resolution.
8. Run `resolve` or show an awaiting-resolution call and explain the lifecycle.

## Demo Commands

```bash
npm run worker -- health
npm run worker -- run-once
npm run worker:sports
npm run worker -- expire
npm run worker -- resolve
npm test
npm run contracts:test
```

## Deployed URL

Production: https://precall-flax.vercel.app

## Arc Testnet Registry V2

Registry: `0x86Ad5f40b39a41607dda7d7816b2CfC2a817dF76`

Deploy tx: `0x212dd0eff10e18728267cfea556b2db51dcac2f32adfe6395e75a9158924fe92`

## Repository

GitHub: https://github.com/Mrgtee/precall

## Known Limitations

- Only strict YES/NO markets are supported for Arc-bonded calls in V1. Sports Edge is non-bonded until selected-outcome sports resolution is implemented.
- Gateway/x402 is optional and only visible as active when real credentials are configured and paid API calls succeed.
- User trade execution is manual through Polymarket links.
- A new `PrecallRegistry` deployment is required for V2 bond slashing/treasury behavior.
- Existing historical calls can remain as legacy rows with their original registry address.


### x402 Chain Negotiation

Precall keeps Arc Testnet as the settlement layer for bonded calls and thesis unlocks, while Gateway/x402 paid evidence can use Arc Testnet, Base Sepolia, Base, or any other seller-supported Gateway network. The worker checks candidate chains before paying, records the selected chain in `circle_actions`, and falls back honestly when paid evidence is unavailable unless required mode is deliberately enabled.
