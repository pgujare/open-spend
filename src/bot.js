/**
 * Main Telegram bot entry point
 */

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { processMessage } from './agent.js';
import { hasPlaidConnection, getUserConnection, cacheTransactions, saveUserConnection } from './storage.js';
import { getTransactions, getAccounts } from './plaid.js';

// Validate environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file');
    console.error('   Get your token from @BotFather on Telegram');
    process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set in .env file');
    console.error('   Get your key from https://console.anthropic.com/settings/keys');
    process.exit(1);
}

// Create bot instance with polling
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

console.log('🤖 Personal Finance Bot is starting...');

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const hasPlaid = hasPlaidConnection(msg.from.id.toString());

    let welcomeMessage = `👋 Welcome to your Personal Finance Bot!

I can help you understand your finances. Try asking me:

💰 "What's my balance?"
📊 "Show spending summary"
🔍 "Find my Amazon purchases"
💵 "How much income this month?"`;

    if (!hasPlaid) {
        welcomeMessage += `\n\n🔗 **Connect your bank:** /connect`;
    } else {
        welcomeMessage += `\n\n✅ Bank connected! Use /sync to refresh data.`;
    }

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Handle /connect command - sends link to Plaid connection page
bot.onText(/\/connect/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (hasPlaidConnection(userId)) {
        bot.sendMessage(chatId, '✅ You already have a bank connected!\n\nUse /sync to refresh your transactions, or /disconnect to remove the connection.');
        return;
    }

    const linkUrl = `${SERVER_URL}/link/${userId}`;

    // Send URL as text (Telegram requires HTTPS for inline buttons, localhost won't work)
    bot.sendMessage(chatId,
        `🏦 Connect Your Bank Account\n\nOpen this link in your browser to connect:\n\n${linkUrl}\n\nThis uses Plaid for secure bank login. We never see your credentials.`
    );
});

// Handle /sync command - refresh transactions from Plaid
bot.onText(/\/sync/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    const connection = getUserConnection(userId);

    if (!connection) {
        bot.sendMessage(chatId, '❌ No bank connected. Use /connect to link your bank account.');
        return;
    }

    bot.sendChatAction(chatId, 'typing');

    try {
        const transactions = await getTransactions(connection.accessToken);
        const accounts = await getAccounts(connection.accessToken);

        cacheTransactions(userId, transactions);
        saveUserConnection(userId, { ...connection, accounts });

        bot.sendMessage(chatId, `✅ Synced ${transactions.length} transactions from ${accounts.length} account(s).\n\nAsk me anything about your finances!`);
    } catch (error) {
        console.error('Sync error:', error);
        bot.sendMessage(chatId, `❌ Sync failed: ${error.message}`);
    }
});

// Handle /disconnect command
bot.onText(/\/disconnect/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (!hasPlaidConnection(userId)) {
        bot.sendMessage(chatId, 'No bank account connected.');
        return;
    }

    // For MVP, we just tell them - in production would actually disconnect
    bot.sendMessage(chatId, '⚠️ To disconnect your bank, please restart the bot. (Full disconnect coming soon)');
});

// Handle /clear command - clear conversation history
bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    const { clearChatHistory } = require('./storage.js');
    clearChatHistory(userId);

    bot.sendMessage(chatId, '🧹 Conversation history cleared! Starting fresh.');
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `📖 **Help & Commands**

**Commands:**
• /start - Welcome message
• /connect - Link your bank account
• /sync - Refresh transaction data
• /clear - Clear conversation history
• /help - This help message

**Ask me things like:**
• "What's my balance?"
• "Show spending summary"
• "How much on groceries?"
• "Find Uber transactions"
• "Recent transactions"

**Categories:**
groceries, food, shopping, transport, utilities, entertainment, health, housing, travel`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handle all other messages
bot.on('message', async (msg) => {
    // Skip commands (they're handled separately)
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const userMessage = msg.text;

    if (!userMessage) {
        return;
    }

    console.log(`📨 Message from ${msg.from.first_name} (${userId}): ${userMessage}`);

    // Send typing indicator
    bot.sendChatAction(chatId, 'typing');

    try {
        // Process message through Claude AI agent
        const response = await processMessage(userId, userMessage);

        // Send response (try Markdown, fall back to plain text)
        try {
            await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        } catch (e) {
            await bot.sendMessage(chatId, response);
        }

        console.log(`📤 Response sent to ${msg.from.first_name}`);
    } catch (error) {
        console.error('Error processing message:', error);
        await bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
});

// Handle polling errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
});

console.log('✅ Bot is running! Send a message to your bot on Telegram.');
console.log(`📡 Make sure to also run the Plaid server: npm run server`);
