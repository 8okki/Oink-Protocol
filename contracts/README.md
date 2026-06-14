# Oink Protocol Smart Contracts

This directory contains the core smart contracts for the Oink Protocol. It implements a user-friendly micro-savings yield vault coupled with a smart account wallet that automates round-up deposits on USDC transfers.

---

## 🛠️ Architecture

The contracts are built in a modular architecture composed of three main files:

### 1. [OinkSmartAccount.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/OinkSmartAccount.sol)
An account abstraction smart wallet (ERC-4337 style, matching Biconomy V2 execution signatures) with embedded rounding logic:
*   Intercepts standard `transfer(address,uint256)` transactions for the configured USDC token.
*   Calculates the "round-up" difference based on the active `RoundingPolicy` (e.g. `NearestInteger` rounds up to the next whole dollar).
*   Executes the original transfer, approves the round-up amount, and deposits it into `OinkVault` on behalf of the wallet owner.

### 2. [OinkVault.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/OinkVault.sol)
An ERC-4626 compliant yield-bearing vault representing the pooled micro-savings:
*   Deposits of USDC mint `ybOINK` (Yield-Bearing OINK) shares back to the user.
*   Grants an authorized AI agent (`allocator` role) permission to call `invest(pool, amount)` and `withdrawFromProtocol(pool, amount)` to maximize returns.
*   Tracks allocations across whitelisted lending protocols (e.g. Aave V4 spokes) and computes `totalAssets()` dynamically based on local cash reserves and active investments.

### 3. [MockAaveV4Spoke.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/MockAaveV4Spoke.sol)
A mock implementation of the Aave V4 tokenization spoke contract:
*   Implements native ERC-4626 interfaces for deposits and withdrawals (mirroring the new Aave V4 spoke architecture).
*   Simulates yield rate APYs via a custom `supplyAPY` query for the allocator agent to evaluate.

---

## 📁 Project Structure

```bash
contracts/
├── src/
│   ├── OinkSmartAccount.sol   # Round-up smart account wallet
│   ├── OinkVault.sol          # ERC-4626 micro-savings yield vault
│   └── MockAaveV4Spoke.sol    # Aave V4 mock spoke contract for testing
├── test/                      # Foundry unit test suite
├── script/                    # Solidity scripts for deployment and verification
├── lib/                       # External dependencies (OpenZeppelin, Forge-std)
├── foundry.toml               # Foundry compiler and network settings
└── remappings.txt             # Solidity import shortcuts
```

---

## ⚡ Local Development

This project uses [Foundry](https://book.getfoundry.sh/) as its development and testing framework.

### Prerequisites
Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Setup & Installation
Install dependencies:
```bash
forge install
```

### Build & Compilation
Compile the smart contracts:
```bash
forge build
```

### Run Tests
Execute the unit tests:
```bash
forge test
```

### Deployment Configuration
Create a `.env` file in the `contracts` directory (refer to `.env` for guidance):
```env
RPC_URL="https://rpc.testnet.arc.network"
PRIVATE_KEY="your_deployer_private_key"
DEPLOYER_ADDRESS="your_deployer_address"
ENTRYPOINT_ADDRESS="0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
USDC_ADDRESS="deployed_usdc_address"
OINK_VAULT_ARC_ADDRESS="deployed_oink_vault_address"
```
Deploy the contracts using the scripts in `script/` folder:
```bash
forge script script/<ScriptFile>.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
```
