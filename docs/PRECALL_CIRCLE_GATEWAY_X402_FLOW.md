# Precall Circle Gateway x402 Payment Flow

![Precall Circle Gateway x402 Payment Flow](./precall-circle-gateway-x402-flow.svg)

1. **Fund Gateway:** The Precall agent wallet deposits USDC into the Circle Gateway Wallet.
2. **Approve a Candidate:** Paid evidence is requested only after a soccer market passes Precall's quality gates.
3. **Request Evidence:** The worker calls Gateway-batched Circle Marketplace services such as AISA Twitter/X social search.
4. **Receive HTTP 402:** The seller returns its USDC amount, supported network, and payment scheme. Gateway-batched evidence proceeds through this Gateway flow.
5. **Apply Controls:** Precall validates the seller host, payment network, batching scheme, request cap, daily budget, and Gateway balance. A failed check stops before signing, so no funds move.
6. **Sign and Retry:** The server-only agent wallet signs the x402 payment authorization locally without exposing its private key, and the wrapped request retries automatically.
7. **Settle USDC:** The seller's x402 middleware uses the Circle facilitator to verify the authorization and settle from the Gateway balance.
8. **Receive Confirmation:** Circle Gateway returns the payment reference after settlement.
9. **Receive Evidence:** Compatible paid marketplace providers return source-backed evidence to Precall.
10. **Record and Analyze:** Precall stores the provider, amount, network, payment scheme, payment reference, transaction reference, and evidence before the Sports Council analyzes it.

Standard exact x402 sellers such as Parallel and Firecrawl are paid from normal Base wallet USDC instead of the Gateway balance, but they use the same host allowlist, spend caps, evidence quality gate, and `circle_actions` audit trail.
