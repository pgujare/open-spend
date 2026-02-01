# Personal Finance Telegram Bot 💰

A conversational AI personal finance bot powered by Claude Agent SDK. Chat with your bank transaction data through Telegram.

## Features

- 💬 **Natural Language**: Ask questions in plain English
- 🏦 **Plaid Integration**: Connect real bank accounts
- 📊 **Spending Analysis**: View spending by category
- 🔍 **Transaction Search**: Find specific transactions
- 💰 **Balance Overview**: See all accounts and net worth

## Quick Setup

### 1. Get API Keys

| Service | URL |
|---------|-----|
| Telegram Bot | [@BotFather](https://t.me/botfather) → `/newbot` |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| Plaid | [dashboard.plaid.com/developers/keys](https://dashboard.plaid.com/developers/keys) |

### 2. Configure

```bash
cp .env.example .env
# Add your keys to .env
```

### 3. Install & Run

```bash
npm install

# Terminal 1: Start the Plaid web server
npm run server

# Terminal 2: Start the Telegram bot
npm start
```

## Usage

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/connect` | Link your bank account |
| `/sync` | Refresh transaction data |
| `/help` | Help and examples |

**Example queries:**
- "What's my balance?"
- "Show spending summary"
- "How much on groceries?"
- "Find Amazon purchases"

## Testing with Plaid Sandbox

Use these test credentials when connecting a bank:
- **Username**: `user_good`
- **Password**: `pass_good`

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Telegram   │────▶│   Bot.js     │────▶│ Claude Agent│
└─────────────┘     └──────────────┘     │    SDK      │
                                         └──────┬──────┘
                                                │
┌─────────────┐     ┌──────────────┐            ▼
│   Browser   │────▶│  Server.js   │     ┌─────────────┐
│ (Plaid Link)│     │  (Express)   │────▶│    Plaid    │
└─────────────┘     └──────────────┘     └─────────────┘
```
