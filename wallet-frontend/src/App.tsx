import { useState, useEffect, useRef } from 'react';
import {
  Wallet as WalletIcon,
  Coins,
  PiggyBank,
  Settings as SettingsIcon,
  ShoppingBag,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ShieldCheck,
  ArrowUpRight,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  getOrCreateEOA,
  initBiconomyAccount,
  fetchBalances,
  calculateRoundUp,
  resetEOA,
  executeOinkPayment,
  executeOinkWithdraw,
  previewWithdrawShares
} from './utils/web3';
import type { WalletDetails } from './utils/web3';

interface Transaction {
  id: string;
  type: 'purchase' | 'savings';
  title: string;
  amount: number;
  roundup: number;
  timestamp: string;
  status: 'success' | 'pending';
  txHash: string;
}

const MERCHANT_ADDRESS = "0x2191e22e44341741D741aC5adE90A23220a84275";
const DEFAULT_VAULT_ADDRESS = "0x18A49aEF7e31ea27E727025185F12FF0633cd6Db";

const INTRO_ELEMENTS: Array<{
  type: 'coin' | 'bill';
  left: string;
  size?: number;
  w?: number;
  h?: number;
  delay: string;
  dur: string;
  rotS: string;
  rotE: string;
}> = [
  { type: 'coin', left: '5%',  size: 20, delay: '0s',    dur: '2.1s', rotS: '-22deg', rotE: '12deg'  },
  { type: 'bill', left: '14%', w: 38, h: 22, delay: '0.38s', dur: '2.4s', rotS: '-7deg',  rotE: '9deg'   },
  { type: 'coin', left: '25%', size: 16, delay: '0.72s', dur: '1.85s',rotS: '13deg',  rotE: '-18deg' },
  { type: 'coin', left: '37%', size: 25, delay: '0.14s', dur: '2.2s', rotS: '-4deg',  rotE: '21deg'  },
  { type: 'bill', left: '48%', w: 44, h: 26, delay: '0.55s', dur: '2.5s', rotS: '5deg',   rotE: '-10deg' },
  { type: 'coin', left: '60%', size: 18, delay: '0.88s', dur: '2.0s', rotS: '-16deg', rotE: '7deg'   },
  { type: 'coin', left: '71%', size: 23, delay: '0.28s', dur: '2.3s', rotS: '9deg',   rotE: '-23deg' },
  { type: 'bill', left: '80%', w: 40, h: 23, delay: '0.65s', dur: '2.05s',rotS: '-8deg',  rotE: '13deg'  },
  { type: 'coin', left: '90%', size: 15, delay: '1.05s', dur: '1.75s',rotS: '20deg',  rotE: '-9deg'  },
  { type: 'coin', left: '43%', size: 21, delay: '0.48s', dur: '2.0s', rotS: '-13deg', rotE: '18deg'  },
  { type: 'coin', left: '19%', size: 17, delay: '1.25s', dur: '2.15s',rotS: '7deg',   rotE: '-15deg' },
  { type: 'bill', left: '57%', w: 36, h: 21, delay: '0.82s', dur: '2.25s',rotS: '-4deg',  rotE: '11deg'  },
];

// Seeded demo data so charts look alive on testnet with sparse real transactions
const _DEMO_EPOCH = Date.now();
const _DAY = 86400000;

const SEEDED_VAULT_EVENTS = [
  { amount: 20.00, timestamp: new Date(_DEMO_EPOCH - 32*_DAY).toISOString(), title: 'Initial Vault Deposit',  type: 'deposit'  as const },
  { amount:  2.00, timestamp: new Date(_DEMO_EPOCH - 22*_DAY).toISOString(), title: 'Round-Up Deposit',       type: 'deposit'  as const },
  { amount:  1.25, timestamp: new Date(_DEMO_EPOCH - 14*_DAY).toISOString(), title: 'Round-Up Deposit',       type: 'deposit'  as const },
  { amount:  0.75, timestamp: new Date(_DEMO_EPOCH -  6*_DAY).toISOString(), title: 'Round-Up Deposit',       type: 'deposit'  as const },
];

const DEMO_YIELD_EARNED = 1.24;  // ~4.2% APY on ~$23 avg balance over 32 days

