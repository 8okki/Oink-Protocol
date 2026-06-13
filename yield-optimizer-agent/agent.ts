import * as dotenv from 'dotenv';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Define custom chain for Arc Testnet
const arcTestnet = defineChain({
  id: 49443,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'] },
  },
});

// Aave V4 Pool ABI for getReserveData
const aavePoolAbi = [
  {
    "inputs": [{ "internalType": "address", "name": "asset", "type": "address" }],
    "name": "getReserveData",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "configuration", "type": "uint256" },
          { "internalType": "uint128", "name": "liquidityIndex", "type": "uint128" },
          { "internalType": "uint128", "name": "currentLiquidityRate", "type": "uint128" },
          { "internalType": "uint128", "name": "variableBorrowIndex", "type": "uint128" },
          { "internalType": "uint128", "name": "currentVariableBorrowRate", "type": "uint128" },
          { "internalType": "uint128", "name": "currentStableBorrowRate", "type": "uint128" },
          { "internalType": "uint40", "name": "lastUpdateTimestamp", "type": "uint40" },
          { "internalType": "uint16", "name": "id", "type": "uint16" },
          { "internalType": "address", "name": "aTokenAddress", "type": "address" },
          { "internalType": "address", "name": "stableDebtTokenAddress", "type": "address" },
          { "internalType": "address", "name": "variableDebtTokenAddress", "type": "address" },
          { "internalType": "address", "name": "interestRateStrategyAddress", "type": "address" }
        ],
        "internalType": "struct DataTypes.ReserveData",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Mini ABI for OinkVault
const oinkVaultAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "_pool", "type": "address" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" }
    ],
    "name": "invest",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Constants & Env Configuration
const RAY = 10n ** 27n;
const USD_DECIMALS = 6;

const ALLOCATOR_PK = process.env.ALLOCATOR_PRIVATE_KEY as `0x${string}`;
const OINK_VAULT_ADDRESS = (process.env.OINK_VAULT_ADDRESS || '0x18A49aEF7e31ea27E727025185F12FF0633cd6Db') as `0x${string}`;
const USDC_ADDRESS = (process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as `0x${string}`;

const AAVE_POOL_SOURCE = process.env.AAVE_POOL_SOURCE || '0x0000000000000000000000000000000000000000';
const AAVE_POOL_DEST = process.env.AAVE_POOL_DESTINATION || '0x0000000000000000000000000000000000000000';

const NET_PROFIT_THRESHOLD = parseFloat(process.env.NET_PROFIT_THRESHOLD || '5.0');
const PROJECTED_DAYS = parseInt(process.env.PROJECTED_DAYS || '30', 10);
const PRINCIPAL_AMOUNT = parseFloat(process.env.PRINCIPAL_AMOUNT || '10000');
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_SECONDS || '300', 10) * 1000;

// Setup clients
const sourcePublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'),
});

const destPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.DESTINATION_RPC_URL || 'https://rpc.testnet.arc.network'),
});

const account = ALLOCATOR_PK ? privateKeyToAccount(ALLOCATOR_PK) : null;
const sourceWalletClient = account
  ? createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'),
    })
  : null;

// =============================================================================
// AI Agent On-Chain & Calculation Tool Implementations
// =============================================================================

async function toolFetchYields() {
  console.log(`[Tool Call] Fetching yield rates...`);
  
  let sourceYield = 0.032; // Default mock yields
  let destYield = 0.057;   // Default mock yields
  let isMock = true;

  if (AAVE_POOL_SOURCE && AAVE_POOL_SOURCE !== '0x0000000000000000000000000000000000000000') {
    try {
      const data = await sourcePublicClient.readContract({
        address: AAVE_POOL_SOURCE as `0x${string}`,
        abi: aavePoolAbi,
        functionName: 'getReserveData',
        args: [USDC_ADDRESS as `0x${string}`],
      });
      sourceYield = Number(data.currentLiquidityRate) / Number(RAY);
      isMock = false;
    } catch {}
  }

  if (AAVE_POOL_DEST && AAVE_POOL_DEST !== '0x0000000000000000000000000000000000000000') {
    try {
      const data = await destPublicClient.readContract({
        address: AAVE_POOL_DEST as `0x${string}`,
        abi: aavePoolAbi,
        functionName: 'getReserveData',
        args: [USDC_ADDRESS as `0x${string}`],
      });
      destYield = Number(data.currentLiquidityRate) / Number(RAY);
      isMock = false;
    } catch {}
  }

  return { sourceYield, destYield, isMock };
}

async function toolEstimateCosts() {
  console.log(`[Tool Call] Estimating transaction costs...`);
  try {
    const gasPrice = await sourcePublicClient.getGasPrice();
    const estimatedGas = 450000n;
    const costUsdc = parseFloat(formatUnits(gasPrice * estimatedGas, 18)) * 1.5;
    return { estimatedCost: costUsdc > 0 ? costUsdc : 1.25 };
  } catch {
    return { estimatedCost: 1.25 };
  }
}

function toolCalculateNetProfit(
  sourceYield: number,
  destYield: number,
  principal: number,
  projectedDays: number,
  estimatedCost: number
) {
  console.log(`[Tool Call] Running Net Profit calculation...`);
  const yieldDelta = destYield - sourceYield;
  const grossProfit = principal * yieldDelta * (projectedDays / 365);
  const netProfit = grossProfit - estimatedCost;
  return { grossProfit, netProfit, yieldDelta };
}

