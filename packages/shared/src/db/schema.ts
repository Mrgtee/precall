import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name"),
  referralSource: text("referral_source"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  onchainAgentId: integer("onchain_agent_id").unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  ownerWallet: text("owner_wallet").notNull(),
  metadataUri: text("metadata_uri").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const markets = pgTable(
  "markets",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    marketId: text("market_id").notNull(),
    conditionId: text("condition_id").notNull().default(""),
    slug: text("slug").notNull().default(""),
    title: text("title").notNull(),
    url: text("url").notNull(),
    outcomes: jsonb("outcomes").$type<string[]>().notNull(),
    closeTime: timestamp("close_time", { withTimezone: true }),
    liquidityUsd: numeric("liquidity_usd", { precision: 18, scale: 6 }).notNull().default("0"),
    status: text("status").notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sourceMarketIdx: uniqueIndex("markets_source_market_idx").on(table.source, table.marketId),
    statusIdx: index("markets_status_idx").on(table.status),
  }),
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: serial("id").primaryKey(),
    marketId: text("market_id").notNull(),
    yesPriceBps: integer("yes_price_bps").notNull(),
    noPriceBps: integer("no_price_bps").notNull(),
    spreadBps: integer("spread_bps").notNull(),
    depthUsd: numeric("depth_usd", { precision: 18, scale: 6 }).notNull().default("0"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    marketIdx: index("market_snapshots_market_idx").on(table.marketId),
  }),
);

export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    onchainCallId: integer("onchain_call_id"),
    agentId: integer("agent_id").notNull(),
    marketId: text("market_id").notNull(),
    action: text("action").notNull(),
    marketPriceBps: integer("market_price_bps").notNull(),
    agentProbabilityBps: integer("agent_probability_bps").notNull(),
    yesProbabilityBps: integer("yes_probability_bps").notNull().default(0),
    edgeBps: integer("edge_bps").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    suggestedSizeBps: integer("suggested_size_bps").notNull(),
    thesisHash: text("thesis_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    thesis: text("thesis").notNull(),
    counterarguments: jsonb("counterarguments").$type<string[]>().notNull(),
    bondAmount: numeric("bond_amount", { precision: 18, scale: 6 }).notNull(),
    unlockPrice: numeric("unlock_price", { precision: 18, scale: 6 }).notNull(),
    status: text("status").notNull().default("draft"),
    statusReason: text("status_reason").notNull().default(""),
    marketType: text("market_type").notNull().default("strict_yes_no"),
    registryAddress: text("registry_address").notNull().default(""),
    legacy: boolean("legacy").notNull().default(false),
    txHash: text("tx_hash"),
    copyUrl: text("copy_url").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    marketIdx: index("calls_market_idx").on(table.marketId),
    statusIdx: index("calls_status_idx").on(table.status),
    registryOnchainIdx: uniqueIndex("calls_registry_onchain_call_idx").on(table.registryAddress, table.onchainCallId),
  }),
);

export const evidenceItems = pgTable("evidence_items", {
  id: serial("id").primaryKey(),
  callId: integer("call_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  credibilityScore: integer("credibility_score").notNull(),
  evidenceId: text("evidence_id").notNull().default(""),
  sourceType: text("source_type").notNull().default("polymarket_market"),
  provider: text("provider").notNull().default(""),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  paid: boolean("paid").notNull().default(false),
  paymentAmountUsdc: numeric("payment_amount_usdc", { precision: 18, scale: 6 }),
  paymentNetwork: text("payment_network"),
  paymentRef: text("payment_ref"),
  txHash: text("tx_hash"),
  metadata: jsonb("metadata"),
});

export const thesisUnlocks = pgTable(
  "thesis_unlocks",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id").notNull(),
    userWallet: text("user_wallet").notNull(),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    txHash: text("tx_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    callWalletIdx: uniqueIndex("thesis_unlocks_call_wallet_idx").on(
      table.callId,
      table.userWallet,
    ),
  }),
);

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  model: text("model").notNull(),
  inputs: jsonb("inputs").notNull(),
  outputs: jsonb("outputs"),
  costs: jsonb("costs"),
  failure: text("failure"),
  publishedCallId: integer("published_call_id"),
  evidenceContext: jsonb("evidence_context"),
  retryCount: integer("retry_count").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resolutions = pgTable("resolutions", {
  id: serial("id").primaryKey(),
  callId: integer("call_id").notNull().unique(),
  finalOutcome: text("final_outcome").notNull(),
  finalPriceBps: integer("final_price_bps").notNull(),
  roiBps: integer("roi_bps").notNull(),
  brierScoreBps: integer("brier_score_bps").notNull(),
  resolverTx: text("resolver_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const follows = pgTable(
  "follows",
  {
    id: serial("id").primaryKey(),
    userWallet: text("user_wallet").notNull(),
    agentId: integer("agent_id").notNull(),
    signature: text("signature"),
    signedMessage: text("signed_message"),
    signatureStatus: text("signature_status").notNull().default("legacy_unsigned"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    followIdx: uniqueIndex("follows_wallet_agent_idx").on(table.userWallet, table.agentId),
  }),
);

export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id"),
    agentId: integer("agent_id"),
    userWallet: text("user_wallet"),
    sentiment: text("sentiment").notNull(),
    comment: text("comment").notNull().default(""),
    context: text("context").notNull().default(""),
    signature: text("signature"),
    signedMessage: text("signed_message"),
    signatureStatus: text("signature_status").notNull().default("legacy_unsigned"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    callIdx: index("feedback_call_idx").on(table.callId),
    agentIdx: index("feedback_agent_idx").on(table.agentId),
  }),
);

export const adminWallets = pgTable(
  "admin_wallets",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull().unique(),
    active: boolean("active").notNull().default(true),
    label: text("label").notNull().default(""),
    addedBy: text("added_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    walletIdx: uniqueIndex("admin_wallets_wallet_idx").on(table.walletAddress),
    activeIdx: index("admin_wallets_active_idx").on(table.active),
  }),
);

export const circleActions = pgTable(
  "circle_actions",
  {
    id: serial("id").primaryKey(),
    actionType: text("action_type").notNull(),
    provider: text("provider").notNull().default(""),
    url: text("url"),
    walletAddress: text("wallet_address").notNull().default(""),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull().default("0"),
    amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }).notNull().default("0"),
    chain: text("chain").notNull().default("Arc Testnet"),
    txHash: text("tx_hash"),
    paymentReference: text("payment_reference"),
    paymentRef: text("payment_ref"),
    relatedMarketId: text("related_market_id"),
    relatedCallId: integer("related_call_id"),
    agentRunId: integer("agent_run_id"),
    relatedAgentRunId: integer("related_agent_run_id"),
    status: text("status").notNull().default("success"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actionTypeIdx: index("circle_actions_action_type_idx").on(table.actionType),
    callIdx: index("circle_actions_call_idx").on(table.relatedCallId),
    marketIdx: index("circle_actions_market_idx").on(table.relatedMarketId),
  }),
);
