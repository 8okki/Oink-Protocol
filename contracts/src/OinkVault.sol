// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OinkVault
 * @notice An ERC-4626 vault that manages user micro-savings (USDC) and mints ybOINK shares.
 * Allows an authorized AI-agent (allocator) to lend funds to whitelisted protocols (like Aave).
 */
contract OinkVault is ERC4626, Ownable {
    // Role-based access control for the AI agent allocator
    address public allocator;

    // Whitelisted protocols and their corresponding yield receipt token (e.g., aUSDC for Aave v3 USDC pool)
    mapping(address => address) public protocolReceiptToken;
    mapping(address => bool) public isProtocolWhitelisted;

    // List of active whitelisted protocols where funds are currently allocated
    address[] public activeProtocols;
    mapping(address => bool) public isActiveProtocol;

    event AllocatorUpdated(address indexed oldAllocator, address indexed newAllocator);
    event ProtocolWhitelistUpdated(address indexed protocol, address indexed receiptToken, bool whitelisted);
    event Invested(address indexed protocol, uint256 amount);
    event WithdrawnFromProtocol(address indexed protocol, uint256 amount);

    modifier onlyAllocatorOrOwner() {
        require(msg.sender == allocator || msg.sender == owner(), "Not authorized: allocator or owner only");
        _;
    }

    constructor(IERC20 _asset, address _initialOwner)
        ERC20("Yield-Bearing OINK", "ybOINK")
        ERC4626(_asset)
        Ownable(_initialOwner)
    {}

    /**
     * @notice Return the decimals of the vault share token.
     * OpenZeppelin's ERC4626 overrides decimals to match the underlying asset (6 for USDC).
     */
    function decimals() public view virtual override returns (uint8) {
        return ERC4626.decimals();
    }

    /**
     * @notice Set the allocator (AI agent) address.
     */
    function setAllocator(address _allocator) external onlyOwner {
        emit AllocatorUpdated(allocator, _allocator);
        allocator = _allocator;
    }

    /**
     * @notice Whitelist or remove a protocol, and associate its yield receipt token.
     */
    function whitelistProtocol(address _protocol, address _receiptToken, bool _status) external onlyOwner {
        require(_protocol != address(0), "Invalid protocol address");
        require(_receiptToken != address(0) || !_status, "Invalid receipt token");
        
        isProtocolWhitelisted[_protocol] = _status;
        protocolReceiptToken[_protocol] = _status ? _receiptToken : address(0);

        emit ProtocolWhitelistUpdated(_protocol, _receiptToken, _status);
    }

    /**
     * @notice Invest vault funds into a whitelisted protocol (e.g. Aave or ERC-4626 Yield Vault).
     */
    function invest(address _pool, uint256 _amount) external onlyAllocatorOrOwner {
        require(isProtocolWhitelisted[_pool], "Protocol not whitelisted");
        
        // Ensure the protocol is tracked in active protocols
        if (!isActiveProtocol[_pool]) {
            activeProtocols.push(_pool);
            isActiveProtocol[_pool] = true;
        }

        // Approve the pool to pull USDC from vault
        IERC20(asset()).approve(_pool, _amount);

        // Attempt ERC-4626 deposit first (covers Aave V4 Tokenization Spokes natively), otherwise fallback to Aave V3 supply signature
        try ERC4626(_pool).deposit(_amount, address(this)) returns (uint256) {
            // Standard ERC-4626 Deposit successful (e.g. Aave V4)
        } catch {
            // Aave V3 supply signature: supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
            bytes memory supplyCall = abi.encodeWithSignature(
                "supply(address,uint256,address,uint16)",
                asset(),
                _amount,
                address(this),
                0
            );
            (bool success, ) = _pool.call(supplyCall);
            require(success, "Lending supply call failed");
        }

        emit Invested(_pool, _amount);
    }

    /**
     * @notice Withdraw vault funds from a protocol back to the vault.
     */
    function withdrawFromProtocol(address _pool, uint256 _amount) external onlyAllocatorOrOwner {
        require(isProtocolWhitelisted[_pool], "Protocol not whitelisted");

        // Attempt ERC-4626 withdraw first (covers Aave V4 Tokenization Spokes natively), otherwise fallback to Aave V3 withdraw signature
        try ERC4626(_pool).withdraw(_amount, address(this), address(this)) returns (uint256) {
            // Standard ERC-4626 Withdraw successful (e.g. Aave V4)
        } catch {
            // Aave V3 withdraw signature: withdraw(address asset, uint256 amount, address to)
            bytes memory withdrawCall = abi.encodeWithSignature(
                "withdraw(address,uint256,address)",
                asset(),
                _amount,
                address(this)
            );
            (bool success, ) = _pool.call(withdrawCall);
            require(success, "Lending withdraw call failed");
        }

        // Remove from active protocols if the vault holds 0 receipt tokens now
        address receiptToken = protocolReceiptToken[_pool];
        if (receiptToken != address(0) && IERC20(receiptToken).balanceOf(address(this)) == 0) {
            _removeFromActiveProtocols(_pool);
        }

        emit WithdrawnFromProtocol(_pool, _amount);
    }

    function _removeFromActiveProtocols(address _pool) internal {
        if (!isActiveProtocol[_pool]) return;
        isActiveProtocol[_pool] = false;
        
        for (uint256 i = 0; i < activeProtocols.length; i++) {
            if (activeProtocols[i] == _pool) {
                activeProtocols[i] = activeProtocols[activeProtocols.length - 1];
                activeProtocols.pop();
                break;
            }
        }
    }

    /**
     * @notice Sum of local USDC and assets deployed in all active protocols.
     */
    function totalAssets() public view virtual override returns (uint256) {
        if (totalSupply() == 0) {
            return 0;
        }
        uint256 localBalance = IERC20(asset()).balanceOf(address(this));
        uint256 allocatedBalance = 0;

        for (uint256 i = 0; i < activeProtocols.length; i++) {
            address protocol = activeProtocols[i];
            address receiptToken = protocolReceiptToken[protocol];
            if (receiptToken != address(0)) {
                // If the receipt token is an ERC-4626 share, convert back to assets
                try ERC4626(protocol).convertToAssets(IERC20(receiptToken).balanceOf(address(this))) returns (uint256 assets) {
                    allocatedBalance += assets;
                } catch {
                    // Fallback: assume 1-to-1 peg (like Aave aTokens where 1 aUSDC = 1 USDC)
                    allocatedBalance += IERC20(receiptToken).balanceOf(address(this));
                }
            }
        }

        return localBalance + allocatedBalance;
    }
}
