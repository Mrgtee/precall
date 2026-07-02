import assert from "assert";

async function run() {
  const url = "http://localhost:3002/api/v1/soccer/predictions";
  console.log(`[Test] Sending unpaid request to ${url}...`);

  const response = await fetch(url, { method: "GET" });
  console.log(`[Test] Status Code: ${response.status} (Expected: 402)`);
  assert.strictEqual(response.status, 402, "Expected 402 Payment Required");

  const challengeHeader = response.headers.get("payment-required");
  assert.ok(challengeHeader, "Missing 'payment-required' response header");
  console.log("[Test] Header found. Decoding payment challenge...");

  const rawJson = Buffer.from(challengeHeader, "base64").toString("utf-8");
  const challenge = JSON.parse(rawJson);

  console.log("[Test] Decoded Challenge Details:", JSON.stringify(challenge, null, 2));

  assert.strictEqual(challenge.x402Version, 2, "Expected x402 protocol Version 2");
  assert.ok(challenge.resource, "Expected resource info");
  assert.strictEqual(challenge.resource.description, "Precall Soccer Prediction Intelligence API");
  assert.ok(challenge.accepts && challenge.accepts.length > 0, "Expected at least one accepted payment option");

  console.log("\n[SUCCESS] Unpaid 402 challenge verification test passed!");
}

run().catch((err) => {
  console.error("\n[FAIL] Test failed:", err.message);
  process.exit(1);
});
