// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../src/PrecallRegistry.sol";

contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract Actor {
    function register(PrecallRegistry registry) external returns (uint256) {
        return registry.registerAgent("MacroScout", "ipfs://agent");
    }

    function approve(MockUSDC usdc, address spender, uint256 amount) external {
        usdc.approve(spender, amount);
    }

    function publish(PrecallRegistry registry, uint256 agentId) external returns (uint256) {
        return registry.publishCall(
            agentId,
            "market-1",
            1,
            4200,
            6100,
            7500,
            uint64(block.timestamp + 7 days),
            keccak256("thesis"),
            keccak256("evidence"),
            1_000_000,
            50_000
        );
    }

    function unlock(PrecallRegistry registry, uint256 callId) external {
        registry.unlockThesis(callId);
    }
}

contract PrecallRegistryTest {
    function testPublishUnlockResolve() public {
        MockUSDC usdc = new MockUSDC();
        PrecallRegistry registry = new PrecallRegistry(address(usdc));
        Actor publisher = new Actor();
        Actor buyer = new Actor();

        usdc.mint(address(publisher), 2_000_000);
        usdc.mint(address(buyer), 100_000);

        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId);

        require(usdc.balanceOf(address(registry)) == 1_000_000, "bond locked");

        buyer.approve(usdc, address(registry), 50_000);
        buyer.unlock(registry, callId);
        require(usdc.balanceOf(address(publisher)) == 1_050_000, "unlock paid publisher");

        registry.resolveCall(callId, true, 2200, 1521);
        require(usdc.balanceOf(address(publisher)) == 2_050_000, "bond returned");
    }

    function testDuplicateUnlockReverts() public {
        MockUSDC usdc = new MockUSDC();
        PrecallRegistry registry = new PrecallRegistry(address(usdc));
        Actor publisher = new Actor();
        Actor buyer = new Actor();

        usdc.mint(address(publisher), 1_000_000);
        usdc.mint(address(buyer), 100_000);
        uint256 agentId = publisher.register(registry);
        publisher.approve(usdc, address(registry), 1_000_000);
        uint256 callId = publisher.publish(registry, agentId);

        buyer.approve(usdc, address(registry), 100_000);
        buyer.unlock(registry, callId);

        (bool ok,) = address(buyer).call(abi.encodeWithSelector(Actor.unlock.selector, registry, callId));
        require(!ok, "duplicate unlock must revert");
    }
}
