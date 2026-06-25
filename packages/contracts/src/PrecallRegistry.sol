// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PrecallRegistry {
    struct Agent {
        address owner;
        string name;
        string metadataURI;
        bool active;
        uint256 callsPublished;
        uint256 callsResolved;
        uint256 brierScoreTotalBps;
    }

    struct MarketCall {
        uint256 agentId;
        string marketId;
        uint8 selectedOutcomeIndex;
        uint16 marketPriceBps;
        uint16 agentProbabilityBps;
        uint16 confidenceBps;
        uint64 expiry;
        bytes32 thesisHash;
        bytes32 evidenceHash;
        uint256 bondAmount;
        uint256 unlockPrice;
        address publisher;
        bool resolved;
        uint8 resolvedOutcomeIndex;
        bool isPush;
        int256 realizedPnlBps;
        uint16 brierScoreBps;
    }

    IERC20 public immutable usdc;
    address public owner;
    address public resolver;
    address public protocolTreasury;
    uint256 public nextAgentId = 1;
    uint256 public nextCallId = 1;

    mapping(uint256 => Agent) public agents;
    mapping(uint256 => MarketCall) public calls;
    mapping(uint256 => mapping(address => bool)) public thesisUnlocked;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, string metadataURI);
    event AgentActiveSet(uint256 indexed agentId, bool active);
    event ResolverSet(address indexed resolver);
    event ProtocolTreasurySet(address indexed protocolTreasury);
    event CallPublished(uint256 indexed callId, uint256 indexed agentId, address indexed publisher, string marketId, uint8 selectedOutcomeIndex, uint256 bondAmount, uint256 unlockPrice);
    event ThesisUnlocked(uint256 indexed callId, address indexed buyer, uint256 amount);
    event BondReturned(uint256 indexed callId, address indexed publisher, uint256 amount);
    event BondSlashed(uint256 indexed callId, address indexed treasury, uint256 amount);
    event CallResolved(uint256 indexed callId, uint8 resolvedOutcomeIndex, bool isPush, int256 realizedPnlBps, uint16 brierScoreBps, bool bondReturned);

    error NotOwner();
    error NotResolver();
    error AgentNotActive();
    error NotAgentOwner();
    error InvalidBps();
    error InvalidDirection();
    error AlreadyUnlocked();
    error AlreadyResolved();
    error TransferFailed();
    error ZeroAddress();

    constructor(address usdc_, address protocolTreasury_) {
        if (usdc_ == address(0) || protocolTreasury_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        owner = msg.sender;
        resolver = msg.sender;
        protocolTreasury = protocolTreasury_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != owner && msg.sender != resolver) revert NotResolver();
        _;
    }

    function setResolver(address resolver_) external onlyOwner {
        if (resolver_ == address(0)) revert ZeroAddress();
        resolver = resolver_;
        emit ResolverSet(resolver_);
    }

    function setProtocolTreasury(address protocolTreasury_) external onlyOwner {
        if (protocolTreasury_ == address(0)) revert ZeroAddress();
        protocolTreasury = protocolTreasury_;
        emit ProtocolTreasurySet(protocolTreasury_);
    }

    function registerAgent(string calldata name, string calldata metadataURI) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({ owner: msg.sender, name: name, metadataURI: metadataURI, active: true, callsPublished: 0, callsResolved: 0, brierScoreTotalBps: 0 });
        emit AgentRegistered(agentId, msg.sender, name, metadataURI);
    }

    function setAgentActive(uint256 agentId, bool active) external {
        Agent storage agent = agents[agentId];
        if (msg.sender != owner && msg.sender != agent.owner) revert NotAgentOwner();
        agent.active = active;
        emit AgentActiveSet(agentId, active);
    }

    function publishCall(uint256 agentId, string calldata marketId, uint8 selectedOutcomeIndex, uint16 marketPriceBps, uint16 agentProbabilityBps, uint16 confidenceBps, uint64 expiry, bytes32 thesisHash, bytes32 evidenceHash, uint256 bondAmount, uint256 unlockPrice) external returns (uint256 callId) {
        Agent storage agent = agents[agentId];
        if (!agent.active) revert AgentNotActive();
        if (msg.sender != agent.owner) revert NotAgentOwner();
        if (marketPriceBps > 10_000 || agentProbabilityBps > 10_000 || confidenceBps > 10_000) revert InvalidBps();
        if (bondAmount > 0 && !usdc.transferFrom(msg.sender, address(this), bondAmount)) revert TransferFailed();

        callId = nextCallId++;
        calls[callId] = MarketCall({ agentId: agentId, marketId: marketId, selectedOutcomeIndex: selectedOutcomeIndex, marketPriceBps: marketPriceBps, agentProbabilityBps: agentProbabilityBps, confidenceBps: confidenceBps, expiry: expiry, thesisHash: thesisHash, evidenceHash: evidenceHash, bondAmount: bondAmount, unlockPrice: unlockPrice, publisher: msg.sender, resolved: false, resolvedOutcomeIndex: 0, isPush: false, realizedPnlBps: 0, brierScoreBps: 0 });
        agent.callsPublished += 1;
        emit CallPublished(callId, agentId, msg.sender, marketId, selectedOutcomeIndex, bondAmount, unlockPrice);
    }

    function unlockThesis(uint256 callId) external {
        MarketCall storage marketCall = calls[callId];
        if (thesisUnlocked[callId][msg.sender]) revert AlreadyUnlocked();
        thesisUnlocked[callId][msg.sender] = true;
        if (marketCall.unlockPrice > 0 && !usdc.transferFrom(msg.sender, marketCall.publisher, marketCall.unlockPrice)) revert TransferFailed();
        emit ThesisUnlocked(callId, msg.sender, marketCall.unlockPrice);
    }

    function resolveCall(uint256 callId, uint8 resolvedOutcomeIndex, bool isPush, int256 realizedPnlBps, uint16 brierScoreBps) external onlyResolver {
        MarketCall storage marketCall = calls[callId];
        if (marketCall.resolved) revert AlreadyResolved();
        if (brierScoreBps > 10_000) revert InvalidBps();

        marketCall.resolved = true;
        marketCall.resolvedOutcomeIndex = resolvedOutcomeIndex;
        marketCall.isPush = isPush;
        marketCall.realizedPnlBps = realizedPnlBps;
        marketCall.brierScoreBps = brierScoreBps;

        Agent storage agent = agents[marketCall.agentId];
        agent.callsResolved += 1;
        agent.brierScoreTotalBps += brierScoreBps;

        bool directionCorrect = !isPush && (marketCall.selectedOutcomeIndex == resolvedOutcomeIndex);
        if (marketCall.bondAmount > 0) {
            if (isPush || directionCorrect) {
                if (!usdc.transfer(marketCall.publisher, marketCall.bondAmount)) revert TransferFailed();
                emit BondReturned(callId, marketCall.publisher, marketCall.bondAmount);
            } else {
                if (!usdc.transfer(protocolTreasury, marketCall.bondAmount)) revert TransferFailed();
                emit BondSlashed(callId, protocolTreasury, marketCall.bondAmount);
            }
        }
        emit CallResolved(callId, resolvedOutcomeIndex, isPush, realizedPnlBps, brierScoreBps, (isPush || directionCorrect));
    }
}
