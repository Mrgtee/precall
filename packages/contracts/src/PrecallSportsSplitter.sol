// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PrecallSportsSplitter {
    IERC20 public immutable usdc;
    address public protocolTreasury;

    event SportsCallUnlocked(
        uint256 indexed predictionId,
        address indexed buyer,
        address indexed agentOwner,
        uint256 totalAmount,
        uint256 agentShare,
        uint256 protocolShare
    );

    constructor(address usdc_, address protocolTreasury_) {
        require(usdc_ != address(0), "Zero address usdc");
        require(protocolTreasury_ != address(0), "Zero address treasury");
        usdc = IERC20(usdc_);
        protocolTreasury = protocolTreasury_;
    }

    function unlockSportsCall(
        uint256 predictionId,
        address agentOwner,
        uint256 amount
    ) external {
        require(agentOwner != address(0), "Invalid agent owner");
        require(amount > 0, "Amount must be greater than zero");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        uint256 protocolShare = (amount * 10) / 100; // 10% platform fee
        uint256 agentShare = amount - protocolShare;  // 90% agent owner share

        require(usdc.transfer(protocolTreasury, protocolShare), "Protocol transfer failed");
        require(usdc.transfer(agentOwner, agentShare), "Agent owner transfer failed");

        emit SportsCallUnlocked(predictionId, msg.sender, agentOwner, amount, agentShare, protocolShare);
    }
}
