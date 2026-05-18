export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const precallRegistryAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "publishCall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "marketId", type: "string" },
      { name: "direction", type: "uint8" },
      { name: "marketPriceBps", type: "uint16" },
      { name: "agentProbabilityBps", type: "uint16" },
      { name: "confidenceBps", type: "uint16" },
      { name: "expiry", type: "uint64" },
      { name: "thesisHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "bondAmount", type: "uint256" },
      { name: "unlockPrice", type: "uint256" },
    ],
    outputs: [{ name: "callId", type: "uint256" }],
  },
  {
    type: "function",
    name: "unlockThesis",
    stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveCall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "callId", type: "uint256" },
      { name: "outcomeYes", type: "bool" },
      { name: "realizedPnlBps", type: "int256" },
      { name: "brierScoreBps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CallPublished",
    inputs: [
      { name: "callId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "publisher", type: "address", indexed: true },
      { name: "marketId", type: "string", indexed: false },
      { name: "direction", type: "uint8", indexed: false },
      { name: "bondAmount", type: "uint256", indexed: false },
      { name: "unlockPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ThesisUnlocked",
    inputs: [
      { name: "callId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CallResolved",
    inputs: [
      { name: "callId", type: "uint256", indexed: true },
      { name: "outcomeYes", type: "bool", indexed: false },
      { name: "realizedPnlBps", type: "int256", indexed: false },
      { name: "brierScoreBps", type: "uint16", indexed: false },
      { name: "bondReturned", type: "bool", indexed: false },
    ],
  },
] as const;
