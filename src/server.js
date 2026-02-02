/**
 * Express server for Plaid Link flow
 * Provides web UI for bank connection since Plaid requires browser-based OAuth
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import { createLinkToken, exchangePublicToken, getAccounts, getTransactions } from './plaid.js';
import { saveUserConnection, getUserConnection, cacheTransactions } from './storage.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Telegram bot for sending notifications (no polling, just sending)
const telegramBot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN)
  : null;

async function sendTelegramNotification(userId, message) {
  if (!telegramBot) {
    console.log('⚠️ No Telegram token, skipping notification');
    return;
  }
  try {
    await telegramBot.sendMessage(userId, message);
    console.log(`📤 Sent Telegram notification to ${userId}`);
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
  }
}

/**
 * Main page - serves Plaid Link UI
 */
app.get('/link/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const linkToken = await createLinkToken(userId);

    // Serve a simple HTML page with Plaid Link
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Connect Your Bank</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 { color: #1a1a2e; margin-bottom: 10px; font-size: 24px; }
    p { color: #666; margin-bottom: 30px; }
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 16px;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .success {
      background: #10b981;
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
    .error {
      background: #ef4444;
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>💰 Personal Finance Bot</h1>
    <p>Connect your bank account to get started</p>
    <button id="connect-btn" onclick="openPlaidLink()">Connect Bank Account</button>
    <div id="status"></div>
  </div>

  <script>
    const linkToken = '${linkToken}';
    const userId = '${userId}';

    function openPlaidLink() {
      const handler = Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          document.getElementById('connect-btn').disabled = true;
          document.getElementById('connect-btn').textContent = 'Connecting...';
          
          try {
            const response = await fetch('/api/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicToken, userId })
            });
            
            const data = await response.json();
            
            if (data.success) {
              document.getElementById('status').innerHTML = 
                '<div class="success">✅ Bank connected! You can close this page and return to Telegram.</div>';
            } else {
              throw new Error(data.error);
            }
          } catch (error) {
            document.getElementById('status').innerHTML = 
              '<div class="error">❌ Error: ' + error.message + '</div>';
            document.getElementById('connect-btn').disabled = false;
            document.getElementById('connect-btn').textContent = 'Try Again';
          }
        },
        onExit: (err, metadata) => {
          if (err) {
            console.error('Plaid Link error:', err);
          }
        },
      });

      handler.open();
    }
  </script>
</body>
</html>
    `);
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).send('Error initializing bank connection. Please try again.');
  }
});

/**
 * API: Exchange public token for access token
 */
app.post('/api/exchange', async (req, res) => {
  const { publicToken, userId } = req.body;

  try {
    // Exchange for access token
    const { accessToken, itemId } = await exchangePublicToken(publicToken);

    // Get accounts to show user what was connected
    const accounts = await getAccounts(accessToken);

    // Save the connection
    saveUserConnection(userId, {
      accessToken,
      itemId,
      accounts,
      connectedAt: new Date().toISOString(),
    });

    // Fetch and cache transactions
    const transactions = await getTransactions(accessToken);
    cacheTransactions(userId, transactions);

    console.log(`✅ User ${userId} connected ${accounts.length} account(s)`);

    // Send Telegram notification
    const accountNames = accounts.map(a => a.name).join(', ');
    await sendTelegramNotification(userId,
      `🎉 Bank connected successfully!\n\n` +
      `📊 ${accounts.length} account(s): ${accountNames}\n` +
      `💳 ${transactions.length} transactions synced\n\n` +
      `Try asking: "What's my balance?"`
    );

    res.json({ success: true, accountCount: accounts.length });
  } catch (error) {
    console.error('Exchange error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * API: Get user's transactions (for debugging)
 */
app.get('/api/transactions/:userId', async (req, res) => {
  const { userId } = req.params;
  const connection = getUserConnection(userId);

  if (!connection) {
    return res.status(404).json({ error: 'No bank connected' });
  }

  try {
    const transactions = await getTransactions(connection.accessToken);
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server - bind to 0.0.0.0 for Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Plaid Link server running on port ${PORT}`);
  console.log(`   Connect URL pattern: ${process.env.SERVER_URL}/link/{userId}`);
});
