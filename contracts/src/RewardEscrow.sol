// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract RewardEscrow is Ownable, Pausable {
    error OnlyRegistry();
    error RegistryAlreadySet();
    error WithdrawFailed();

    enum SkipReason { Paused, DailyCap, LowBalance, TransferFailed }

    event RewardSkipped(address indexed to, uint256 amount, SkipReason reason);
    event RewardSent(address indexed to, uint256 amount);

    uint256 public reward = 0.001 ether;
    uint256 public dailyCap = 0.01 ether;
    address public registry;

    mapping(address to => mapping(uint256 day => uint256)) public paidOnDay;

    constructor(address owner_) Ownable(owner_) {}

    receive() external payable {}

    function setRegistry(address registry_) external onlyOwner {
        if (registry != address(0)) revert RegistryAlreadySet();
        registry = registry_;
    }

    function setReward(uint256 reward_) external onlyOwner {
        reward = reward_;
    }

    function setDailyCap(uint256 dailyCap_) external onlyOwner {
        dailyCap = dailyCap_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    /// Returns the amount paid. Skips rather than reverts, so the escrow never blocks memory writes.
    function payReward(address to) external returns (uint256) {
        if (msg.sender != registry) revert OnlyRegistry();

        uint256 amount = reward;
        uint256 day = block.timestamp / 1 days;

        if (paused()) return _skip(to, amount, SkipReason.Paused);
        if (paidOnDay[to][day] + amount > dailyCap) return _skip(to, amount, SkipReason.DailyCap);
        if (address(this).balance < amount) return _skip(to, amount, SkipReason.LowBalance);

        paidOnDay[to][day] += amount;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            paidOnDay[to][day] -= amount;
            return _skip(to, amount, SkipReason.TransferFailed);
        }
        emit RewardSent(to, amount);
        return amount;
    }

    function _skip(address to, uint256 amount, SkipReason reason) private returns (uint256) {
        emit RewardSkipped(to, amount, reason);
        return 0;
    }
}
