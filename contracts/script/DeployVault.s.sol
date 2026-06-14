// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {OinkVault} from "../src/OinkVault.sol";
import {OinkSmartAccount} from "../src/OinkSmartAccount.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address deployerAddress = vm.envAddress("DEPLOYER_ADDRESS");
        address smartAccountAddress = 0x1Ae81be0ac0b2CD93e78E3ba05654196144C9661;

        address coreSpoke = 0x8fD6AFd64aA76cBAbD082f39C17d19D8dEa99D5E;
        address primeSpoke = 0xF3EF30745F52b067538d918Bc6cE151c07C18929;
        address plusSpoke = 0xA56971E50C0d58C8d57D4F7D5869eC03A056Ad10;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy OinkVault
        OinkVault vault = new OinkVault(IERC20(usdcAddress), deployerAddress);

        // 2. Set Allocator
        vault.setAllocator(deployerAddress);

        // 3. Whitelist spokes
        vault.whitelistProtocol(coreSpoke, coreSpoke, true);
        vault.whitelistProtocol(primeSpoke, primeSpoke, true);
        vault.whitelistProtocol(plusSpoke, plusSpoke, true);

        // 4. Update OinkSmartAccount vault address
        OinkSmartAccount(payable(smartAccountAddress)).setOinkVault(address(vault));

        vm.stopBroadcast();

        console.log("=========================================");
        console.log("New OinkVault Deployed & Whitelisted!");
        console.log("=========================================");
        console.log("New Vault Address:", address(vault));
        console.log("=========================================");
    }
}
