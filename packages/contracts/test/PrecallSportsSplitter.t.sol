// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../src/PrecallSportsSplitter.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount, "balance"); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(balanceOf[from] >= amount, "balance"); require(allowance[from][msg.sender] >= amount, "allowance"); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

contract PrecallSportsSplitterTest {
    MockUSDC usdc;
    PrecallSportsSplitter splitter;
    address protocolTreasury = address(0xAAAA);
    address agentOwner = address(0xBBBB);

    function setUp() public {
        usdc = new MockUSDC();
        splitter = new PrecallSportsSplitter(address(usdc), protocolTreasury);
    }

    function testUnlockSportsCallSplitsUSDC() public {
        uint256 amount = 100_000; // e.g. 0.1 USDC
        
        usdc.mint(address(this), amount);
        usdc.approve(address(splitter), amount);

        splitter.unlockSportsCall(123, agentOwner, amount);

        require(usdc.balanceOf(protocolTreasury) == 10_000, "10% to treasury");
        require(usdc.balanceOf(agentOwner) == 90_000, "90% to agent owner");
        require(usdc.balanceOf(address(this)) == 0, "buyer spent all");
        require(usdc.balanceOf(address(splitter)) == 0, "splitter holds zero");
    }

    function testRevertCases() public {
        // Test Zero Address Agent Owner
        usdc.mint(address(this), 100_000);
        usdc.approve(address(splitter), 100_000);
        
        // Use a low-level call to check for revert to avoid using deprecated testFail syntax
        (bool ok1,) = address(splitter).call(abi.encodeWithSelector(PrecallSportsSplitter.unlockSportsCall.selector, 123, address(0), 100_000));
        require(!ok1, "zero address owner must fail");

        // Test Zero Amount
        (bool ok2,) = address(splitter).call(abi.encodeWithSelector(PrecallSportsSplitter.unlockSportsCall.selector, 123, agentOwner, 0));
        require(!ok2, "zero amount must fail");
    }
}