export default function App() {
  // Intro animation
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const introStartRef = useRef(Date.now());

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'merchant' | 'settings'>('dashboard');

  // Wallet State
  const [wallet, setWallet] = useState<WalletDetails | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(true);
  const [balances, setBalances] = useState<{ eth: string; usdc: string; eoaUsdc: string; vaultUsdc: string; vaultShares: string }>({ eth: '0.00', usdc: '0.00', eoaUsdc: '0.00', vaultUsdc: '0.00', vaultShares: '0.00' });
  const [copiedText, setCopiedText] = useState<string>('');
  const [isRefreshingBalances, setIsRefreshingBalances] = useState<boolean>(false);
  const [walletDetailsOpen, setWalletDetailsOpen] = useState<boolean>(false);

  // Settings State
  const [oinkPolicyEnabled, setOinkPolicyEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('oink_policy_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [oinkPolicy, setOinkPolicy] = useState<string>(() => {
    return localStorage.getItem('oink_policy') || 'nearest-1';
  });
  const [vaultAddress, setVaultAddress] = useState<string>(() => {
    return localStorage.getItem('oink_vault_address') || DEFAULT_VAULT_ADDRESS;
  });

  // Merchant State
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; price: number; emoji: string } | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [checkoutStep, setCheckoutStep] = useState<'idle' | 'confirm' | 'sending' | 'success'>('idle');
  const [activeTxResult, setActiveTxResult] = useState<{
    merchantAmount: number;
    roundupAmount: number;
    totalAmount: number;
    txHash: string;
  } | null>(null);

  // Withdraw State
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawStep, setWithdrawStep] = useState<'idle' | 'confirm' | 'sending' | 'success'>('idle');
  const [withdrawSharesPreview, setWithdrawSharesPreview] = useState<string>('0.00');
  const [activeWithdrawHash, setActiveWithdrawHash] = useState<string>('');

  // Transaction History State
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('oink_transactions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback to initial defaults
      }
    }
    return [
      {
        id: "tx-1",
        type: "purchase",
        title: "Espresso - Cafe Oink",
        amount: 3.25,
        roundup: 0.75,
        timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        status: "success",
        txHash: "0x4e6b223c6f8d167ae510a8b9f1d07ec62ea34b07fb88de51ca1c67d3e098bc5a"
      },
      {
        id: "tx-2",
        type: "savings",
        title: "Oink Vault Round-Up",
        amount: 0.75,
        roundup: 0,
        timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        status: "success",
        txHash: "0x4e6b223c6f8d167ae510a8b9f1d07ec62ea34b07fb88de51ca1c67d3e098bc5a"
      },
      {
        id: "tx-3",
        type: "purchase",
        title: "Matcha Latte - Cafe Oink",
        amount: 4.50,
        roundup: 0.50,
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "success",
        txHash: "0x89fd10631ac72b834928271a2d1be3b1e35fa890c01bcfe5a6d71b3e157abdf1"
      },
      {
        id: "tx-4",
        type: "savings",
        title: "Oink Vault Round-Up",
        amount: 0.50,
        roundup: 0,
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "success",
        txHash: "0x89fd10631ac72b834928271a2d1be3b1e35fa890c01bcfe5a6d71b3e157abdf1"
      }
    ] as Transaction[];
  });

  // Load / Initialize Wallet on Mount
  useEffect(() => {
    const pkey = getOrCreateEOA();
    loadWallet(pkey);
  }, []);

  // Sync states to localStorage
  useEffect(() => {
    localStorage.setItem('oink_policy_enabled', String(oinkPolicyEnabled));
  }, [oinkPolicyEnabled]);

  useEffect(() => {
    localStorage.setItem('oink_policy', oinkPolicy);
  }, [oinkPolicy]);

  useEffect(() => {
    localStorage.setItem('oink_vault_address', vaultAddress);
  }, [vaultAddress]);

  useEffect(() => {
    localStorage.setItem('oink_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Dismiss intro after wallet loads (minimum 2.4s so the animation feels satisfying)
  useEffect(() => {
    if (!loadingWallet) {
      const elapsed = Date.now() - introStartRef.current;
      const minDuration = 2400;
      const remaining = Math.max(0, minDuration - elapsed);
      const timer = setTimeout(() => {
        setIntroFading(true);
        setTimeout(() => setShowIntro(false), 700);
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [loadingWallet]);

  const loadWallet = async (pkey: string) => {
    setLoadingWallet(true);
    const details = await initBiconomyAccount(pkey);
    setWallet(details);

    // Fetch balances
    const bal = await fetchBalances(details.smartAccountAddress, details.signerAddress, details.isSimulated);
    setBalances(bal);
    setLoadingWallet(false);
  };

  const handleResetWallet = async () => {
    if (window.confirm("Are you sure you want to generate a new mock EOA? Your old private key and local balances will be reset.")) {
      const newPkey = resetEOA();
      localStorage.removeItem('oink_mock_eth');
      localStorage.removeItem('oink_mock_usdc');
      localStorage.setItem('oink_vault_balance', '24.50');
      localStorage.setItem('oink_vault_shares', '24.50');
      setBalances(prev => ({ ...prev, vaultUsdc: '24.50', vaultShares: '24.50' }));
      await loadWallet(newPkey);
    }
  };

  const handleImportPrivateKey = async () => {
    const pkey = window.prompt("Enter your EOA Private Key (64-character hex starting with 0x):");
    if (pkey) {
      const cleanKey = pkey.trim();
      if (/^0x[a-fA-F0-9]{64}$/.test(cleanKey)) {
        localStorage.setItem("oink_eoa_private_key", cleanKey);
        localStorage.removeItem('oink_mock_eth');
        localStorage.removeItem('oink_mock_usdc');
        localStorage.setItem('oink_vault_balance', '0.00');
        localStorage.setItem('oink_vault_shares', '0.00');
        setBalances(prev => ({ ...prev, vaultUsdc: '0.00', vaultShares: '0.00' }));
        await loadWallet(cleanKey);
      } else {
        alert("Invalid private key format! It must be a 64-character hex string starting with 0x.");
      }
    }
  };

  const handleRefreshBalances = async () => {
    if (!wallet) return;
    setIsRefreshingBalances(true);
    const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, wallet.isSimulated);
    setBalances(bal);
    setIsRefreshingBalances(false);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // Store Items definition
  const storeItems = [
    { id: 'coffee', name: 'Oink Espresso', price: 3.25, emoji: '☕' },
    { id: 'croissant', name: 'Butter Croissant', price: 4.50, emoji: '🥐' },
    { id: 'toast', name: 'Avocado Toast', price: 8.75, emoji: '🥑' },
    { id: 'smoothie', name: 'Berry Smoothie', price: 6.10, emoji: '🥤' }
  ];

  const getCheckoutDetails = () => {
    let price = 0;
    let name = "Custom Checkout";

    if (selectedItem) {
      price = selectedItem.price;
      name = selectedItem.name;
    } else {
      price = parseFloat(customAmount) || 0;
    }

    if (price <= 0) return { name, price, roundup: 0, total: 0 };

    if (!oinkPolicyEnabled) {
      return { name, price, roundup: 0, total: price };
    }

    const { total, roundup } = calculateRoundUp(price, oinkPolicy);
    return { name, price, roundup, total };
  };

  const { price: checkoutPrice, roundup: checkoutRoundup, total: checkoutTotal, name: checkoutName } = getCheckoutDetails();

  const handlePayClick = () => {
    if (checkoutPrice <= 0) return;
    
    // Check if user has enough USDC in their owner EOA signer wallet
    const userUsdc = parseFloat(balances.eoaUsdc);
    const requiredTotal = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice;
    
    if (userUsdc < requiredTotal) {
      alert(`Insufficient USDC balance! You have $${userUsdc.toFixed(2)} but this transaction requires $${requiredTotal.toFixed(2)}.`);
      return;
    }

    setCheckoutStep('confirm');
  };

  const handleConfirmOink = () => {
    setCheckoutStep('sending');
    const finalRoundup = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutRoundup : 0;
    const finalTotal = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice;
    executeMockTransaction(checkoutPrice, finalRoundup, finalTotal);
  };

  const executeMockTransaction = async (price: number, roundup: number, total: number) => {
    let txHash = "";

    if (wallet && !wallet.isSimulated) {
      try {
        // Run real transaction on-chain via EOA -> Smart Account -> Merchant + Vault
        txHash = await executeOinkPayment(
          wallet.privateKey,
          wallet.smartAccountAddress,
          MERCHANT_ADDRESS,
          price,
          roundup,
          vaultAddress
        );

        // Refresh actual balances from blockchain
        const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, false);
        setBalances(bal);
      } catch (err: any) {
        console.error("On-chain transaction execution failed:", err);
        alert(`Transaction failed: ${err.message || err}`);
        setCheckoutStep('idle');
        return;
      }
    } else {
      // Simulate smart account txn signature & execution delay
      await new Promise(r => setTimeout(r, 2200));

      // Deduct USDC balance from owner EOA
      const currentEoaUsdc = parseFloat(balances.eoaUsdc);
      const newEoaUsdc = (currentEoaUsdc - total).toFixed(2);
      localStorage.setItem('oink_mock_eoa_usdc', newEoaUsdc);

      // If Oink is enabled, add to vault
      let newVaultUsdc = balances.vaultUsdc;
      let newVaultShares = balances.vaultShares;
      if (oinkPolicyEnabled && roundup > 0) {
        const newVault = parseFloat(balances.vaultUsdc) + roundup;
        newVaultUsdc = newVault.toFixed(2);
        localStorage.setItem('oink_vault_balance', newVaultUsdc);

        const newShares = parseFloat(balances.vaultShares) + roundup;
        newVaultShares = newShares.toFixed(2);
        localStorage.setItem('oink_vault_shares', newVaultShares);
      }

      // Update state balance
      setBalances(prev => ({
        ...prev,
        eoaUsdc: newEoaUsdc,
        vaultUsdc: newVaultUsdc,
        vaultShares: newVaultShares
      }));

      txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    // Add transactions to history
    const mainTx: Transaction = {
      id: `tx-m-${Date.now()}`,
      type: 'purchase',
      title: selectedItem ? `${selectedItem.name} Purchase` : 'Merchant Payment',
      amount: price,
      roundup: roundup,
      timestamp: new Date().toISOString(),
      status: 'success',
      txHash: txHash
    };

    let newTxs = [mainTx];

    if (oinkPolicyEnabled && roundup > 0) {
      const savingsTx: Transaction = {
        id: `tx-s-${Date.now()}`,
        type: 'savings',
        title: 'Oink Round-Up Savings',
        amount: roundup,
        roundup: 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        txHash: txHash
      };
      newTxs.push(savingsTx);
    }

    setTransactions(prev => [...newTxs, ...prev]);
    setActiveTxResult({
      merchantAmount: price,
      roundupAmount: roundup,
      totalAmount: total,
      txHash: txHash
    });
    setCheckoutStep('success');

    // Clean selections
    setSelectedItem(null);
    setCustomAmount('');
  };

  const handleWithdrawClick = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount of USDC to withdraw.");
      return;
    }
    
    const available = parseFloat(balances.vaultUsdc);
    if (amount > available) {
      alert(`Insufficient savings in OinkVault! You can withdraw up to $${available.toFixed(2)} USDC.`);
      return;
    }

    setWithdrawStep('confirm');
    
    // Preview the shares to burn
    if (wallet && !wallet.isSimulated) {
      const shares = await previewWithdrawShares(vaultAddress, amount);
      setWithdrawSharesPreview(shares);
    } else {
      // 1:1 in simulation
      setWithdrawSharesPreview(amount.toFixed(2));
    }
  };

  const handleConfirmWithdraw = async () => {
    setWithdrawStep('sending');
    const amount = parseFloat(withdrawAmount);
    let txHash = "";

    if (wallet && !wallet.isSimulated) {
      try {
        txHash = await executeOinkWithdraw(
          wallet.privateKey,
          wallet.smartAccountAddress,
          vaultAddress,
          amount
        );

        // Fetch updated balances
        const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, false);
        setBalances(bal);
      } catch (err: any) {
        console.error("On-chain withdrawal failed:", err);
        alert(`Withdrawal failed: ${err.message || err}`);
        setWithdrawStep('idle');
        return;
      }
    } else {
      // Mock withdrawal simulation
      await new Promise(r => setTimeout(r, 2200));

      const mockVaultBalance = parseFloat(balances.vaultUsdc);
      const mockVaultShares = parseFloat(balances.vaultShares);
      const mockEoaUsdc = parseFloat(balances.eoaUsdc);

      const newVaultUsdc = (mockVaultBalance - amount).toFixed(2);
      const newVaultShares = (mockVaultShares - amount).toFixed(2);
      const newEoaUsdc = (mockEoaUsdc + amount).toFixed(2);

      localStorage.setItem('oink_vault_balance', newVaultUsdc);
      localStorage.setItem('oink_vault_shares', newVaultShares);
      localStorage.setItem('oink_mock_eoa_usdc', newEoaUsdc);

      setBalances(prev => ({
        ...prev,
        vaultUsdc: newVaultUsdc,
        vaultShares: newVaultShares,
        eoaUsdc: newEoaUsdc
      }));

      txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    // Add withdrawal to transaction history
    const withdrawTx: Transaction = {
      id: `tx-w-${Date.now()}`,
      type: 'savings',
      title: 'Oink Vault Savings Withdrawal',
      amount: amount,
      roundup: 0,
      timestamp: new Date().toISOString(),
      status: 'success',
      txHash: txHash
    };

    setTransactions(prev => [withdrawTx, ...prev]);
    setActiveWithdrawHash(txHash);
    setWithdrawStep('success');
  };

  // Vault balance for seeded chart calculations
  const vaultBalance = parseFloat(balances.vaultUsdc) || 0;

  // Use actual vault balance for chart scaling; fall back to demo seed (24.50) so the
  // sparkline is always visible even on a fresh wallet with no deposits yet.
  const chartBase = vaultBalance > 0 ? vaultBalance : 24.50;
  const yieldHistory = [
    { t: _DEMO_EPOCH - 32*_DAY, v: chartBase * 0.840 },
    { t: _DEMO_EPOCH - 26*_DAY, v: chartBase * 0.872 },
    { t: _DEMO_EPOCH - 20*_DAY, v: chartBase * 0.897 },
    { t: _DEMO_EPOCH - 15*_DAY, v: chartBase * 0.921 },
    { t: _DEMO_EPOCH - 10*_DAY, v: chartBase * 0.946 },
    { t: _DEMO_EPOCH -  6*_DAY, v: chartBase * 0.966 },
    { t: _DEMO_EPOCH -  3*_DAY, v: chartBase * 0.984 },
    { t: _DEMO_EPOCH,            v: chartBase },
  ];

  // Merge seeded events + real savings transactions, newest first
  const allVaultEvents = [
    ...SEEDED_VAULT_EVENTS,
    ...transactions
      .filter(tx => tx.type === 'savings')
      .map(tx => ({ amount: tx.amount, timestamp: tx.timestamp, title: tx.title, type: 'deposit' as const }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const renderYieldSparkline = () => {
    const pts = yieldHistory;
    if (pts.length < 2) return null;
    const W = 120, H = 40;
    const minT = pts[0].t, maxT = pts[pts.length - 1].t;
    const minV = Math.min(...pts.map(p => p.v));
    const maxV = Math.max(...pts.map(p => p.v));
    const vRange = maxV - minV || 1;
    const toX = (t: number) => ((t - minT) / (maxT - minT)) * W;
    const toY = (v: number) => H - 2 - ((v - minV) / vRange) * (H - 6);
    const linePts = pts.map(p => `${toX(p.t)},${toY(p.v)}`).join(' ');
    const fillPts = `${toX(minT)},${H} ${linePts} ${toX(maxT)},${H}`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '120px', height: '40px', display: 'block', flexShrink: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.22)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill="url(#sparkGrad)" />
        <polyline points={linePts} fill="none" stroke="#10b981" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className="app-container">

      {/* Opening coin/cash animation */}
      {showIntro && (
        <div className={`intro-overlay${introFading ? ' fading' : ''}`}>
          <div className="intro-coin-field">
            {INTRO_ELEMENTS.map((el, i) =>
              el.type === 'coin' ? (
                <div
                  key={i}
                  className="intro-coin"
                  style={{
                    left: el.left,
                    width: el.size,
                    height: el.size,
                    '--delay': el.delay,
                    '--dur': el.dur,
                    '--rot-s': el.rotS,
                    '--rot-e': el.rotE,
                  } as React.CSSProperties}
                />
              ) : (
                <div
                  key={i}
                  className="intro-bill"
                  style={{
                    left: el.left,
                    width: el.w,
                    height: el.h,
                    '--delay': el.delay,
                    '--dur': el.dur,
                    '--rot-s': el.rotS,
                    '--rot-e': el.rotE,
                  } as React.CSSProperties}
                />
              )
            )}
          </div>
          <div className="intro-center">
            <img src="/piggybank_logo.png" alt="Oink" className="intro-wallet-icon" />
            <div className="intro-text">
              <h2>Setting up your Oink wallet</h2>
              <p>One moment while we get everything ready</p>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <a href="#" className="sidebar-logo" onClick={() => setActiveTab('dashboard')}>
          <img src="/piggybank_logo.png" alt="Oink" className="sidebar-logo-img" />
          <span>Oink Protocol</span>
        </a>

        <nav className="nav-links">
          <div
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <WalletIcon size={20} />
            <span>Dashboard</span>
          </div>

          <div
            className={`nav-link ${activeTab === 'merchant' ? 'active' : ''}`}
            onClick={() => setActiveTab('merchant')}
          >
            <ShoppingBag size={20} />
            <span>Merchant</span>
          </div>

          <div
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-pill connected">
            <span className="connection-dot"></span>
            <span>Arc Testnet</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">

        {/* Header */}
        <header className="header">
          <div className="header-title">
            {activeTab === 'dashboard' && (
              <>
                <h1>Oink Smart Wallet</h1>
                <p>See your wallet, balances, and round-up savings all in one place.</p>
              </>
            )}
            {activeTab === 'merchant' && (
              <>
                <h1>Merchant Checkout</h1>
                <p>Process a sample transaction and see how round-up savings are applied in real time.</p>
              </>
            )}
            {activeTab === 'settings' && (
              <>
                <h1>Settings</h1>
                <p>Choose how Oink rounds up your purchases and grows your savings.</p>
              </>
            )}
          </div>

          <div className="header-actions">
            {wallet && (
              <div className={`connection-pill ${wallet.isSimulated ? '' : 'connected'}`}>
                <span className="connection-dot"></span>
                <span>{wallet.isSimulated ? 'Demo Mode' : 'Connected'}</span>
              </div>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefreshBalances}
              disabled={isRefreshingBalances || loadingWallet}
              title="Refresh balances from blockchain"
            >
              <RefreshCw size={14} className={isRefreshingBalances ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Loading overlay when initializing wallet */}
        {loadingWallet ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4rem 0' }}>
            <div className="spinner pink" style={{ width: '48px', height: '48px', borderWidth: '4px', marginBottom: '1.5rem' }}></div>
            <h3>Setting up Oink Smart Wallet...</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Getting everything ready...</p>
          </div>
        ) : (
          <>
            {/* TAB: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="tab-content">

                {/* 1. Signing Wallet — minimal full-width bar */}
                <div className="signing-wallet-topbar">
                  <div className="signing-wallet-topbar-label">
                    <Coins size={14} color="var(--primary)" />
                    <span>Current Balance</span>
                  </div>
                  <div>
                    <span className="signing-wallet-topbar-balance">${parseFloat(balances.eoaUsdc).toFixed(2)}</span>
                    <span className="signing-wallet-topbar-unit">USDC</span>
                  </div>
                </div>

                {/* 2. Oink Vault Savings — hero, full width */}
                  <div className="glass-card glow-pink vault-hero-card">
                    <div className="vault-hero-header">
                      <div className="vault-hero-label">
                        <PiggyBank size={16} color="var(--secondary)" />
                        <span>Oink Vault Savings</span>
                      </div>
                      <span className="apy-badge">
                        <ArrowUpRight size={12} />
                        Earning 4.2% APY
                      </span>
                    </div>

                    <div className="vault-hero-amount">
                      {parseFloat(balances.vaultShares).toFixed(2)}
                      <span className="vault-hero-unit">ybOINK</span>
                    </div>
                    <div className="vault-hero-usdc">≈ ${parseFloat(balances.vaultUsdc).toFixed(2)} USDC on-chain</div>

                    <div className="vault-withdraw-row">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="USDC amount to withdraw"
                        className="custom-input pink"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                      />
                      <button
                        className="btn btn-pink btn-sm"
                        onClick={handleWithdrawClick}
                        disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
                      >
                        Withdraw
                      </button>
                    </div>

                    <div className="vault-bottom-grid">

                      {/* Yield Gains Growth — compact sparkline stat */}
                      <div className="vault-yield-section">
                        <div className="vault-chart-label">Yield Gains Growth</div>
                        <div className="yield-stat-row">
                          <div>
                            <div className="yield-earned-amount">+${DEMO_YIELD_EARNED.toFixed(2)}</div>
                            <div className="yield-earned-sub">earned · 32d @ 4.2% APY</div>
                          </div>
                          {renderYieldSparkline()}
                        </div>
                        <div className="yield-period-stat">
                          <ArrowUpRight size={11} />
                          +{((DEMO_YIELD_EARNED / Math.max(vaultBalance - DEMO_YIELD_EARNED, 1)) * 100).toFixed(1)}% total return
                        </div>
                      </div>

                      {/* Vault Activity History — event list */}
                      <div className="vault-activity-section">
                        <div className="vault-chart-label">Vault Activity</div>
                        <div className="vault-activity-list">
                          {allVaultEvents.slice(0, 5).map((event, i) => (
                            <div key={i} className="vault-activity-item">
                              <div className={`vault-activity-dot ${event.type}`} />
                              <div className="vault-activity-meta">
                                <span className="vault-activity-title">{event.title}</span>
                                <span className="vault-activity-date">
                                  {new Date(event.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <span className={`vault-activity-amount${ (event.type as string) === 'withdrawal' ? ' withdrawal' : ''}`}>
                                {(event.type as string) === 'withdrawal' ? '-' : '+'}${event.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>


                {/* Account Details Card */}
                <div className="glass-card glow-primary wallet-conn-card" style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: walletDetailsOpen ? '1.5rem' : '0' }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck color="var(--primary)" size={24} />
                        Oink Smart Wallet
                      </h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Secure, gas-optimized smart piggy bank wallet.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button className="btn btn-secondary btn-sm" onClick={handleImportPrivateKey}>
                        Import Key
                      </button>
                      <button className="btn btn-secondary btn-sm btn-danger" onClick={handleResetWallet}>
                        Reset Key
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, minWidth: '32px' }}
                        onClick={() => setWalletDetailsOpen(!walletDetailsOpen)}
                        title={walletDetailsOpen ? 'Hide Wallet Details' : 'Show Wallet Details'}
                      >
                        {walletDetailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {walletDetailsOpen && (
                    <div className="wallet-connected-grid" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
                      <div className="wallet-details">
                        <div className="detail-row">
                          <span className="detail-label">Smart Account Address</span>
                          <div className="detail-value">
                            {wallet ? `${wallet.smartAccountAddress.slice(0, 8)}...${wallet.smartAccountAddress.slice(-8)}` : '0x0'}
                            <button className="copy-btn" onClick={() => wallet && handleCopy(wallet.smartAccountAddress, 'sa')}>
                              {copiedText === 'sa' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>

                        <div className="detail-row">
                          <span className="detail-label">EOA Signer Address (Owner)</span>
                          <div className="detail-value">
                            {wallet ? `${wallet.signerAddress.slice(0, 8)}...${wallet.signerAddress.slice(-8)}` : '0x0'}
                            <button className="copy-btn" onClick={() => wallet && handleCopy(wallet.signerAddress, 'eoa')}>
                              {copiedText === 'eoa' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="wallet-details">
                        <div className="detail-row">
                          <span className="detail-label">Network</span>
                          <span className="detail-value" style={{ background: 'rgba(219, 39, 119, 0.05)', color: 'var(--primary)', borderColor: 'rgba(219, 39, 119, 0.15)', borderWidth: '1px', borderStyle: 'solid' }}>
                            Arc Testnet (Chain 5042002)
                          </span>
                        </div>

                        <div className="detail-row">
                          <span className="detail-label">Deployment Status</span>
                          <span className="status-indicator success">
                            <Check size={12} />
                            Active (Demo Ready)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB: MOCK MERCHANT */}
            {activeTab === 'merchant' && (
              <div className="tab-content">
                <div className="glass-card merchant-layout">

                  {/* Storefront Selection */}
                  <div>
                    <div className="merchant-header">
                      <div className="merchant-logo">☕</div>
                      <div className="merchant-title">
                        <h2>Cafe Oink & Bakery</h2>
                        <p>Sample merchant checkout</p>
                      </div>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>Select an Item</h3>

                    <div className="store-grid">
                      {storeItems.map((item) => (
                        <div
                          key={item.id}
                          className={`store-item ${selectedItem?.id === item.id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedItem(item);
                            setCustomAmount('');
                          }}
                        >
                          <span className="store-item-emoji">{item.emoji}</span>
                          <span className="store-item-name">{item.name}</span>
                          <span className="store-item-price">${item.price.toFixed(2)}</span>
                          {selectedItem?.id === item.id && (
                            <span className="store-item-badge">Selected</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ margin: '1.5rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ height: '1px', background: 'var(--card-border)', flex: 1 }}></span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dark)', fontWeight: 600 }}>OR ENTER A CUSTOM AMOUNT</span>
                        <span style={{ height: '1px', background: 'var(--card-border)', flex: 1 }}></span>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Enter custom USDC amount"
                          className="custom-input pink"
                          style={{ paddingLeft: '32px' }}
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setSelectedItem(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary & Checkout Actions */}
                  <div className="checkout-summary" style={{ background: 'rgba(255, 248, 251, 0.85)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(236, 72, 153, 0.1)' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text)' }}>
                      Order Summary
                    </h3>

                    <div>
                      {checkoutPrice > 0 ? (
                        <>
                          <div className="receipt-row">
                            <span style={{ color: 'var(--text-muted)' }}>{checkoutName}</span>
                            <span>${checkoutPrice.toFixed(2)} USDC</span>
                          </div>

                          {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                            <>
                              <div className="receipt-row" style={{ color: 'var(--secondary)' }}>
                                <span style={{ fontWeight: 600 }}>🐖 Oink Round-Up</span>
                                <span style={{ fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>+${checkoutRoundup.toFixed(2)} USDC</span>
                              </div>
                              <div style={{ marginTop: '-0.35rem', marginBottom: '0.25rem' }}>
                                <span style={{ display: 'inline-block', fontSize: '0.7rem', padding: '1px 5px', background: 'rgba(236,72,153,0.12)', borderRadius: '4px', textTransform: 'uppercase', color: 'var(--secondary)', fontWeight: 500 }}>
                                  {oinkPolicy.replace('nearest-', 'Nearest $')}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.3rem', opacity: 0.8 }}>
                                <PiggyBank size={13} style={{ flexShrink: 0 }} />
                                <span>Spare change routes to your Oink Vault automatically.</span>
                              </div>
                            </>
                          ) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                              {!oinkPolicyEnabled
                                ? 'Round-ups are disabled.'
                                : 'No round-up — amount is already a whole number.'}
                            </p>
                          )}

                          <div className="receipt-row total">
                            <span>Total Bill</span>
                            <span>${checkoutTotal.toFixed(2)} USDC</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          Select an item or enter a custom amount to begin checkout.
                        </div>
                      )}
                    </div>

                    <button
                      className="btn btn-pink btn-block"
                      style={{ marginTop: '1.25rem' }}
                      disabled={checkoutPrice <= 0}
                      onClick={handlePayClick}
                    >
                      <Coins size={18} />
                      Pay with Oink Wallet
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="tab-content">
                <div className="glass-card settings-grid">

                  {/* Left Column: Switch & Presets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'var(--text)' }}>
                      Oink Round-Up Rules
                    </h3>

                    {/* Enable Toggle */}
                    <div className="switch-control">
                      <div className="switch-label">
                        <span className="switch-title" style={{ fontSize: '1.05rem' }}>Enable Automatic Round-ups</span>
                        <span className="switch-desc">Automatically round up each USDC transaction and save the difference</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={oinkPolicyEnabled}
                          onChange={(e) => setOinkPolicyEnabled(e.target.checked)}
                        />
                        <span className="slider pink"></span>
                      </label>
                    </div>

                    {/* Round-up Presets */}
                    <div className="form-group" style={{ opacity: oinkPolicyEnabled ? 1 : 0.5, pointerEvents: oinkPolicyEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label>
                        <Sliders size={16} color="var(--secondary)" />
                        Select Round-Up Policy
                      </label>
                      <div className="policy-options">
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-1' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-1')}
                        >
                          <span className="policy-card-title">Nearest $1</span>
                          <span className="policy-card-desc">Standard (Default)</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-5' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-5')}
                        >
                          <span className="policy-card-title">Nearest $5</span>
                          <span className="policy-card-desc">Accelerate savings</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-10' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-10')}
                        >
                          <span className="policy-card-title">Nearest $10</span>
                          <span className="policy-card-desc">Maximum savings</span>
                        </div>
                      </div>
                    </div>

                    {/* Fixed Round-ups */}
                    <div className="form-group" style={{ opacity: oinkPolicyEnabled ? 1 : 0.5, pointerEvents: oinkPolicyEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label>Fixed Add-On</label>
                      <div className="policy-options">
                        <div
                          className={`policy-card ${oinkPolicy === 'fixed-0.5' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('fixed-0.5')}
                        >
                          <span className="policy-card-title">+$0.50</span>
                          <span className="policy-card-desc">Add flat $0.50</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'fixed-1' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('fixed-1')}
                        >
                          <span className="policy-card-title">+$1.00</span>
                          <span className="policy-card-desc">Add flat $1.00</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Dest Vault Config */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'var(--text)' }}>
                      Routing & Destination
                    </h3>

                    <div className="form-group">
                      <label style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>Savings Vault</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>On-Chain</span>
                      </label>
                      <input
                        type="text"
                        className="custom-input"
                        value={vaultAddress}
                        onChange={(e) => setVaultAddress(e.target.value)}
                        placeholder="0x..."
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        This is where your rounded-up savings go. Funds deposited here earn yield on-chain.
                      </p>
                    </div>

                    <div style={{ background: 'rgba(236, 72, 153, 0.04)', border: '1px dashed rgba(236, 72, 153, 0.2)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginTop: 'auto' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <PiggyBank size={18} />
                        How does Oink work?
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        Each time you pay with Oink, the round-up amount is calculated based on your chosen policy and routed to your savings vault in the same transaction — no separate approvals required.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* CONFIRM TRANSACTION MODAL */}
      {checkoutStep === 'confirm' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setCheckoutStep('idle')}>
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-badge-icon">{oinkPolicyEnabled && checkoutRoundup > 0 ? "🐖" : "💳"}</div>
              <h3>{oinkPolicyEnabled && checkoutRoundup > 0 ? "Confirm Transaction with Oink" : "Confirm Transaction"}</h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                  <>
                    Confirm transaction of <strong style={{ color: 'var(--text)' }}>${checkoutPrice.toFixed(2)} USDC</strong> with an Oink round-up of <strong style={{ color: 'var(--secondary)' }}>${checkoutRoundup.toFixed(2)} USDC</strong>?
                  </>
                ) : (
                  <>
                    Confirm transaction of <strong style={{ color: 'var(--text)' }}>${checkoutPrice.toFixed(2)} USDC</strong> (Oink round-up is disabled)?
                  </>
                )}
              </p>

              <div className="oink-receipt">
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Purchase Amount</span>
                  <span>${checkoutPrice.toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight" style={{ opacity: oinkPolicyEnabled && checkoutRoundup > 0 ? 1 : 0.5 }}>
                  <span>Oink Round-Up {!(oinkPolicyEnabled && checkoutRoundup > 0) && "(Disabled)"}</span>
                  <span>{oinkPolicyEnabled && checkoutRoundup > 0 ? `+$${checkoutRoundup.toFixed(2)}` : "$0.00"} USDC</span>
                </div>

                <div className="oink-receipt-row total-row">
                  <span>Total Debit</span>
                  <span>${(oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice).toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.12)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <ShieldCheck size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                    <>
                      Your payment and round-up savings go through in one step — no extra approvals needed.
                    </>
                  ) : (
                    <>
                      Your payment goes through your smart account — straightforward, no extras.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCheckoutStep('idle')}>
                Cancel
              </button>
              <button className="btn btn-pink" onClick={handleConfirmOink}>
                Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SENDING USER OPERATION MODAL */}
      {checkoutStep === 'sending' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="spinner pink" style={{ margin: '0 auto 1.5rem auto', width: '48px', height: '48px', borderWidth: '4px' }}></div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Processing your payment...
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Submitting transaction</p>
              <p>1. Authorizing payment...</p>
              <p>2. Sending to merchant...</p>
              <p>3. Routing round-up to savings vault...</p>
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.75rem' }}>Almost complete...</p>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION SUCCESS MODAL */}
      {checkoutStep === 'success' && activeTxResult && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setCheckoutStep('idle')}>
              <X size={20} />
            </button>

            <div className="success-screen">
              <div className="success-badge">
                <Check size={36} />
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem' }}>
                Payment Successful!
              </h3>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                Your transaction bundle has been confirmed.
              </p>

              <div className="oink-receipt" style={{ width: '100%', margin: '0.5rem 0' }}>
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Merchant Payment</span>
                  <span>${activeTxResult.merchantAmount.toFixed(2)} USDC</span>
                </div>

                {activeTxResult.roundupAmount > 0 && (
                  <div className="oink-receipt-row highlight">
                    <span>Oink Vault Deposit</span>
                    <span>+${activeTxResult.roundupAmount.toFixed(2)} USDC</span>
                  </div>
                )}

                <div className="oink-receipt-row total-row">
                  <span>Total Executed</span>
                  <span>${activeTxResult.totalAmount.toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Confirmed</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tx Hash</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {activeTxResult.txHash.slice(0, 10)}...{activeTxResult.txHash.slice(-10)}
                  </span>
                </div>

                <a
                  href={`https://explorer.testnet.arc.network/tx/${activeTxResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                  style={{ alignSelf: 'center' }}
                >
                  View on Arc Explorer <ArrowUpRight size={12} />
                </a>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem' }}
                onClick={() => {
                  setCheckoutStep('idle');
                  setActiveTab('dashboard');
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW CONFIRMATION MODAL */}
      {withdrawStep === 'confirm' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setWithdrawStep('idle')}>
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-badge-icon">🐖</div>
              <h3>Confirm Savings Withdrawal</h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                Are you sure you want to withdraw <strong style={{ color: 'var(--text)' }}>${parseFloat(withdrawAmount).toFixed(2)} USDC</strong> from OinkVault?
              </p>

              <div className="oink-receipt">
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Withdraw Assets</span>
                  <span>${parseFloat(withdrawAmount).toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight">
                  <span>Shares to Burn</span>
                  <span>-{parseFloat(withdrawSharesPreview).toFixed(2)} ybOINK</span>
                </div>

                <div className="oink-receipt-row total-row">
                  <span>Receiver Address</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {wallet ? `${wallet.signerAddress.slice(0, 6)}...${wallet.signerAddress.slice(-6)}` : '0x0'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <ShieldCheck size={20} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Your USDC will be sent back to your signing wallet, and your vault shares will be redeemed.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setWithdrawStep('idle')}>
                Cancel
              </button>
              <button className="btn btn-pink" onClick={handleConfirmWithdraw}>
                Confirm & Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW SENDING MODAL */}
      {withdrawStep === 'sending' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="spinner pink" style={{ margin: '0 auto 1.5rem auto', width: '48px', height: '48px', borderWidth: '4px' }}></div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Processing withdrawal...
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Submitting transaction</p>
              <p>1. Calculating withdrawal amount...</p>
              <p>2. Redeeming vault shares...</p>
              <p>3. Transferring funds to your signing wallet...</p>
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.75rem' }}>Almost complete...</p>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW SUCCESS MODAL */}
      {withdrawStep === 'success' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => { setWithdrawStep('idle'); setWithdrawAmount(''); }}>
              <X size={20} />
            </button>

            <div className="success-screen">
              <div className="success-badge" style={{ background: 'var(--success-glow)', color: 'var(--success)', border: '2px solid var(--success)' }}>
                <Check size={36} />
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem' }}>
                Withdrawal Successful!
              </h3>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                Your savings have been redeemed from OinkVault and returned to your signing wallet.
              </p>

              <div className="oink-receipt" style={{ width: '100%', margin: '0.5rem 0' }}>
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Amount Withdrawn</span>
                  <span>${parseFloat(withdrawAmount).toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight">
                  <span>ybOINK Burned</span>
                  <span>-{parseFloat(withdrawSharesPreview).toFixed(2)} ybOINK</span>
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Confirmed</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tx Hash</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {activeWithdrawHash.slice(0, 10)}...{activeWithdrawHash.slice(-10)}
                  </span>
                </div>

                <a
                  href={`https://explorer.testnet.arc.network/tx/${activeWithdrawHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                  style={{ alignSelf: 'center' }}
                >
                  View on Arc Explorer <ArrowUpRight size={12} />
                </a>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem' }}
                onClick={() => {
                  setWithdrawStep('idle');
                  setWithdrawAmount('');
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
