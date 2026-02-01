/**
 * Plaid API client and helper functions
 */

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

// Initialize Plaid client
const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

const plaidClient = new PlaidApi(configuration);

/**
 * Create a link token for initializing Plaid Link
 */
export async function createLinkToken(userId) {
    const request = {
        user: {
            client_user_id: userId,
        },
        client_name: 'Personal Finance Bot',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
    };

    const response = await plaidClient.linkTokenCreate(request);
    return response.data.link_token;
}

/**
 * Exchange public token for access token
 */
export async function exchangePublicToken(publicToken) {
    const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
    });

    return {
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
    };
}

/**
 * Get accounts for an item
 */
export async function getAccounts(accessToken) {
    const response = await plaidClient.accountsGet({
        access_token: accessToken,
    });

    return response.data.accounts.map(account => ({
        id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        balance: account.balances.current,
        availableBalance: account.balances.available,
        institution: account.official_name || account.name,
    }));
}

/**
 * Get transactions for an item
 */
export async function getTransactions(accessToken, startDate = null, endDate = null) {
    // Default to last 30 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: start,
        end_date: end,
        options: {
            count: 100,
            offset: 0,
        },
    });

    return response.data.transactions.map(txn => ({
        id: txn.transaction_id,
        date: txn.date,
        amount: -txn.amount, // Plaid uses positive for debits, we flip it
        merchant: txn.merchant_name || txn.name,
        category: mapCategory(txn.personal_finance_category?.primary || txn.category?.[0]),
        account: txn.account_id,
        pending: txn.pending,
    }));
}

/**
 * Map Plaid categories to our simplified categories
 */
function mapCategory(plaidCategory) {
    if (!plaidCategory) return 'other';

    const categoryMap = {
        'FOOD_AND_DRINK': 'food',
        'GROCERIES': 'groceries',
        'TRANSPORTATION': 'transport',
        'TRAVEL': 'travel',
        'ENTERTAINMENT': 'entertainment',
        'SHOPPING': 'shopping',
        'HEALTH': 'health',
        'UTILITIES': 'utilities',
        'HOUSING': 'housing',
        'INCOME': 'income',
        'TRANSFER': 'transfer',
    };

    // Handle legacy category format
    const upperCategory = plaidCategory.toUpperCase().replace(/ /g, '_');
    return categoryMap[upperCategory] || 'other';
}

export { plaidClient };
