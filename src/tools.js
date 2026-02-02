/**
 * Custom MCP tools for querying bank transaction data
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as storage from './storage.js';
import { getTransactions as getPlaidTransactions, getAccounts as getPlaidAccounts } from './plaid.js';

/**
 * Create the finance MCP server with query tools
 * @param {string} userId - Telegram user ID for user-specific data
 */
export function createFinanceServer(userId) {
    return createSdkMcpServer({
        name: 'finance-tools',
        version: '1.0.0',
        tools: [
            tool(
                'get_balance',
                'Get the current account balances including checking accounts, credit card balances, and net worth.',
                {},
                async () => {
                    const balance = storage.getTotalBalance(userId);
                    const accounts = storage.getAccounts(userId);

                    const accountList = accounts.map(a =>
                        `• ${a.name} (${a.institution || a.type}): $${(a.balance || 0).toFixed(2)}`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Account Balances:\n${accountList}\n\n` +
                                `Summary:\n` +
                                `• Checking: $${balance.checking.toFixed(2)}\n` +
                                `• Credit Owed: $${balance.creditOwed.toFixed(2)}\n` +
                                `• Net Worth: $${balance.netWorth.toFixed(2)}`
                        }]
                    };
                }
            ),

            tool(
                'get_spending_summary',
                'Get a breakdown of spending by category. Can be filtered by date range.',
                {
                    start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
                    end_date: z.string().optional().describe('End date in YYYY-MM-DD format')
                },
                async (args) => {
                    const summary = storage.getSpendingSummary(userId, args.start_date, args.end_date);

                    if (Object.keys(summary).length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No spending found for the specified period.'
                            }]
                        };
                    }

                    const entries = Object.entries(summary)
                        .sort((a, b) => b[1].total - a[1].total);

                    const totalSpent = entries.reduce((sum, [_, data]) => sum + data.total, 0);

                    const formatted = entries.map(([cat, data]) =>
                        `• ${cat}: $${data.total.toFixed(2)} (${data.count} transactions)`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Spending Summary:\n${formatted}\n\nTotal Spent: $${totalSpent.toFixed(2)}`
                        }]
                    };
                }
            ),

            tool(
                'get_income_summary',
                'Get a summary of income received.',
                {
                    start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
                    end_date: z.string().optional().describe('End date in YYYY-MM-DD format')
                },
                async (args) => {
                    const income = storage.getIncomeSummary(userId, args.start_date, args.end_date);

                    if (income.count === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No income found for the specified period.'
                            }]
                        };
                    }

                    const formatted = income.transactions.map(t =>
                        `• ${t.date}: $${Math.abs(t.amount).toFixed(2)} - ${t.merchant}`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Income Summary:\n${formatted}\n\nTotal Income: $${income.total.toFixed(2)}`
                        }]
                    };
                }
            ),

            tool(
                'search_transactions',
                'Search transactions by various filters like category, merchant, date range, or amount.',
                {
                    category: z.enum(storage.CATEGORIES).optional().describe('Filter by category'),
                    merchant: z.string().optional().describe('Search by merchant name (partial match)'),
                    start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
                    end_date: z.string().optional().describe('End date in YYYY-MM-DD format'),
                    min_amount: z.number().optional().describe('Minimum transaction amount'),
                    max_amount: z.number().optional().describe('Maximum transaction amount'),
                    limit: z.number().optional().default(10).describe('Max number of results (default 10)')
                },
                async (args) => {
                    const transactions = storage.getTransactions(userId, {
                        category: args.category,
                        merchant: args.merchant,
                        startDate: args.start_date,
                        endDate: args.end_date,
                        minAmount: args.min_amount,
                        maxAmount: args.max_amount,
                        limit: args.limit || 10
                    });

                    if (transactions.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No transactions found matching your criteria.'
                            }]
                        };
                    }

                    const formatted = transactions.map(t => {
                        const sign = t.amount >= 0 ? '+' : '';
                        return `• ${t.date} | ${sign}$${t.amount.toFixed(2)} | ${t.merchant} (${t.category})`;
                    }).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Found ${transactions.length} transactions:\n${formatted}`
                        }]
                    };
                }
            ),

            tool(
                'get_category_spending',
                'Get detailed spending for a specific category.',
                {
                    category: z.enum(storage.CATEGORIES).describe('The category to analyze')
                },
                async (args) => {
                    const data = storage.getCategorySpending(userId, args.category);

                    if (data.count === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: `No spending found in ${args.category} category.`
                            }]
                        };
                    }

                    const formatted = data.transactions.map(t =>
                        `• ${t.date}: $${Math.abs(t.amount).toFixed(2)} - ${t.merchant}`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `${args.category.toUpperCase()} Spending (${data.count} transactions):\n${formatted}\n\nTotal: $${data.total.toFixed(2)}`
                        }]
                    };
                }
            ),

            tool(
                'get_recent_transactions',
                'Get the most recent transactions across all accounts.',
                {
                    limit: z.number().optional().default(10).describe('Number of transactions to show (default 10)')
                },
                async (args) => {
                    const transactions = storage.getTransactions(userId, { limit: args.limit || 10 });

                    const formatted = transactions.map(t => {
                        const sign = t.amount >= 0 ? '+' : '';
                        return `• ${t.date} | ${sign}$${t.amount.toFixed(2)} | ${t.merchant}`;
                    }).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Recent Transactions:\n${formatted}`
                        }]
                    };
                }
            ),

            tool(
                'get_accounts',
                'Get a list of all connected bank accounts and their current balances.',
                {},
                async () => {
                    const accounts = storage.getAccounts(userId);

                    const formatted = accounts.map(a =>
                        `• ${a.name}\n  Type: ${a.type}\n  Balance: $${(a.balance || 0).toFixed(2)}`
                    ).join('\n\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Connected Accounts:\n\n${formatted}`
                        }]
                    };
                }
            ),

            tool(
                'sync_transactions',
                'Sync the latest transactions from connected bank accounts. Use when user asks to refresh or update their data.',
                {},
                async () => {
                    const connection = storage.getUserConnection(userId);

                    if (!connection) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No bank account connected. Use /connect to link your bank.'
                            }]
                        };
                    }

                    try {
                        const transactions = await getPlaidTransactions(connection.accessToken);
                        const accounts = await getPlaidAccounts(connection.accessToken);

                        storage.cacheTransactions(userId, transactions);
                        storage.saveUserConnection(userId, { ...connection, accounts });

                        return {
                            content: [{
                                type: 'text',
                                text: `✅ Synced ${transactions.length} transactions from ${accounts.length} account(s).`
                            }]
                        };
                    } catch (error) {
                        return {
                            content: [{
                                type: 'text',
                                text: `❌ Sync failed: ${error.message}`
                            }]
                        };
                    }
                }
            ),

            tool(
                'create_payment_link',
                'Generate a Venmo link to request or send money. Use when user says "Split bill with X" or "Ask X for money".',
                {
                    amount: z.number().describe('The amount to pay or request (e.g. 20.50)'),
                    description: z.string().describe('Note for the transaction (e.g. "Dinner", "Rent")'),
                    type: z.enum(['charge', 'pay']).default('charge').describe('Type of transaction: "charge" to request money, "pay" to send money')
                },
                async ({ amount, description, type }) => {
                    const venmoUser = process.env.VENMO_USERNAME || 'parth_gujare'; // Fallback if not set

                    // Construct Venmo deep link
                    // txn=charge (Request) | txn=pay (Send)
                    const link = `https://venmo.com/?txn=${type}&recipients=${venmoUser}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(description)}`;

                    const action = type === 'charge' ? 'Requesting' : 'Sending';

                    return {
                        content: [{
                            type: 'text',
                            text: `Here is the Venmo link to ${type} $${amount.toFixed(2)} for "${description}":\n\n${link}\n\nYou can forward this link to the person.`
                        }]
                    };
                }
            )
        ]
    });
}

// List of all tool names for allowing in the agent
export const FINANCE_TOOL_NAMES = [
    'mcp__finance-tools__get_balance',
    'mcp__finance-tools__get_spending_summary',
    'mcp__finance-tools__get_income_summary',
    'mcp__finance-tools__search_transactions',
    'mcp__finance-tools__get_category_spending',
    'mcp__finance-tools__get_recent_transactions',
    'mcp__finance-tools__get_accounts',
    'mcp__finance-tools__sync_transactions'
];
