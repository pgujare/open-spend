/**
 * AI Agent for querying financial data using Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createFinanceServer, FINANCE_TOOL_NAMES } from './tools.js';
import { hasPlaidConnection, getChatHistory, appendChatHistory } from './storage.js';

const SYSTEM_PROMPT = `You are a helpful personal finance assistant with access to the user's bank account and credit card transaction data.

Your capabilities:
- View account balances and net worth
- Analyze spending by category
- Search for specific transactions
- Provide insights on spending patterns
- Show income summaries
- Sync latest transactions from connected banks
- Create Venmo payment links to request or split money

Guidelines:
- Be friendly and conversational
- Format currency as dollars (e.g., $50.00)
- Be concise in your responses
- When asked about spending or balances, always use the appropriate tool first
- Provide helpful insights when showing data
- If the user asks a vague question, clarify or make reasonable assumptions
- If the user asks to refresh or sync data, use the sync_transactions tool

Available categories: groceries, food, shopping, transport, utilities, entertainment, health, housing, travel, income, transfer, other`;

/**
 * Process a user message and return the agent's response
 */
export async function processMessage(userId, userMessage) {
    // Create finance server with user-specific data
    const financeServer = createFinanceServer(userId);

    // Add context about data source
    const hasPlaid = hasPlaidConnection(userId);
    const systemWithContext = SYSTEM_PROMPT + (hasPlaid
        ? '\n\nThis user has connected their bank account via Plaid. Data is real.'
        : '\n\nThis user is using demo data. Suggest using /connect to link a real bank account.');

    // Create streaming input generator (required for MCP tools)
    async function* generateMessages() {
        // 1. Replay history
        const history = getChatHistory(userId);
        for (const msg of history) {
            yield {
                type: 'user', // Note: effectively "simulating" the conversation
                message: {
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                }
            };
        }

        // 2. Add current message
        yield {
            type: 'user',
            message: {
                role: 'user',
                content: userMessage
            }
        };
    }

    try {
        let result = '';

        // Run the agent query with custom MCP tools
        for await (const message of query({
            prompt: generateMessages(),
            options: {
                systemPrompt: systemWithContext,
                mcpServers: {
                    'finance-tools': financeServer
                },
                allowedTools: FINANCE_TOOL_NAMES,
                maxTurns: 5
            }
        })) {
            // Capture the final result
            if (message.type === 'result' && message.subtype === 'success') {
                result = message.result;
            }

            // Log tool usage for debugging
            if (message.type === 'assistant' && message.message?.content) {
                for (const block of message.message.content) {
                    if (block.type === 'tool_use') {
                        console.log(`Tool called: ${block.name}`, block.input);
                    }
                }
            }
        }

        // Save new turn to history
        appendChatHistory(userId, 'user', userMessage);
        const finalResponse = result || 'I processed your request.';
        appendChatHistory(userId, 'assistant', finalResponse);

        return finalResponse;

    } catch (error) {
        console.error('Agent error:', error);

        if (error.message?.includes('API key')) {
            return '❌ Anthropic API key is invalid. Please check your ANTHROPIC_API_KEY.';
        }

        return `❌ Sorry, I encountered an error: ${error.message}`;
    }
}
