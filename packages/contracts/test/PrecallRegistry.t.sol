// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../src/PrecallRegistry.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount, "balance"); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(balanceOf[from] >= amount, "balance"); require(allowance[from][msg.sender] >= amount, "allowance"); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

contract Actor {
    function approve(MockUSDC usdc, address spender, uint256 amount) external { usdc.approve(spender, amount); }
    function register(PrecallRegistry registry) external returns (uint256) { return registry.registerAgent("MacroScout", "ipfs://agent"); }
    function publish(PrecallRegistry registry, uint256 agentId, uint8 selectedOutcomeIndex) external returns (uint256) {
        return registry.publishCall(agentId, "market-1", selectedOutcomeIndex, 4000, 6500, 6500, uint64(block.timestamp + 1 days), bytes32("thesis"), bytes32("evidence"), 1_000_000, 50_000);
    }
    function unlock(PrecallRegistry registry, uint256 callId) external { registry.unlockThesis(callId); }
    function resolve(PrecallRegistry registry, uint256 callId, uint8 resolvedOutcomeIndex, bool isPush) external { registry.resolveCall(callId, resolvedOutcomeIndex, isPush, 2500, 1225); }
}

contract PrecallRegistryTest {
    MockUSDC usdc;
    Actor publisher;
    Actor buyer;
    Actor resolver;
    address treasury = address(0xBEEF);

    function setUp() public {
        usdc = new MockUSDC();
        publisher = new Actor();
        buyer = new Actor();
        resolver = new Actor();
        usdc.mint(address(publisher), 10_000_000);
        usdc.mint(address(buyer), 10_000_000);
    }

    function testPublishUnlockResolveReturnsCorrectBond() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId, 1);
        require(usdc.balanceOf(address(registry)) == 1_000_000, "bond locked");
        buyer.approve(usdc, address(registry), 50_000);
        buyer.unlock(registry, callId);
        require(usdc.balanceOf(address(publisher)) == 9_050_000, "unlock paid publisher");
        registry.resolveCall(callId, 1, false, 2500, 1225);
        require(usdc.balanceOf(address(publisher)) == 10_050_000, "correct bond returned");
        require(usdc.balanceOf(treasury) == 0, "treasury unchanged");
    }

    function testWrongCallSlashesBond() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId, 1);
        registry.resolveCall(callId, 2, false, -10000, 6500);
        require(usdc.balanceOf(treasury) == 1_000_000, "wrong bond slashed");
    }

    function testPushReturnsBond() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId, 1);
        registry.resolveCall(callId, 2, true, 0, 0); // push/voided
        require(usdc.balanceOf(address(publisher)) == 10_000_000, "bond returned on push");
        require(usdc.balanceOf(treasury) == 0, "treasury unchanged on push");
    }

    function testDuplicateUnlockReverts() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId, 1);
        buyer.approve(usdc, address(registry), 100_000);
        buyer.unlock(registry, callId);
        (bool ok,) = address(buyer).call(abi.encodeWithSelector(Actor.unlock.selector, registry, callId));
        require(!ok, "duplicate unlock must revert");
    }

    function testNonResolverCannotResolveAndCannotResolveTwice() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId, 1);
        (bool nonResolverOk,) = address(resolver).call(abi.encodeWithSelector(Actor.resolve.selector, registry, callId, uint8(1), false));
        require(!nonResolverOk, "non resolver must fail");
        registry.resolveCall(callId, 1, false, 2500, 1225);
        (bool secondOk,) = address(registry).call(abi.encodeWithSelector(PrecallRegistry.resolveCall.selector, callId, uint8(1), false, int256(2500), uint16(1225)));
        require(!secondOk, "second resolve must fail");
    }

    function testSetProtocolTreasury() public {
        PrecallRegistry registry = new PrecallRegistry(address(usdc), treasury);
        registry.setProtocolTreasury(address(0xCAFE));
        require(registry.protocolTreasury() == address(0xCAFE), "treasury updated");
    }
}
