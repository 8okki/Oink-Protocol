// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockAaveV4Spoke
 * @notice A mock ERC-4626 yield pool simulating Aave V4 Tokenization Spoke.
 * Accrues virtual interest based on a dynamic APY set by the owner.
 */
contract MockAaveV4Spoke is ERC4626, Ownable {
    uint256 public supplyAPY; // Yield rate in basis points (e.g., 320 for 3.2%)
    uint256 public lastAccrualTimestamp;
    uint256 public virtualAssetBalance;

    event SupplyAPYUpdated(uint256 oldAPY, uint256 newAPY);

    constructor(
        string memory name,
        string memory symbol,
        IERC20 asset_,
        uint256 initialAPY,
        address initialOwner
    )
        ERC20(name, symbol)
        ERC4626(asset_)
        Ownable(initialOwner)
    {
        supplyAPY = initialAPY;
        lastAccrualTimestamp = block.timestamp;
        virtualAssetBalance = 0;
    }

    /**
     * @notice Set the simulated APY rate in basis points (e.g. 580 = 5.80%).
     */
    function setSupplyAPY(uint256 newAPY) external onlyOwner {
        accrueInterest();
        emit SupplyAPYUpdated(supplyAPY, newAPY);
        supplyAPY = newAPY;
    }

    /**
     * @notice Accrues simulated interest to the virtual asset balance based on elapsed time.
     */
    function accrueInterest() public {
        if (lastAccrualTimestamp == 0) {
            lastAccrualTimestamp = block.timestamp;
            return;
        }
        uint256 timeElapsed = block.timestamp - lastAccrualTimestamp;
        if (timeElapsed > 0 && virtualAssetBalance > 0 && supplyAPY > 0) {
            uint256 interest = (virtualAssetBalance * supplyAPY * timeElapsed) / (10000 * 365 days);
            virtualAssetBalance += interest;
        }
        lastAccrualTimestamp = block.timestamp;
    }

    /**
     * @notice Returns the total assets managed by the vault (principal + simulated accrued interest).
     */
    function totalAssets() public view virtual override returns (uint256) {
        if (lastAccrualTimestamp == 0 || virtualAssetBalance == 0) {
            return super.totalAssets();
        }
        uint256 timeElapsed = block.timestamp - lastAccrualTimestamp;
        uint256 interest = (virtualAssetBalance * supplyAPY * timeElapsed) / (10000 * 365 days);
        return virtualAssetBalance + interest;
    }

    // --- Overrides to trigger interest accrual and keep bookkeeping correct ---

    function deposit(uint256 assets, address receiver) public virtual override returns (uint256) {
        accrueInterest();
        uint256 shares = super.deposit(assets, receiver);
        virtualAssetBalance += assets;
        return shares;
    }

    function mint(uint256 shares, address receiver) public virtual override returns (uint256) {
        accrueInterest();
        uint256 assets = super.mint(shares, receiver);
        virtualAssetBalance += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner) public virtual override returns (uint256) {
        accrueInterest();
        uint256 shares = super.withdraw(assets, receiver, owner);
        if (virtualAssetBalance >= assets) {
            virtualAssetBalance -= assets;
        } else {
            virtualAssetBalance = 0;
        }
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner) public virtual override returns (uint256) {
        accrueInterest();
        uint256 assets = super.redeem(shares, receiver, owner);
        if (virtualAssetBalance >= assets) {
            virtualAssetBalance -= assets;
        } else {
            virtualAssetBalance = 0;
        }
        return assets;
    }
}
