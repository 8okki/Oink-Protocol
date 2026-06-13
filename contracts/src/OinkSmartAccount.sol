// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

interface IOinkVault {
    function deposit(uint256 assets, address receiver) external returns (uint256);
}

contract OinkSmartAccount {
    enum RoundingPolicy {
        None,
        NearestInteger
    }

    address public owner;
    address public entryPoint;
    address public usdcToken;
    address public oinkVault;
    bool public oinkEnabled;
    RoundingPolicy public policy;

    event OwnerUpdated(address indexed newOwner);
    event EntryPointUpdated(address indexed newEntryPoint);
    event OinkVaultUpdated(address indexed newOinkVault);
    event OinkEnabledUpdated(bool enabled);
    event RoundingPolicyUpdated(RoundingPolicy policy);
    event UsdcTokenUpdated(address indexed newUsdcToken);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner || msg.sender == entryPoint, "Only owner or entryPoint");
        _;
    }

    constructor(address _owner, address _entryPoint, address _usdcToken) {
        owner = _owner;
        entryPoint = _entryPoint;
        usdcToken = _usdcToken;
        oinkEnabled = false;
        policy = RoundingPolicy.NearestInteger;
    }

    // Receive function to accept Ether
    receive() external payable {}
    fallback() external payable {}

    // Administrative functions
    function setOwner(address _owner) external onlyOwner {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
        emit OwnerUpdated(_owner);
    }

    function setEntryPoint(address _entryPoint) external onlyOwner {
        entryPoint = _entryPoint;
        emit EntryPointUpdated(_entryPoint);
    }

    function setOinkVault(address _oinkVault) external onlyOwner {
        oinkVault = _oinkVault;
        emit OinkVaultUpdated(_oinkVault);
    }

    function setOinkEnabled(bool _enabled) external onlyOwner {
        oinkEnabled = _enabled;
        emit OinkEnabledUpdated(_enabled);
    }

    function setRoundingPolicy(RoundingPolicy _policy) external onlyOwner {
        policy = _policy;
        emit RoundingPolicyUpdated(_policy);
    }

    function setUsdcToken(address _usdcToken) external onlyOwner {
        usdcToken = _usdcToken;
        emit UsdcTokenUpdated(_usdcToken);
    }

    // Core execution function matching Biconomy Smart Account V2
    function execute(address dest, uint256 value, bytes calldata func) external payable onlyOwnerOrEntryPoint {
        if (oinkEnabled && policy == RoundingPolicy.NearestInteger && dest == usdcToken && func.length >= 68) {
            bytes4 selector = bytes4(func[:4]);
            if (selector == 0xa9059cbb) { // transfer(address,uint256)
                (, uint256 amount) = abi.decode(func[4:], (address, uint256));
                
                uint256 decimals = 6;
                try IERC20Metadata(usdcToken).decimals() returns (uint8 dec) {
                    decimals = dec;
                } catch {}
                
                uint256 scale = 10 ** decimals;
                uint256 remainder = amount % scale;
                uint256 roundUpAmount = remainder == 0 ? 0 : scale - remainder;
                
                // Execute base transfer to the merchant/recipient
                _call(dest, 0, func);
                
                // If round-up is positive and vault is configured, deposit round-up amount
                if (roundUpAmount > 0 && oinkVault != address(0)) {
                    // Approve vault to pull USDC
                    bytes memory approveData = abi.encodeWithSignature("approve(address,uint256)", oinkVault, roundUpAmount);
                    _call(usdcToken, 0, approveData);
                    
                    // Call deposit on vault
                    bytes memory depositData = abi.encodeWithSignature("deposit(uint256,address)", roundUpAmount, address(this));
                    _call(oinkVault, 0, depositData);
                }
                return;
            }
        }

        // Default execution path
        _call(dest, value, func);
    }

    // Core batch execution function matching Biconomy Smart Account V2
    function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external payable onlyOwnerOrEntryPoint {
        require(dest.length == value.length && dest.length == func.length, "Length mismatch");
        
        for (uint256 i = 0; i < dest.length; i++) {
            address target = dest[i];
            uint256 val = value[i];
            bytes calldata data = func[i];
            
            if (oinkEnabled && policy == RoundingPolicy.NearestInteger && target == usdcToken && data.length >= 68) {
                bytes4 selector = bytes4(data[:4]);
                if (selector == 0xa9059cbb) { // transfer(address,uint256)
                    (, uint256 amount) = abi.decode(data[4:], (address, uint256));
                    
                    uint256 decimals = 6;
                    try IERC20Metadata(usdcToken).decimals() returns (uint8 dec) {
                        decimals = dec;
                    } catch {}
                    
                    uint256 scale = 10 ** decimals;
                    uint256 remainder = amount % scale;
                    uint256 roundUpAmount = remainder == 0 ? 0 : scale - remainder;
                    
                    // Execute base transfer to the merchant/recipient
                    _call(target, 0, data);
                    
                    // If round-up is positive and vault is configured, deposit round-up amount
                    if (roundUpAmount > 0 && oinkVault != address(0)) {
                        bytes memory approveData = abi.encodeWithSignature("approve(address,uint256)", oinkVault, roundUpAmount);
                        _call(usdcToken, 0, approveData);
                        
                        bytes memory depositData = abi.encodeWithSignature("deposit(uint256,address)", roundUpAmount, address(this));
                        _call(oinkVault, 0, depositData);
                    }
                    continue;
                }
            }
            
            _call(target, val, data);
        }
    }

    // Helper function to execute low-level calls
    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
}
