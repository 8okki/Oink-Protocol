// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockYieldPool is ERC4626 {
    uint8 private _decimals;

    constructor(IERC20 asset_, string memory name, string memory symbol, uint8 decimals_)
        ERC20(name, symbol)
        ERC4626(asset_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // Mock yield accretion by minting assets directly to this pool contract
    function accrueMockYield(uint256 amount) external {
        MockERC20(address(asset())).mint(address(this), amount);
    }
}
