// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {MockAaveV4Spoke} from "../src/MockAaveV4Spoke.sol";
import {OinkVault} from "../src/OinkVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address deployerAddress = vm.envAddress("DEPLOYER_ADDRESS");
        address vaultAddress = vm.envAddress("OINK_VAULT_ARC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Spoke (3.2% APY)
        MockAaveV4Spoke coreSpoke = new MockAaveV4Spoke(
            "Mock Aave V4 Core Spoke",
            "mAV4Core",
            IERC20(usdcAddress),
            320,
            deployerAddress
        );
        coreSpoke.setTimeMultiplier(10000);

        // 2. Deploy Prime Spoke (4.5% APY)
        MockAaveV4Spoke primeSpoke = new MockAaveV4Spoke(
            "Mock Aave V4 Prime Spoke",
            "mAV4Prime",
            IERC20(usdcAddress),
            450,
            deployerAddress
        );
        primeSpoke.setTimeMultiplier(10000);

        // 3. Deploy Plus Spoke (5.8% APY)
        MockAaveV4Spoke plusSpoke = new MockAaveV4Spoke(
            "Mock Aave V4 Plus Spoke",
            "mAV4Plus",
            IERC20(usdcAddress),
            580,
            deployerAddress
        );
        plusSpoke.setTimeMultiplier(10000);

        // 4. Automatically Whitelist Spokes in OinkVault
        OinkVault vault = OinkVault(vaultAddress);
        vault.whitelistProtocol(address(coreSpoke), address(coreSpoke), true);
        vault.whitelistProtocol(address(primeSpoke), address(primeSpoke), true);
        vault.whitelistProtocol(address(plusSpoke), address(plusSpoke), true);

        vm.stopBroadcast();

        console.log("=========================================");
        console.log("Mock Spokes Deployed & Whitelisted!");
        console.log("=========================================");
        console.log("Core Spoke Address :", address(coreSpoke));
        console.log("Prime Spoke Address:", address(primeSpoke));
        console.log("Plus Spoke Address :", address(plusSpoke));
        console.log("=========================================");
    }
}
