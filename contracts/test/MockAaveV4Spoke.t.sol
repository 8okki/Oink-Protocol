// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MockERC20} from "./Mocks.sol";
import {MockAaveV4Spoke} from "../src/MockAaveV4Spoke.sol";

contract MockAaveV4SpokeTest is Test {
    MockERC20 public usdc;
    MockAaveV4Spoke public spoke;
    address public owner = address(0x1);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        spoke = new MockAaveV4Spoke("Mock Plus Spoke", "mAV4Plus", usdc, 580, owner);
    }

    function test_StaticAPY() public {
        // Initially, the APY is 580 bps (5.8%)
        assertEq(spoke.supplyAPY(), 580);
        
        // Warp time by 30 seconds
        vm.warp(30);
        assertEq(spoke.supplyAPY(), 580);
        
        // Warp time by 60 seconds
        vm.warp(60);
        assertEq(spoke.supplyAPY(), 580);
        
        // Owner updates APY
        vm.prank(owner);
        spoke.setSupplyAPY(600);
        assertEq(spoke.supplyAPY(), 600);
    }
}
