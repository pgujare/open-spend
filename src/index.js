/**
 * Combined entry point - runs both Telegram bot and Plaid web server
 * Useful for deployment where we want a single process
 */

import 'dotenv/config';

// Start both services
console.log('🚀 Starting Personal Finance Bot (combined mode)...\n');

// Import and start the bot (it auto-starts on import)
import('./bot.js').then(() => {
    console.log('✅ Telegram bot started');
});

// Import and the server also auto-starts
import('./server.js').then(() => {
    console.log('✅ Web server started');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
});
