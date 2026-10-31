// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RewardEscrow} from "../src/RewardEscrow.sol";

contract Rejector {
    receive() external payable {
        revert();
    }
}

contract RewardEscrowTest is Test {
    RewardEscrow escrow;
    address registry = makeAddr("registry");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(10 days);
        escrow = new RewardEscrow(address(this));
        escrow.setRegistry(registry);
        vm.deal(address(escrow), 1 ether);
    }

    function _pay(address to) internal returns (uint256) {
        vm.prank(registry);
        return escrow.payReward(to);
    }

    function test_PaysReward() public {
        assertEq(_pay(alice), 0.001 ether);
        assertEq(alice.balance, 0.001 ether);
    }

    function test_OnlyRegistryCanPay() public {
        vm.expectRevert(RewardEscrow.OnlyRegistry.selector);
        escrow.payReward(alice);
    }

    function test_RegistryCanOnlyBeSetOnce() public {
        vm.expectRevert(RewardEscrow.RegistryAlreadySet.selector);
        escrow.setRegistry(alice);
    }

    function test_DailyCapEnforcedThenResets() public {
        for (uint256 i = 0; i < 10; i++) {
            assertEq(_pay(alice), 0.001 ether);
        }
        vm.expectEmit(true, false, false, true);
        emit RewardEscrow.RewardSkipped(alice, 0.001 ether, RewardEscrow.SkipReason.DailyCap);
        assertEq(_pay(alice), 0);
        assertEq(alice.balance, 0.01 ether);

        vm.warp(block.timestamp + 1 days);
        assertEq(_pay(alice), 0.001 ether);
    }

    function test_SkipsWhenBalanceLow() public {
        escrow.withdraw(payable(makeAddr("sink")), 1 ether);
        vm.expectEmit(true, false, false, true);
        emit RewardEscrow.RewardSkipped(alice, 0.001 ether, RewardEscrow.SkipReason.LowBalance);
        assertEq(_pay(alice), 0);
    }

    function test_SkipsWhenPaused() public {
        escrow.pause();
        assertEq(_pay(alice), 0);
        escrow.unpause();
        assertEq(_pay(alice), 0.001 ether);
    }

    function test_FailedTransferSkipsAndDoesNotCountAgainstCap() public {
        address rejector = address(new Rejector());
        assertEq(_pay(rejector), 0);
        assertEq(escrow.paidOnDay(rejector, block.timestamp / 1 days), 0);
    }

    function test_OwnerControls() public {
        escrow.setReward(0.002 ether);
        assertEq(_pay(alice), 0.002 ether);

        escrow.setDailyCap(0);
        assertEq(_pay(alice), 0);

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setReward(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.withdraw(payable(alice), 1);
        vm.stopPrank();
    }
}
