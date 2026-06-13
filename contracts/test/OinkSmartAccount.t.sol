// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/OinkSmartAccount.sol";
import "../src/MockERC20.sol";
import "../src/MockOinkVault.sol";

contract OinkSmartAccountTest is Test {
    OinkSmartAccount public account;
    MockERC20 public usdc;
    MockOinkVault public vault;
    
    address public owner = address(0x1);
    address public entryPoint = address(0x2);
    address public merchant = address(0x3);
    address public stranger = address(0x4);
    
    uint256 public constant INITIAL_BALANCE = 100 * 1e6; // 100 USDC (6 decimals)

    function setUp() public {
        // Deploy Mock USDC with 6 decimals
        usdc = new MockERC20("USD Coin", "USDC", 6);
        
        // Deploy Mock OinkVault
        vault = new MockOinkVault(address(usdc), "Oink Vault Token", "oUSDC");
        
        // Deploy OinkSmartAccount
        account = new OinkSmartAccount(owner, entryPoint, address(usdc));
        
        // Mint initial USDC to smart account
        usdc.mint(address(account), INITIAL_BALANCE);
    }

    function test_InitialState() public {
        assertEq(account.owner(), owner);
        assertEq(account.entryPoint(), entryPoint);
        assertEq(account.usdcToken(), address(usdc));
        assertEq(account.oinkVault(), address(0));
        assertFalse(account.oinkEnabled());
        assertEq(uint(account.policy()), uint(OinkSmartAccount.RoundingPolicy.NearestInteger));
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE);
    }

    function test_AdminFunctions_Success() public {
        vm.startPrank(owner);
        
        account.setOinkVault(address(vault));
        assertEq(account.oinkVault(), address(vault));
        
        account.setOinkEnabled(true);
        assertTrue(account.oinkEnabled());
        
        account.setRoundingPolicy(OinkSmartAccount.RoundingPolicy.None);
        assertEq(uint(account.policy()), uint(OinkSmartAccount.RoundingPolicy.None));
        
        account.setUsdcToken(address(0x99));
        assertEq(account.usdcToken(), address(0x99));
        
        account.setOwner(address(0x100));
        assertEq(account.owner(), address(0x100));
        
        vm.stopPrank();
    }

    function test_AdminFunctions_Revert_NonOwner() public {
        vm.startPrank(stranger);
        
        vm.expectRevert("Only owner");
        account.setOinkVault(address(vault));
        
        vm.expectRevert("Only owner");
        account.setOinkEnabled(true);
        
        vm.expectRevert("Only owner");
        account.setRoundingPolicy(OinkSmartAccount.RoundingPolicy.None);
        
        vm.expectRevert("Only owner");
        account.setUsdcToken(address(usdc));
        
        vm.expectRevert("Only owner");
        account.setOwner(address(0x100));
        
        vm.stopPrank();
    }

    function test_USDC_Transfer_OinkDisabled() public {
        // Configure vault but keep Oink disabled
        vm.prank(owner);
        account.setOinkVault(address(vault));
        
        // Transfer 10.50 USDC (10,500,000 units)
        uint256 transferAmount = 10.5 * 1e6; // 10,500,000
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, transferAmount);
        
        vm.prank(owner);
        account.execute(address(usdc), 0, data);
        
        // Recipient gets exact transfer amount
        assertEq(usdc.balanceOf(merchant), transferAmount);
        // Vault gets nothing
        assertEq(usdc.balanceOf(address(vault)), 0);
        // Account balance decreases by exact transfer amount
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE - transferAmount);
    }

    function test_USDC_Transfer_OinkEnabled_Split() public {
        // Configure vault and enable Oink
        vm.startPrank(owner);
        account.setOinkVault(address(vault));
        account.setOinkEnabled(true);
        vm.stopPrank();
        
        // Transfer 10.50 USDC (10,500,000 units)
        // Next integer is 11.00 USDC (11,000,000 units)
        // Round up is 0.50 USDC (500,000 units)
        uint256 transferAmount = 10.5 * 1e6; // 10,500,000
        uint256 expectedRoundUp = 0.5 * 1e6; // 500,000
        
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, transferAmount);
        
        vm.prank(owner);
        account.execute(address(usdc), 0, data);
        
        // Recipient gets exact transfer amount
        assertEq(usdc.balanceOf(merchant), transferAmount);
        // Vault gets round-up amount
        assertEq(usdc.balanceOf(address(vault)), expectedRoundUp);
        // Vault minted shares to the smart account (1:1 exchange rate)
        assertEq(vault.balanceOf(address(account)), expectedRoundUp);
        // Account total balance decreases by transferAmount + expectedRoundUp
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE - transferAmount - expectedRoundUp);
    }

    function test_USDC_Transfer_OinkEnabled_Boundary_ExactInteger() public {
        // Configure vault and enable Oink
        vm.startPrank(owner);
        account.setOinkVault(address(vault));
        account.setOinkEnabled(true);
        vm.stopPrank();
        
        // Transfer exactly 10.00 USDC (10,000,000 units)
        // Round up should be 0
        uint256 transferAmount = 10 * 1e6; // 10,000,000
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, transferAmount);
        
        vm.prank(owner);
        account.execute(address(usdc), 0, data);
        
        // Recipient gets exact transfer amount
        assertEq(usdc.balanceOf(merchant), transferAmount);
        // Vault gets nothing
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.balanceOf(address(account)), 0);
        // Account balance decreases by exact transfer amount
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE - transferAmount);
    }

    function test_USDC_Transfer_OinkEnabled_SmallDecimals() public {
        // Configure vault and enable Oink
        vm.startPrank(owner);
        account.setOinkVault(address(vault));
        account.setOinkEnabled(true);
        vm.stopPrank();
        
        // Transfer 10.000001 USDC (10,000,001 units)
        // Next integer is 11.00 USDC (11,000,000 units)
        // Round up is 0.999999 USDC (999,999 units)
        uint256 transferAmount = 10 * 1e6 + 1; // 10,000,001
        uint256 expectedRoundUp = 999999;
        
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, transferAmount);
        
        vm.prank(owner);
        account.execute(address(usdc), 0, data);
        
        assertEq(usdc.balanceOf(merchant), transferAmount);
        assertEq(usdc.balanceOf(address(vault)), expectedRoundUp);
        assertEq(vault.balanceOf(address(account)), expectedRoundUp);
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE - transferAmount - expectedRoundUp);
    }

    function test_ExecuteBatch_OinkEnabled_Split() public {
        // Configure vault and enable Oink
        vm.startPrank(owner);
        account.setOinkVault(address(vault));
        account.setOinkEnabled(true);
        vm.stopPrank();
        
        // Batch 2 transfers:
        // 1. 5.25 USDC (5,250,000 units) -> roundUp = 0.75 USDC (750,000 units)
        // 2. 12.00 USDC (12,000,000 units) -> roundUp = 0 USDC
        address merchant2 = address(0x5);
        uint256 amount1 = 5.25 * 1e6;
        uint256 roundUp1 = 0.75 * 1e6;
        uint256 amount2 = 12 * 1e6;
        
        address[] memory dests = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory funcs = new bytes[](2);
        
        dests[0] = address(usdc);
        values[0] = 0;
        funcs[0] = abi.encodeWithSignature("transfer(address,uint256)", merchant, amount1);
        
        dests[1] = address(usdc);
        values[1] = 0;
        funcs[1] = abi.encodeWithSignature("transfer(address,uint256)", merchant2, amount2);
        
        vm.prank(owner);
        account.executeBatch(dests, values, funcs);
        
        // Verify merchant balances
        assertEq(usdc.balanceOf(merchant), amount1);
        assertEq(usdc.balanceOf(merchant2), amount2);
        
        // Verify vault balance (only roundUp1 should be deposited)
        assertEq(usdc.balanceOf(address(vault)), roundUp1);
        assertEq(vault.balanceOf(address(account)), roundUp1);
        
        // Verify account balance
        assertEq(usdc.balanceOf(address(account)), INITIAL_BALANCE - amount1 - roundUp1 - amount2);
    }

    function test_Execute_NonUSDCTransfer_NotIntercepted() public {
        // Configure vault and enable Oink
        vm.startPrank(owner);
        account.setOinkVault(address(vault));
        account.setOinkEnabled(true);
        vm.stopPrank();
        
        // Deploy a different Mock ERC20 (e.g. non-USDC token, say DAI with 18 decimals)
        MockERC20 dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        dai.mint(address(account), 100 * 1e18);
        
        // Transfer 10.50 DAI
        uint256 transferAmount = 10.5 * 1e18;
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, transferAmount);
        
        vm.prank(owner);
        account.execute(address(dai), 0, data);
        
        // Recipient gets DAI
        assertEq(dai.balanceOf(merchant), transferAmount);
        // Vault gets NO DAI
        assertEq(dai.balanceOf(address(vault)), 0);
        // Smart Account balance of DAI is reduced by exact amount
        assertEq(dai.balanceOf(address(account)), 100 * 1e18 - transferAmount);
    }

    function test_Execute_Revert_Unauthorized() public {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", merchant, 10 * 1e6);
        
        vm.prank(stranger);
        vm.expectRevert("Only owner or entryPoint");
        account.execute(address(usdc), 0, data);
    }
}
