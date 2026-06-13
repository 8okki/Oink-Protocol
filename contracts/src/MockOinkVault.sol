// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./MockERC20.sol";

contract MockOinkVault is MockERC20 {
    address public immutable asset;
    
    constructor(address _asset, string memory _name, string memory _symbol) MockERC20(_name, _symbol, 18) {
        asset = _asset;
    }
    
    function totalAssets() public view returns (uint256) {
        return MockERC20(asset).balanceOf(address(this));
    }
    
    function deposit(uint256 assets, address receiver) public returns (uint256 shares) {
        shares = assets; // 1:1 exchange rate
        require(MockERC20(asset).transferFrom(msg.sender, address(this), assets), "Transfer failed");
        _mint(receiver, shares);
        return shares;
    }
    
    function mint(uint256 shares, address receiver) public returns (uint256 assets) {
        assets = shares; // 1:1 exchange rate
        require(MockERC20(asset).transferFrom(msg.sender, address(this), assets), "Transfer failed");
        _mint(receiver, shares);
        return assets;
    }
    
    function withdraw(uint256 assets, address receiver, address owner) public returns (uint256 shares) {
        shares = assets; // 1:1 exchange rate
        _burn(owner, shares);
        require(MockERC20(asset).transfer(receiver, assets), "Transfer failed");
        return shares;
    }
    
    function redeem(uint256 shares, address receiver, address owner) public returns (uint256 assets) {
        assets = shares; // 1:1 exchange rate
        _burn(owner, shares);
        require(MockERC20(asset).transfer(receiver, assets), "Transfer failed");
        return assets;
    }
    
    // ERC-4626 optional/preview methods
    function convertToShares(uint256 assets) public view returns (uint256) {
        return assets;
    }
    
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares;
    }
    
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return assets;
    }
    
    function previewMint(uint256 shares) public view returns (uint256) {
        return shares;
    }
    
    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return assets;
    }
    
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return shares;
    }
    
    function maxDeposit(address) public view returns (uint256) {
        return type(uint256).max;
    }
    
    function maxMint(address) public view returns (uint256) {
        return type(uint256).max;
    }
    
    function maxWithdraw(address owner) public view returns (uint256) {
        return balanceOf[owner];
    }
    
    function maxRedeem(address owner) public view returns (uint256) {
        return balanceOf[owner];
    }
}
