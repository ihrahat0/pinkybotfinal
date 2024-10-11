import { Telegraf } from 'telegraf';
import { getSwapQuote, executeSwap, getBalance } from './trade-utils.js'; 
import { owner, connection } from './config.js'; 

const bot = new Telegraf('7620843965:AAHa0SJ0yAuknSNKnN1AKKyE-buVwD89gas');

bot.start((ctx) => {
    ctx.reply('Welcome to the Solana Trading Bot! Please select an action:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Buy', callback_data: 'buy' }],
                [{ text: 'Sell', callback_data: 'sell' }],
                [{ text: 'Check Balance', callback_data: 'check_balance' }],
            ],
        },
    });
});

bot.on('callback_query', async (ctx) => {
    const action = ctx.callbackQuery.data;

    if (action === 'buy') {
        ctx.reply('Please enter the token contract address followed by the amount in the format:\n\n`<contract_address> <amount>`', {
            parse_mode: 'Markdown',
        });
        
        bot.on('text', async (msgCtx) => {
            const text = msgCtx.message.text;
            const [contractAddress, amount] = text.split(' ');

            if (!contractAddress || !amount) {
                return msgCtx.reply('Invalid format. Please use `<contract_address> <amount>`.');
            }

            const inputMint = '<YOUR_INPUT_MINT>'; // Replace with the actual input mint
            const slippage = 0.5; // Example slippage
            const txVersion = 'v1'; // Use your desired tx version

            try {
                const swapQuote = await getSwapQuote(inputMint, contractAddress, amount, slippage, txVersion);
                await executeSwap(swapQuote, owner.publicKey, null, true, false, txVersion);
                msgCtx.reply(`Successfully purchased ${amount} of tokens at ${contractAddress}!`);
            } catch (error) {
                msgCtx.reply(`Error during purchase: ${error.message}`);
            }
        });
    }

    if (action === 'sell') {
        ctx.reply('Please enter the token contract address followed by the amount in the format:\n\n`<contract_address> <amount>`', {
            parse_mode: 'Markdown',
        });
        
        bot.on('text', async (msgCtx) => {
            const text = msgCtx.message.text;
            const [contractAddress, amount] = text.split(' ');

            if (!contractAddress || !amount) {
                return msgCtx.reply('Invalid format. Please use `<contract_address> <amount>`.');
            }

            const outputMint = '<YOUR_OUTPUT_MINT>'; // Replace with actual output mint

            try {
                const swapQuote = await getSwapQuote(contractAddress, outputMint, amount, 0.5, 'v1');
                await executeSwap(swapQuote, owner.publicKey, null, false, true, 'v1');
                msgCtx.reply(`Successfully sold ${amount} of tokens at ${contractAddress}!`);
            } catch (error) {
                msgCtx.reply(`Error during sale: ${error.message}`);
            }
        });
    }

    if (action === 'check_balance') {
        try {
            const balance = await getBalance(owner.publicKey.toBase58());
            ctx.reply(`Your current balance is: ${balance} SOL`);
        } catch (error) {
            ctx.reply(`Error fetching balance: ${error.message}`);
        }
    }
});

bot.launch();
