# Oink Wallet Frontend Dashboard

This directory contains the user interface for Oink Protocol, built using React, TypeScript, Vite, and custom CSS styling. The dashboard allows users to manage their smart account, view metrics, simulate transfers, and monitor yield-bearing assets.

---

## 🛠️ Architecture

The frontend acts as the user control panel and interacts directly with the on-chain contracts:

### 1. [App.tsx](file:///Users/thomaslee/Documents/Oink-Protocol/wallet-frontend/src/App.tsx)
The primary layout containing the dashboard logic, application state, and sub-components:
*   **Metrics Grid**: Displays the user's total assets, USDC balance, `ybOINK` shares, spare change saved, and total yield generated.
*   **Round-Up Controls**: Toggles the round-up saving feature and updates the saving policy on the [OinkSmartAccount.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/OinkSmartAccount.sol) contract.
*   **Transfer Panel**: A simulated payment form allowing users to send USDC to a merchant, demonstrating how Oink automatically intercepts the transaction and routes the remainder to the [OinkVault.sol](file:///Users/thomaslee/Documents/Oink-Protocol/contracts/src/OinkVault.sol) contract.
*   **Vault Analytics**: Shows where the AI agent allocator has deployed assets (e.g. Aave V4 spoke pools) and the respective yield allocations.

### 2. [web3.ts](file:///Users/thomaslee/Documents/Oink-Protocol/wallet-frontend/src/utils/web3.ts)
A helper utility module providing Web3 connectivity:
*   Initializes provider, signer, and contract instances (e.g., using Ethers or Viem).
*   Coordinates smart account operations, allowance approvals, deposits, and status checks.

### 3. Styling System ([index.css](file:///Users/thomaslee/Documents/Oink-Protocol/wallet-frontend/src/index.css))
A highly tailored vanilla CSS design system containing modern aesthetics:
*   Responsive layout for desktop and mobile viewing.
*   Dark-mode oriented glassmorphism components.
*   Visual indicators, hover animations, and state transitions.

---

## 📁 Project Structure

```bash
wallet-frontend/
├── src/
│   ├── App.tsx          # Main dashboard application logic
│   ├── main.tsx         # React application mount point
│   ├── index.css        # Core custom CSS styles
│   ├── App.css          # Supplementary component-specific styles
│   ├── assets/          # Static images and visual assets
│   └── utils/
│       └── web3.ts      # Web3/smart contract interaction utilities
├── public/              # Public static assets
├── index.html           # HTML5 entrypoint
├── package.json         # Node.js project configurations and dependencies
├── vite.config.ts       # Vite bundler configuration
└── tsconfig.json        # TypeScript configuration settings
```

---

## ⚡ Local Development

### Prerequisites
*   Node.js v18+ and npm installed.

### Setup & Installation
Install dependencies from the `wallet-frontend` directory:
```bash
npm install
```

### Start Development Server
Run the local dev server:
```bash
npm run dev
```
Open http://localhost:5173 to view and interact with the application.

### Build for Production
Bundle the production-ready assets:
```bash
npm run build
```
Preview the production build locally:
```bash
npm run preview
```
