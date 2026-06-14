// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockAaveV4Spoke
 * @notice A mock ERC-4626 yield pool simulating Aave V4 Tokenization Spoke.
 * Accrues virtual interest based on a dynamic APY and an owner-adjustable time multiplier
 * to accelerate interest accrual for live demo purposes.
 */
contract MockAaveV4Spoke is ERC4626, Ownable {
    uint256 public baseAPY; // Base yield rate in basis points (e.g., 320 for 3.2%)
    uint256 public lastAccrualTimestamp;
    uint256 public virtualAssetBalance;
    uint256 public timeMultiplier = 10000; // Accelerates time for demo purposes (e.g., 10000x)

    event SupplyAPYUpdated(uint256 oldAPY, uint256 newAPY);
    event TimeMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier);

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
        baseAPY = initialAPY;
        lastAccrualTimestamp = block.timestamp;
        virtualAssetBalance = 0;
    }

    /**
     * @notice Returns the dynamically fluctuating APY rate in basis points.
     */
    function supplyAPY() public view returns (uint256) {
        uint256 uniqueSeed = uint256(uint160(address(this)));
        
        // Unique period between 120 and 180 seconds
        uint256 period = 120 + (uniqueSeed % 61); 
        
        // Unique amplitude between 100 and 200 basis points (1.0% to 2.0%)
        uint256 amplitude = 100 + (uniqueSeed % 101);
        
        // Unique phase shift
        uint256 phaseShift = uniqueSeed % period;
        
        uint256 halfPeriod = period / 2;
        uint256 remainder = (block.timestamp + phaseShift) % period;
        int256 offset;
        if (remainder < halfPeriod) {
            offset = int256((remainder * 2 * amplitude) / halfPeriod) - int256(amplitude);
        } else {
            offset = int256(amplitude) - int256(((remainder - halfPeriod) * 2 * amplitude) / halfPeriod);
        }
        int256 currentAPY = int256(baseAPY) + offset;
        return currentAPY > 0 ? uint256(currentAPY) : 0;
    }

    /**
     * @notice Set the simulated base APY rate in basis points (e.g. 580 = 5.80%).
     */
    function setSupplyAPY(uint256 newAPY) external onlyOwner {
        accrueInterest();
        emit SupplyAPYUpdated(supplyAPY(), newAPY);
        baseAPY = newAPY;
    }

    /**
     * @notice Set the time multiplier to speed up yield accrual for demonstrations.
     */
    function setTimeMultiplier(uint256 newMultiplier) external onlyOwner {
        accrueInterest();
        emit TimeMultiplierUpdated(timeMultiplier, newMultiplier);
        timeMultiplier = newMultiplier;
    }

    /**
     * @notice Accrues simulated interest to the virtual asset balance based on elapsed time.
     */
    function accrueInterest() public {
        if (lastAccrualTimestamp == 0) {
            lastAccrualTimestamp = block.timestamp;
            return;
        }
        uint256 timeElapsed = (block.timestamp - lastAccrualTimestamp) * timeMultiplier;
        uint256 currentAPY = supplyAPY();
        if (timeElapsed > 0 && virtualAssetBalance > 0 && currentAPY > 0) {
            uint256 interest = (virtualAssetBalance * currentAPY * timeElapsed) / (10000 * 365 days);
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
        uint256 timeElapsed = (block.timestamp - lastAccrualTimestamp) * timeMultiplier;
        uint256 currentAPY = supplyAPY();
        uint256 interest = (virtualAssetBalance * currentAPY * timeElapsed) / (10000 * 365 days);
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
