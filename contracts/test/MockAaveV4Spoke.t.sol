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

    function test_FluctuatingAPY() public {
        // Initially, the base APY is 580 bps (5.8%)
        assertEq(spoke.baseAPY(), 580);
        
        // APY at block.timestamp = 0
        uint256 apy0 = spoke.supplyAPY();
        
        // Warp time by 30 seconds
        vm.warp(30);
        uint256 apy30 = spoke.supplyAPY();
        
        // Warp time by 60 seconds
        vm.warp(60);
        uint256 apy60 = spoke.supplyAPY();
        
        // Warp time by 90 seconds
        vm.warp(90);
        uint256 apy90 = spoke.supplyAPY();
        
        // Warp time should result in different values
        assertTrue(apy0 != apy30 || apy30 != apy60 || apy60 != apy90);
        
        // Check that the period works exactly
        uint256 uniqueSeed = uint256(uint160(address(spoke)));
        uint256 period = 120 + (uniqueSeed % 61);
        
        vm.warp(100);
        uint256 apy100 = spoke.supplyAPY();
        vm.warp(100 + period);
        uint256 apyLater = spoke.supplyAPY();
        assertEq(apy100, apyLater);
    }
}
