# Oink AI Yield Optimizer Agent

This directory contains the off-chain autonomous allocator agent for the Oink Protocol, built using Node.js, TypeScript, Viem, and Google Generative AI (Gemini). The agent is responsible for monitoring lending pool yields and rebalancing assets in the [OinkVault.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/OinkVault.sol) contract to maximize user profits.

---

## 🛠️ Architecture

The agent runs as a background process and behaves as a structured decision loop:

```
    ┌──────────────────────┐
    │     Polling Loop     │
    └──────────┬───────────┘
               │ Every N seconds
               ▼
    ┌──────────────────────┐
    │ Fetch On-chain APYs  │ (Calls MockAaveV4Spoke.supplyAPY)
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Gemini AI Engine     │ (Analyzes yield rates vs. gas costs)
    └──────────┬───────────┘
               │
               ▼  Decision: Reallocate / Keep
    ┌──────────┴───────────┐
    │ Execute Rebalance    │ (Calls OinkVault.invest/withdraw)
    └──────────────────────┘
```

### 1. Polling Loop
Runs at a regular interval configured via `POLLING_INTERVAL_SECONDS`.

### 2. On-Chain yield Query
Fetches current yield APYs from multiple candidate pools (e.g. [MockAaveV4Spoke.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/MockAaveV4Spoke.sol) spoke contracts) on the Arc Testnet using `viem`.

### 3. AI Decision-Making Engine (Gemini)
Uses Google Gemini to process variables including:
*   Yield rates of candidate pools.
*   Gas prices and estimated transaction costs.
*   Current capital allocation.
*   Projected duration (`PROJECTED_DAYS`) and principal amount (`PRINCIPAL_AMOUNT`).
*   Configured minimum profit thresholds (`NET_PROFIT_THRESHOLD`).

The model outputs a structured action plan determining whether rebalancing is profitable after gas fees.

### 4. Rebalance Execution
If rebalancing is deemed profitable, the agent initiates on-chain transactions via the `OinkVault`'s `invest` and `withdrawFromProtocol` methods using the authorized `allocator` key.

---

## 📁 Project Structure

```bash
yield-optimizer-agent/
├── agent.ts                   # Core agent loop, tool definitions, and contract interactions
├── package.json               # Node.js dependencies and run scripts
├── tsconfig.json              # TypeScript compilation setup
├── .env.example               # Template for environment variables
└── dist/                      # Compiled JS files (generated after build)
```

---

## ⚡ Local Development

### Prerequisites
*   Node.js v18+ and npm installed.
*   An active Google Gemini API Key.

### Setup & Installation
Install dependencies from the `yield-optimizer-agent` directory:
```bash
npm install
```

### Configuration
Create a `.env` file in this directory based on `.env.example`:
```env
# Google Gemini API Key for AI Agent decisions
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Deployed OinkVault contract address
OINK_VAULT_ADDRESS="0x18A49aEF7e31ea27E727025185F12FF0633cd6Db"

# USDC Token address
USDC_ADDRESS="0x3600000000000000000000000000000000000000"

# RPC Endpoints
SOURCE_RPC_URL="https://rpc.testnet.arc.network"
DESTINATION_RPC_URL="https://rpc.testnet.arc.network"

# Comma-separated whitelisted Aave V4 Candidate Pool addresses
CANDIDATE_POOLS="0x8fD6AFd64aA76cBAbD082f39C17d19D8dEa99D5E,0xF3EF30745F52b067538d918Bc6cE151c07C18929,0xA56971E50C0d58C8d57D4F7D5869eC03A056Ad10"

# Allocator private key authorized in OinkVault
ALLOCATOR_PRIVATE_KEY="your_allocator_private_key"

# Decision parameters
NET_PROFIT_THRESHOLD=5.0
PROJECTED_DAYS=30
PRINCIPAL_AMOUNT=10000
POLLING_INTERVAL_SECONDS=300
```

### Run the Agent
Run the agent in development mode:
```bash
npm start
```

### Build the Project
Compile TypeScript into JavaScript:
```bash
npm run build
```
