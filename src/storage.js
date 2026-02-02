/**
 * Storage with file-based persistence for Plaid connections
 * Uses JSON file so bot and server processes can share data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'connections.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ============================================
// File-based Connection Storage
// ============================================

function loadConnections() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading connections:', error);
  }
  return { connections: {}, transactionCache: {} };
}

function saveConnections(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving connections:', error);
  }
}

// Mock bank transaction data - used when no Plaid connection exists
const MOCK_TRANSACTIONS = [
  { id: 'txn_001', date: '2026-01-02', amount: -45.67, merchant: 'Whole Foods Market', category: 'groceries', account: 'Chase Checking' },
  { id: 'txn_002', date: '2026-01-03', amount: -12.50, merchant: 'Starbucks', category: 'food', account: 'Chase Checking' },
  { id: 'txn_003', date: '2026-01-05', amount: 3500.00, merchant: 'Employer Direct Deposit', category: 'income', account: 'Chase Checking' },
  { id: 'txn_004', date: '2026-01-06', amount: -89.99, merchant: 'Amazon', category: 'shopping', account: 'Amex Platinum' },
  { id: 'txn_005', date: '2026-01-07', amount: -150.00, merchant: 'PG&E', category: 'utilities', account: 'Chase Checking' },
  { id: 'txn_006', date: '2026-01-08', amount: -35.00, merchant: 'Uber', category: 'transport', account: 'Amex Platinum' },
  { id: 'txn_007', date: '2026-01-10', amount: -78.50, merchant: 'Trader Joes', category: 'groceries', account: 'Chase Checking' },
  { id: 'txn_008', date: '2026-01-12', amount: -25.00, merchant: 'Netflix', category: 'entertainment', account: 'Amex Platinum' },
  { id: 'txn_009', date: '2026-01-12', amount: -15.99, merchant: 'Spotify', category: 'entertainment', account: 'Amex Platinum' },
  { id: 'txn_010', date: '2026-01-15', amount: -200.00, merchant: 'CVS Pharmacy', category: 'health', account: 'Chase Checking' },
  { id: 'txn_011', date: '2026-01-18', amount: -65.00, merchant: 'Chipotle', category: 'food', account: 'Amex Platinum' },
  { id: 'txn_012', date: '2026-01-19', amount: 3500.00, merchant: 'Employer Direct Deposit', category: 'income', account: 'Chase Checking' },
  { id: 'txn_013', date: '2026-01-20', amount: -1200.00, merchant: 'Rent Payment', category: 'housing', account: 'Chase Checking' },
  { id: 'txn_014', date: '2026-01-22', amount: -55.00, merchant: 'Shell Gas Station', category: 'transport', account: 'Chase Checking' },
  { id: 'txn_015', date: '2026-01-24', amount: -125.00, merchant: 'Target', category: 'shopping', account: 'Amex Platinum' },
  { id: 'txn_016', date: '2026-01-25', amount: -42.00, merchant: 'Grubhub', category: 'food', account: 'Amex Platinum' },
  { id: 'txn_017', date: '2026-01-27', amount: -95.50, merchant: 'Costco', category: 'groceries', account: 'Chase Checking' },
  { id: 'txn_018', date: '2026-01-28', amount: 500.00, merchant: 'Venmo Transfer', category: 'transfer', account: 'Chase Checking' },
  { id: 'txn_019', date: '2026-01-29', amount: -180.00, merchant: 'United Airlines', category: 'travel', account: 'Amex Platinum' },
  { id: 'txn_020', date: '2026-01-30', amount: -28.00, merchant: 'Lyft', category: 'transport', account: 'Amex Platinum' },
];

const MOCK_ACCOUNTS = [
  { id: 'acc_001', name: 'Chase Checking', type: 'checking', balance: 4250.33, institution: 'Chase' },
  { id: 'acc_002', name: 'Amex Platinum', type: 'credit', balance: -892.48, institution: 'American Express' },
];

export const CATEGORIES = [
  'groceries', 'food', 'shopping', 'transport', 'utilities',
  'entertainment', 'health', 'housing', 'travel', 'income', 'transfer', 'other'
];

// ============================================
// Plaid Connection Management (file-based)
// ============================================

export function saveUserConnection(userId, connection) {
  const data = loadConnections();
  data.connections[userId] = connection;
  saveConnections(data);
  console.log(`💾 Saved connection for user ${userId}`);
}

export function getUserConnection(userId) {
  const data = loadConnections();
  return data.connections[userId];
}

export function hasPlaidConnection(userId) {
  const data = loadConnections();
  return !!data.connections[userId];
}

export function cacheTransactions(userId, transactions) {
  const data = loadConnections();
  data.transactionCache[userId] = {
    transactions,
    cachedAt: new Date().toISOString(),
  };
  saveConnections(data);
  console.log(`💾 Cached ${transactions.length} transactions for user ${userId}`);
}

export function getCachedTransactions(userId) {
  const data = loadConnections();
  return data.transactionCache[userId];
}

// ============================================
// Chat History Management
// ============================================

export function getChatHistory(userId) {
  const data = loadConnections();
  // Ensure chatHistory exists in data
  if (!data.chatHistory) {
    data.chatHistory = {};
  }
  return data.chatHistory[userId] || [];
}

export function appendChatHistory(userId, role, content) {
  const data = loadConnections();
  if (!data.chatHistory) {
    data.chatHistory = {};
  }

  if (!data.chatHistory[userId]) {
    data.chatHistory[userId] = [];
  }

  // Add new message
  data.chatHistory[userId].push({ role, content, timestamp: new Date().toISOString() });

  // Keep only last 20 messages to prevent infinite growth
  if (data.chatHistory[userId].length > 20) {
    data.chatHistory[userId] = data.chatHistory[userId].slice(-20);
  }

  saveConnections(data);
}

export function clearChatHistory(userId) {
  const data = loadConnections();
  if (data.chatHistory && data.chatHistory[userId]) {
    delete data.chatHistory[userId];
    saveConnections(data);
    console.log(`🧹 Cleared chat history for user ${userId}`);
  }
}

// ============================================
// Data Access Functions
// ============================================

export function getTransactions(userId = null, filters = {}) {
  let transactions;
  const cached = userId ? getCachedTransactions(userId) : null;

  if (cached) {
    transactions = [...cached.transactions];
  } else {
    transactions = [...MOCK_TRANSACTIONS];
  }

  if (filters.category) {
    transactions = transactions.filter(t => t.category === filters.category.toLowerCase());
  }
  if (filters.merchant) {
    const search = filters.merchant.toLowerCase();
    transactions = transactions.filter(t => t.merchant.toLowerCase().includes(search));
  }
  if (filters.startDate) {
    transactions = transactions.filter(t => t.date >= filters.startDate);
  }
  if (filters.endDate) {
    transactions = transactions.filter(t => t.date <= filters.endDate);
  }
  if (filters.minAmount !== undefined) {
    transactions = transactions.filter(t => t.amount >= filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    transactions = transactions.filter(t => t.amount <= filters.maxAmount);
  }
  if (filters.account) {
    const search = filters.account.toLowerCase();
    transactions = transactions.filter(t => t.account.toLowerCase().includes(search));
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));

  if (filters.limit) {
    transactions = transactions.slice(0, filters.limit);
  }

  return transactions;
}

export function getAccounts(userId = null) {
  const connection = userId ? getUserConnection(userId) : null;

  if (connection && connection.accounts) {
    return connection.accounts;
  }

  return [...MOCK_ACCOUNTS];
}

export function getSpendingSummary(userId = null, startDate = null, endDate = null) {
  const allTransactions = getTransactions(userId);
  let transactions = allTransactions.filter(t =>
    t.amount < 0 && t.category !== 'income' && t.category !== 'transfer'
  );

  if (startDate) transactions = transactions.filter(t => t.date >= startDate);
  if (endDate) transactions = transactions.filter(t => t.date <= endDate);

  const summary = {};
  for (const t of transactions) {
    if (!summary[t.category]) {
      summary[t.category] = { total: 0, count: 0 };
    }
    summary[t.category].total += Math.abs(t.amount);
    summary[t.category].count += 1;
  }

  return summary;
}

export function getTotalBalance(userId = null) {
  const accounts = getAccounts(userId);

  const checking = accounts.filter(a => a.type === 'checking' || a.type === 'depository')
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  const credit = accounts.filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  return {
    checking,
    creditOwed: Math.abs(credit),
    netWorth: checking + credit
  };
}

export function getIncomeSummary(userId = null, startDate = null, endDate = null) {
  let transactions = getTransactions(userId).filter(t => t.category === 'income' || t.amount > 0);

  if (startDate) transactions = transactions.filter(t => t.date >= startDate);
  if (endDate) transactions = transactions.filter(t => t.date <= endDate);

  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { total, count: transactions.length, transactions };
}

export function getCategorySpending(userId = null, category) {
  const transactions = getTransactions(userId).filter(t =>
    t.category === category.toLowerCase() && t.amount < 0
  );

  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { total, count: transactions.length, transactions };
}