async function toolExecuteRebalance(amount: number) {
  console.log(`[Tool Call] Executing on-chain rebalance via OinkVault...`);
  if (!account || !sourceWalletClient) {
    throw new Error("Allocator account is not initialized.");
  }

  const rebalanceAmount = parseUnits(amount.toString(), USD_DECIMALS);
  const targetPoolAddress = AAVE_POOL_DEST === '0x0000000000000000000000000000000000000000'
    ? '0x2222222222222222222222222222222222222222'
    : AAVE_POOL_DEST;

  try {
    const txHash = await sourceWalletClient.writeContract({
      address: OINK_VAULT_ADDRESS,
      abi: oinkVaultAbi,
      functionName: 'invest',
      args: [targetPoolAddress as `0x${string}`, rebalanceAmount],
    });
    return { success: true, txHash, isMock: false };
  } catch (error: any) {
    // Graceful fallback logging for whitelisting errors
    return {
      success: false,
      isMock: true,
      target: OINK_VAULT_ADDRESS,
      method: 'invest',
      args: [targetPoolAddress, rebalanceAmount.toString()],
      sender: account.address,
      reason: error.message || error
    };
  }
}

// =============================================================================
// Gemini Function Declarations (Tools Specification)
// =============================================================================

const fetchYieldsSpec = {
  name: 'fetchYields',
  description: 'Fetches the current yield rates (APY) for USDC from the Aave V4 pools on the source and destination chains.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const estimateCostsSpec = {
  name: 'estimateCosts',
  description: 'Estimates the combined gas and bridge costs in USDC to execute a reallocation.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const calculateNetProfitSpec = {
  name: 'calculateNetProfit',
  description: 'Calculates gross profit, net profit, and yield delta based on yields, principal, duration, and estimated cost.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sourceYield: { type: SchemaType.NUMBER, description: 'Source supply APY (e.g. 0.032).' },
      destYield: { type: SchemaType.NUMBER, description: 'Destination supply APY (e.g. 0.057).' },
      principal: { type: SchemaType.NUMBER, description: 'USDC principal amount.' },
      projectedDays: { type: SchemaType.NUMBER, description: 'Projected horizon period in days.' },
      estimatedCost: { type: SchemaType.NUMBER, description: 'Estimated transaction cost in USDC.' },
    },
    required: ['sourceYield', 'destYield', 'principal', 'projectedDays', 'estimatedCost'],
  },
};

const executeRebalanceSpec = {
  name: 'executeRebalance',
  description: 'Calls the OinkVault contract to transfer USDC to the destination yield pool.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      amount: { type: SchemaType.NUMBER, description: 'USDC principal to invest.' },
    },
    required: ['amount'],
  },
};

// =============================================================================
// LLM Agent Execution Flow
// =============================================================================

async function runGenerativeAgent() {
  console.log(`\n==================================================`);
  console.log(`[${new Date().toLocaleTimeString()}] Starting Gemini AI Allocator Agent`);
  console.log(`==================================================`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error("❌ Error: GEMINI_API_KEY is not configured in .env");
    return;
  }

  // -------------------------------------------------------------------------
  // Live Gemini LLM Agent Mode
  // -------------------------------------------------------------------------
  console.log(`[Agent Status] Connected to Live Google Gemini API...`);
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    systemInstruction: `You are the Oink Yield Optimizer AI Agent.
Your role is to optimize yield for users by moving USDC to the highest yield-bearing Aave V4 pool.
You must use your tools sequentially:
1. Call fetchYields() to fetch yields.
2. Call estimateCosts() to get gas/bridge fees.
3. Call calculateNetProfit() to evaluate yields against principal: ${PRINCIPAL_AMOUNT} USDC, horizon: ${PROJECTED_DAYS} days, and target profit threshold: ${NET_PROFIT_THRESHOLD} USDC.
4. If net profit is greater than or equal to the threshold, call executeRebalance() to execute.
5. Provide a very brief summary of your reasoning and final decision. Avoid long-winded explanations.`,
    tools: [{
      functionDeclarations: [
        fetchYieldsSpec,
        estimateCostsSpec,
        calculateNetProfitSpec,
        executeRebalanceSpec
      ]
    }]
  });

  try {
    const chat = model.startChat();
    let response = await chat.sendMessage(`Optimize yields. Check yields and evaluate rebalance now.`);
    
    // Process function/tool calls returned by Gemini
    let functionCalls = response.response.functionCalls();
    
    while (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        const { name, args } = call;
        let toolResult: any;

        if (name === 'fetchYields') {
          toolResult = await toolFetchYields();
        } else if (name === 'estimateCosts') {
          toolResult = await toolEstimateCosts();
        } else if (name === 'calculateNetProfit') {
          const params = args as any;
          toolResult = toolCalculateNetProfit(
            params.sourceYield,
            params.destYield,
            params.principal,
            params.projectedDays,
            params.estimatedCost
          );
        } else if (name === 'executeRebalance') {
          const params = args as any;
          toolResult = await toolExecuteRebalance(params.amount);
        }

        // Send tool results back to LLM context
        response = await chat.sendMessage([
          {
            functionResponse: {
              name,
              response: toolResult
            }
          }
        ]);
      }
      functionCalls = response.response.functionCalls();
    }

    // Print the final reasoning text from the model
    console.log(`\n🤖 [AI Agent Output]:`);
    console.log(response.response.text());

  } catch (err: any) {
    console.error(`❌ Error in Gemini AI execution:`, err.message || err);
  }
}

// Daemon runtime scheduler
async function run() {
  console.log("Starting LLM Yield Optimizer Agent Daemon...");
  console.log(`Polling Interval: ${POLLING_INTERVAL_MS / 1000} seconds`);
  
  // Run once immediately
  await runGenerativeAgent();

  // Schedule intervals
  setInterval(async () => {
    await runGenerativeAgent();
  }, POLLING_INTERVAL_MS);
}

run().catch(console.error);
