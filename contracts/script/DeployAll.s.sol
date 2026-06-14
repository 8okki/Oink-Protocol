// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {OinkVault} from "../src/OinkVault.sol";
import {OinkSmartAccount} from "../src/OinkSmartAccount.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address deployerAddress = vm.envAddress("DEPLOYER_ADDRESS");
        address entryPointAddress = vm.envAddress("ENTRYPOINT_ADDRESS");

        address coreSpoke = 0x8fD6AFd64aA76cBAbD082f39C17d19D8dEa99D5E;
        address primeSpoke = 0xF3EF30745F52b067538d918Bc6cE151c07C18929;
        address plusSpoke = 0xA56971E50C0d58C8d57D4F7D5869eC03A056Ad10;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy OinkSmartAccount
        OinkSmartAccount smartAccount = new OinkSmartAccount(
            deployerAddress,
            entryPointAddress,
            usdcAddress
        );

        // 2. Deploy OinkVault
        OinkVault vault = new OinkVault(IERC20(usdcAddress), deployerAddress);

        // 3. Set Allocator
        vault.setAllocator(deployerAddress);

        // 4. Whitelist spokes
        vault.whitelistProtocol(coreSpoke, coreSpoke, true);
        vault.whitelistProtocol(primeSpoke, primeSpoke, true);
        vault.whitelistProtocol(plusSpoke, plusSpoke, true);

        // 5. Connect Vault to Smart Account and enable it
        smartAccount.setOinkVault(address(vault));
        smartAccount.setOinkEnabled(true);

        vm.stopBroadcast();

        console.log("=========================================");
        console.log("Deployment Successful!");
        console.log("=========================================");
        console.log("New Smart Account Address:", address(smartAccount));
        console.log("New Vault Address        :", address(vault));
        console.log("=========================================");
    }
}
