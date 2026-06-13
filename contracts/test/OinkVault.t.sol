// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MockERC20, MockYieldPool} from "./Mocks.sol";
import {OinkVault} from "../src/OinkVault.sol";

contract OinkVaultTest is Test {
    OinkVault public vault;
    MockERC20 public usdc;
    MockYieldPool public mockAave;

    address public owner = address(0x1);
    address public allocator = address(0x2);
    address public depositor = address(0x3);
    address public stranger = address(0x4);

    uint256 public constant INITIAL_USDC_AMOUNT = 1000 * 1e6; // 1000 USDC

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        vault = new OinkVault(usdc, owner);
        mockAave = new MockYieldPool(usdc, "Mock Aave USDC Receipt", "aUSDC", 6);

        // Fund depositor with USDC
        usdc.mint(depositor, INITIAL_USDC_AMOUNT);
    }

    function test_VaultInitialization() public {
        assertEq(vault.name(), "Yield-Bearing OINK");
        assertEq(vault.symbol(), "ybOINK");
        assertEq(vault.decimals(), 6);
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.owner(), owner);
        assertEq(vault.allocator(), address(0));
    }

    function test_SetAllocator_Success() public {
        vm.prank(owner);
        vault.setAllocator(allocator);
        assertEq(vault.allocator(), allocator);
    }

    function test_SetAllocator_Revert_NonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(); // Default Ownable revert
        vault.setAllocator(allocator);
    }

    function test_WhitelistProtocol_Success() public {
        vm.startPrank(owner);
        vault.whitelistProtocol(address(mockAave), address(mockAave), true);
        
        assertTrue(vault.isProtocolWhitelisted(address(mockAave)));
        assertEq(vault.protocolReceiptToken(address(mockAave)), address(mockAave));
        
        vault.whitelistProtocol(address(mockAave), address(mockAave), false);
        assertFalse(vault.isProtocolWhitelisted(address(mockAave)));
        assertEq(vault.protocolReceiptToken(address(mockAave)), address(0));
        vm.stopPrank();
    }

    function test_DepositAndWithdrawMath() public {
        uint256 depositAmount = 500 * 1e6; // 500 USDC

        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        
        // Deposit 500 USDC
        uint256 shares = vault.deposit(depositAmount, depositor);
        assertEq(shares, depositAmount); // 1:1 initial exchange rate
        assertEq(vault.balanceOf(depositor), shares);
        assertEq(vault.totalAssets(), depositAmount);
        
        // Withdraw 200 USDC
        uint256 assetsWithdrawn = vault.withdraw(200 * 1e6, depositor, depositor);
        assertEq(assetsWithdrawn, 200 * 1e6);
        assertEq(vault.balanceOf(depositor), 300 * 1e6);
        assertEq(vault.totalAssets(), 300 * 1e6);
        vm.stopPrank();
    }

    function test_Invest_Success() public {
        uint256 depositAmount = 800 * 1e6;
        uint256 investAmount = 500 * 1e6;

        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, depositor);
        vm.stopPrank();

        // Admin configures allocator and whitelists mockAave
        vm.startPrank(owner);
        vault.setAllocator(allocator);
        vault.whitelistProtocol(address(mockAave), address(mockAave), true);
        vm.stopPrank();

        // Allocator (AI agent) allocates 500 USDC to mockAave
        vm.prank(allocator);
        vault.invest(address(mockAave), investAmount);

        // Verify balances
        assertEq(usdc.balanceOf(address(vault)), depositAmount - investAmount);
        assertEq(usdc.balanceOf(address(mockAave)), investAmount);
        assertEq(mockAave.balanceOf(address(vault)), investAmount);
        
        // Total assets should still be 800 USDC (300 local + 500 allocated)
        assertEq(vault.totalAssets(), depositAmount);
    }

    function test_Invest_Revert_NotAllocatorOrOwner() public {
        vm.prank(owner);
        vault.whitelistProtocol(address(mockAave), address(mockAave), true);

        // Stranger tries to invest vault funds
        vm.prank(stranger);
        vm.expectRevert("Not authorized: allocator or owner only");
        vault.invest(address(mockAave), 100 * 1e6);
    }

    function test_Invest_Revert_NotWhitelisted() public {
        vm.prank(owner);
        vault.setAllocator(allocator);

        // Allocator tries to invest in a non-whitelisted pool
        vm.prank(allocator);
        vm.expectRevert("Protocol not whitelisted");
        vault.invest(address(mockAave), 100 * 1e6);
    }

    function test_WithdrawFromProtocol_Success() public {
        uint256 depositAmount = 800 * 1e6;
        uint256 investAmount = 500 * 1e6;
        uint256 pullAmount = 200 * 1e6;

        // Setup investment
        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, depositor);
        vm.stopPrank();

        vm.startPrank(owner);
        vault.setAllocator(allocator);
        vault.whitelistProtocol(address(mockAave), address(mockAave), true);
        vm.stopPrank();

        vm.prank(allocator);
        vault.invest(address(mockAave), investAmount);

        // Allocator withdraws 200 USDC from Aave back to vault
        vm.prank(allocator);
        vault.withdrawFromProtocol(address(mockAave), pullAmount);

        // Verify balances
        assertEq(usdc.balanceOf(address(vault)), depositAmount - investAmount + pullAmount); // 300 + 200 = 500 USDC
        assertEq(usdc.balanceOf(address(mockAave)), investAmount - pullAmount); // 500 - 200 = 300 USDC
        assertEq(mockAave.balanceOf(address(vault)), investAmount - pullAmount); // 300 aUSDC
        assertEq(vault.totalAssets(), depositAmount);
    }

    function test_YieldAccrualAndAssetAccounting() public {
        uint256 depositAmount = 600 * 1e6;
        uint256 investAmount = 400 * 1e6;
        uint256 yieldAmount = 50 * 1e6; // 50 USDC yield

        // 1. Depositor deposits 600 USDC
        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, depositor);
        vm.stopPrank();

        // 2. Setup whitelist and invest 400 USDC into mockAave
        vm.startPrank(owner);
        vault.setAllocator(allocator);
        vault.whitelistProtocol(address(mockAave), address(mockAave), true);
        vm.stopPrank();

        vm.prank(allocator);
        vault.invest(address(mockAave), investAmount);

        // 3. Mock yield accrual in the underlying mock pool (adds 50 USDC to mockAave assets)
        mockAave.accrueMockYield(yieldAmount);

        // 4. Check totalAssets in vault - should include the yield
        // Total = 200 (local) + 400 (invested) + 50 (yield) = 650 USDC
        assertApproxEqAbs(vault.totalAssets(), depositAmount + yieldAmount, 2);

        // 5. Depositor withdraws everything
        // They should receive their initial deposit + the 50 USDC yield profit!
        vm.startPrank(depositor);
        uint256 maxShares = vault.balanceOf(depositor);
        uint256 maxAssets = vault.maxWithdraw(depositor);
        
        assertApproxEqAbs(maxAssets, depositAmount + yieldAmount, 2);
        vm.stopPrank();

        // Withdraw from mockAave first so vault has enough local USDC liquidity to satisfy redemption
        uint256 maxWithdrawable = mockAave.maxWithdraw(address(vault));
        vm.prank(allocator);
        vault.withdrawFromProtocol(address(mockAave), maxWithdrawable);

        vm.startPrank(depositor);
        uint256 assetsRedeemed = vault.redeem(maxShares, depositor, depositor);
        assertApproxEqAbs(assetsRedeemed, depositAmount + yieldAmount, 2);
        assertApproxEqAbs(usdc.balanceOf(depositor), INITIAL_USDC_AMOUNT + yieldAmount, 2); // 1000 + 50 = 1050 USDC
        vm.stopPrank();
    }
}
