# Precall Agora Hackathon Submission

## Project Summary

Precall is an Arc-native prediction-market intelligence arena. Autonomous market-agent roles scan live Polymarket YES/NO markets, identify mispriced opportunities, bond public calls with USDC on Arc Testnet, sell full reasoning traces through USDC unlocks, and build reputation after outcomes resolve.

Core loop:

```text
live market -> verified evidence -> agent probability -> market edge -> bonded Arc call -> USDC unlock -> resolution -> leaderboard
```

## Agora Fit

Precall directly targets the hackathon theme: agents as market participants. The agent is not only writing analysis. It takes financial actions: pays for signal when x402 is enabled, bonds calls with USDC, and earns USDC thesis unlocks when users want deeper reasoning.

## Circle / Arc Usage

- Arc Testnet is the settlement and reputation layer.
- Arc USDC is used for call bonds and thesis unlock payments.
- The registry emits call, unlock, resolution, bond-return, and bond-slash events.
- `circle_actions` tracks real Circle-powered actions: `bond_call`, `unlock_thesis`, and `x402_evidence_payment`.
- Optional Circle/x402 enrichment is visible in health/demo/status panels and disabled honestly when not configured.

## Agentic Sophistication

Precall runs separate role prompts for:

- `MacroScout` - macro and major event framing.
- `NewsHawk` - live news/event analysis.
- `CrowdPulse` - social and sentiment signals.
- `BookWatcher` - market microstructure and price quality.
- `Skeptic` - adversarial review.

Publishing requires Skeptic plus at least four valid votes. Every vote must reference supplied evidence IDs. Unknown evidence IDs are rejected. The model cannot invent source URLs.

## Product Honesty

- V1 supports strict YES/NO markets only.
- Non-YES/NO markets are skipped with transparent reasons.
- Low-confidence or tiny-size signals are stored as filtered runs, not presented as strong buys.
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

1. Open `/demo` and show system status: DB, model, Arc registry, Circle/x402, counts, latest run, and latest unlock.
2. Open `/admin`, connect the whitelisted wallet, run health, then run the agent.
3. If a call publishes, show the Arc bond tx and the call page. If no call publishes, show filtered reasons and explain quality gates.
4. On the call page, explain YES probability versus selected-side probability, evidence IDs, confidence, edge, and suggested size.
5. Unlock the thesis with USDC on Arc and show the unlock transaction.
6. Open `/leaderboard` and explain reputation activates after resolution.
7. Run `resolve` or show an awaiting-resolution call and explain the lifecycle.

## Demo Commands

```bash
npm run worker -- health
npm run worker -- run-once
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

- Only strict YES/NO markets are supported in V1.
- x402 is optional and only visible as active when real credentials are configured and calls succeed.
- User trade execution is manual through Polymarket links.
- A new `PrecallRegistry` deployment is required for V2 bond slashing/treasury behavior.
- Existing historical calls can remain as legacy rows with their original registry address.
