import { Telegraf, session, Markup } from 'telegraf';
import { swap, getBalance, generateNewWallet, getTokenAccount, createAssociatedTokenAccount } from './trade-utils.js';
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";
import { Metaplex } from "@metaplex-foundation/js";
import { ENV, TokenListProvider } from "@solana/spl-token-registry";
import bs58 from 'bs58';
import axios from 'axios';
import { SolanaTracker } from './SolanaTracker.js';
import { formatPrice, makeClickableCode } from './utils.js';

function withTimeout(promise, ms) {
  let timeout = new Promise((_, reject) => {
    let id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`Timed out in ${ms} ms.`));
    }, ms);
  });

  return Promise.race([
    promise,
    timeout
  ]);
}

const bot = new Telegraf('7913726258:AAFHcPjLXngu1n6GDR04b74Py73OwcGxW20');
const connection = new Connection("https://muddy-sparkling-seed.solana-mainnet.quiknode.pro/04141016287f05de971dbf54aadd6e4a0931a8bf", "confirmed");
const metaplex = Metaplex.make(connection);
const tokenMetadataCache = new Map();


const PINKY_TOKEN_ADDRESS = '9c4eyXdumWCJokq3vHfLWv76grp4emS6zrmfXKvs3N6v';
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112';

bot.use(session());

bot.use((ctx, next) => {
  if (!ctx.session) {
    ctx.session = {};
  }
  if (!ctx.session.wallets) {
    ctx.session.wallets = [];
  }
  if (ctx.session.activeWalletIndex === undefined) {
    ctx.session.activeWalletIndex = 0;
  }
  if (!ctx.session.slippage) {
    ctx.session.slippage = 1; // Default slippage is 1%
  }
  return next();
});

  
const AD_MESSAGE = `


# AD
✅ PINKY listed on Raydium & Bitmart. 
🔥 Current Mcap $100k.
🚀 <a href="https://www.dextools.io/app/en/solana/pair-explorer/CJiY9Xt2K9akW2nsiiuem8n4YhBY4HbVwRdoPxRrtT7R?t=1728055204011">Dextools</a> | <a href="https://raydium.io/swap/?outputCurrency=CQSzJzwW5H1oyWrp6QhfUKYYwyovbSiVDKnAxNfb1tJC&inputMint=sol&outputMint=9c4eyXdumWCJokq3vHfLWv76grp4emS6zrmfXKvs3N6v">Raydium</a> | <a href="https://bitmart.com">Bitmart</a>
`;

function showMainMenu(ctx) {
  const buttons = [
    ['👛 Wallet', '💵 Buy', '💸 Sell'],
    ['💳 Transfer SOL', '⚙️ Settings', 'Referral'],
    ['🔄 Switch Wallet', '➕/🗑️ Import/Remove Wallet']
  ];

  if (ctx.session.wallets.length < 2) {
    buttons.unshift(['🔑 Generate New Wallet']);
  }

  return ctx.replyWithHTML('Choose an action:', {
    ...Markup.keyboard(buttons).resize(),
    disable_web_page_preview: true
  });
}

  bot.command('start', (ctx) => {
    ctx.session.state = 'main';
    showMainMenu(ctx);
  });
  
  bot.hears('🔙 Main Menu', (ctx) => {
    ctx.session.state = 'main';
    showMainMenu(ctx);
  });
  
  async function getTokenInfo(contractAddress) {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
      const tokenData = response.data.pairs && response.data.pairs[0];
  
      if (!tokenData) {
        throw new Error('Token not found or invalid data received');
      }
  
      const priceChange = tokenData.priceChange || {};
      const liquidity = tokenData.liquidity || {};
  
      return {
        name: tokenData.baseToken.name || 'Unknown',
        symbol: tokenData.baseToken.symbol || 'UNKNOWN',
        contractAddress: contractAddress,
        lpAddress: tokenData.pairAddress || 'Unknown',
        exchange: tokenData.dexId || 'Unknown',
        price: tokenData.priceUsd || 'Unknown',
        marketCap: tokenData.fdv || 'Unknown',
        liquidity: liquidity.usd || 'Unknown',
        priceChange6h: priceChange.h6 || 'Unknown',
        priceChange24h: priceChange.h24 || 'Unknown'
      };
    } catch (error) {
      console.error('Error fetching token info:', error);
      throw error;
    }
  }
  async function checkBalance(publicKey, amount, isSol = true) {
    try {
      const balance = await getBalance(publicKey);
      if (isSol) {
        if (balance < amount + 0.001) { // 0.001 SOL for transaction fee
          return { sufficient: false, balance };
        }
      } else {
        const tokenBalance = await connection.getTokenAccountBalance(new PublicKey(publicKey));
        if (tokenBalance.value.uiAmount < amount) {
          return { sufficient: false, balance: tokenBalance.value.uiAmount };
        }
      }
      return { sufficient: true, balance };
    } catch (error) {
      console.error('Error checking balance:', error);
      throw new Error('Failed to check balance');
    }
  }
  

  async function sendTokenInfo(ctx, contractAddress) {
    try {
      const tokenInfo = await getTokenInfo(contractAddress);
  
      const formatPrice = (price) => {
        if (price === 'Unknown') return 'Unknown';
        const priceNum = parseFloat(price);
        if (priceNum === 0) return '0';
        const decimalPlaces = Math.max(2, -Math.floor(Math.log10(priceNum)) + 2);
        return priceNum.toFixed(decimalPlaces);
      };
  
      const message = `
  ${tokenInfo.name} ($${tokenInfo.symbol})
  
  🪅 CA: ${makeClickableCode(tokenInfo.contractAddress)} 🅲
  ⛽️ LP: ${makeClickableCode(tokenInfo.lpAddress)} 🅲
  🎯 Exchange: ${tokenInfo.exchange}
  💰 Token Price: $${formatPrice(tokenInfo.price)}
  💡 Market Cap: $${tokenInfo.marketCap === 'Unknown' ? 'Unknown' : parseInt(tokenInfo.marketCap).toLocaleString()}
  💧 Liquidity: $${tokenInfo.liquidity === 'Unknown' ? 'Unknown' : parseInt(tokenInfo.liquidity).toLocaleString()}
  
  📊 <b><u>Change In </u></b> - 📈 <b>6h: </b> <u>${tokenInfo.priceChange6h}%</u> 
  
  ${AD_MESSAGE}`;
  
      await ctx.replyWithHTML(message, {
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
          [
            Markup.button.url('Solscan', `https://solscan.io/token/${tokenInfo.contractAddress}`),
            Markup.button.url('Raydium LP', `https://raydium.io/liquidity/?ammId=${tokenInfo.lpAddress}`),
            Markup.button.url('Dexscreener', `https://dexscreener.com/solana/${tokenInfo.contractAddress}`)
          ]
        ])
      });
    } catch (error) {
      await ctx.replyWithHTML(`Error fetching token info: ${error.message}${AD_MESSAGE}`, { disable_web_page_preview: true });
    }
  }
  async function checkTokenBalance(walletAddress, tokenMintAddress, amount) {
    if (tokenMintAddress === WSOL_ADDRESS) {
      // For WSOL, check the SOL balance instead
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      return balance / LAMPORTS_PER_SOL >= amount;
    } else {
      // For other tokens, use the existing logic
      const balance = await getTokenBalance(walletAddress, tokenMintAddress);
      return balance >= amount;
    }
  }
  
async function getTokenMetadata(mintAddress) {
  if (tokenMetadataCache.has(mintAddress)) {
    return tokenMetadataCache.get(mintAddress);
  }

  const mint = new PublicKey(mintAddress);
  
  // Try Metaplex first
  try {
    const metadataAccount = metaplex.nfts().pdas().metadata({ mint });
    const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);
    
    if (metadataAccountInfo) {
      const token = await metaplex.nfts().findByMint({ mintAddress: mint });
      const metadata = {
        name: token.name,
        symbol: token.symbol,
        logo: token.json?.image || null,
        source: 'Metaplex'
      };
      tokenMetadataCache.set(mintAddress, metadata);
      return metadata;
    }
  } catch (error) {
    console.error('Error fetching from Metaplex:', error);
  }
  
  // Fallback to Solana Token List
  try {
    const provider = await new TokenListProvider().resolve();
    const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
    const tokenMap = tokenList.reduce((map, item) => {
      map.set(item.address, item);
      return map;
    }, new Map());
    
    const token = tokenMap.get(mintAddress);
    if (token) {
      const metadata = {
        name: token.name,
        symbol: token.symbol,
        logo: token.logoURI || null,
        source: 'Solana Token List'
      };
      tokenMetadataCache.set(mintAddress, metadata);
      return metadata;
    }
  } catch (error) {
    console.error('Error fetching from Solana Token List:', error);
  }
  
  // If all methods fail, return a default object
  const defaultMetadata = {
    name: 'Unknown Token',
    symbol: 'UNKNOWN',
    logo: null,
    source: 'Default'
  };
  tokenMetadataCache.set(mintAddress, defaultMetadata);
  return defaultMetadata;
}
bot.hears('⚙️ Settings', (ctx) => {
  ctx.replyWithHTML('Settings:', Markup.inlineKeyboard([
    [Markup.button.callback('Set Slippage', 'set_slippage')]
  ]));
});

bot.action('set_slippage', (ctx) => {
  ctx.answerCbQuery();
  ctx.replyWithHTML('Choose slippage option:', Markup.inlineKeyboard([
    [Markup.button.callback('Turbo 3%', 'slippage_3')],
    [Markup.button.callback('Normal 1%', 'slippage_1')],
    [Markup.button.callback('Ultra 5%', 'slippage_5')],
    [Markup.button.callback('Custom', 'slippage_custom')]
  ]));
});

bot.hears('👛 Wallet', async (ctx) => {
    if (ctx.session.wallets.length === 0) {
      return ctx.replyWithHTML('You haven\'t generated or imported any wallets yet. Please use the "🔑 Generate New Wallet" or "➕/🗑️ Import/Remove Wallet" option first.' + AD_MESSAGE, { disable_web_page_preview: true });
    }
  
    try {
      const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
      const publicKey = new PublicKey(activeWallet.publicKey);
      const balance = await getBalance(publicKey.toBase58());
      
      let walletInfo = `👛 Wallet Information:\n\nPublic Address: ${makeClickableCode(publicKey.toBase58())}\nBalance: ${balance} SOL\n\nPortfolio:`;
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      
      for (let account of tokenAccounts.value) {
        const tokenBalance = account.account.data.parsed.info.tokenAmount;
        if (tokenBalance.uiAmount > 0) {
          const tokenMint = account.account.data.parsed.info.mint;
          const tokenMetadata = await getTokenMetadata(tokenMint);
          walletInfo += `\n${tokenMetadata.name} (${tokenMetadata.symbol}): ${tokenBalance.uiAmount}`;
        }
      }
      
      ctx.replyWithHTML(walletInfo , {
        ...Markup.inlineKeyboard([
          Markup.button.callback('👁️ Reveal Private Key', 'reveal_key')
        ]),
        disable_web_page_preview: true
      });
    } catch (error) {
      console.error('Error fetching wallet information:', error);
      ctx.replyWithHTML(`Error fetching wallet information: ${error.message}${AD_MESSAGE}`, { disable_web_page_preview: true });
    }
  });
  bot.action(/slippage_(\d+)/, (ctx) => {
    const slippage = parseInt(ctx.match[1]);
    ctx.session.slippage = slippage;
    ctx.answerCbQuery();
    ctx.replyWithHTML(`Slippage set to ${slippage}%`);
    showMainMenu(ctx);
  });
  
  bot.action('slippage_custom', (ctx) => {
    ctx.answerCbQuery();
    ctx.replyWithHTML('Please enter your custom slippage percentage (e.g., 2.5 for 2.5%):');
    ctx.session.state = 'enter_custom_slippage';
  });

  bot.action('reveal_key', (ctx) => {
    if (ctx.session.wallets.length === 0) {
      return ctx.answerCbQuery('No wallet found. Please generate or import a wallet first.');
    }
  
    const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
    ctx.answerCbQuery();
    ctx.replyWithHTML(`⚠️ CAUTION: Never share your private key with anyone!\n\nPrivate Key: ${makeClickableCode(activeWallet.privateKey)}\n\nPlease store this securely and delete this message.${AD_MESSAGE}`, { disable_web_page_preview: true });
  });

  bot.hears('💳 Transfer SOL', (ctx) => {
    if (ctx.session.wallets.length === 0) {
      return ctx.replyWithHTML('You haven\'t generated or imported any wallets yet. Please use the "🔑 Generate New Wallet" or "➕/🗑️ Import/Remove Wallet" option first.');
    }
  
    ctx.session.state = 'transfer_sol_address';
    ctx.replyWithHTML('Please enter the recipient\'s SOL address:');
  });

bot.hears('🔑 Generate New Wallet', (ctx) => {
  if (ctx.session.wallets.length >= 2) {
    return ctx.replyWithHTML('You have reached the maximum limit of 2 wallets. Please remove a wallet before adding a new one.' + AD_MESSAGE, { disable_web_page_preview: true });
  }

  const newWallet = generateNewWallet();
  ctx.session.wallets.push(newWallet);
  ctx.session.activeWalletIndex = ctx.session.wallets.length - 1;
  ctx.replyWithHTML(`New wallet generated successfully!\n\nPublic Address: ${makeClickableCode(newWallet.publicKey)}\n\nUse the "👛 Wallet" option to view your wallet information and reveal your private key.${AD_MESSAGE}`, { disable_web_page_preview: true });
  showMainMenu(ctx);
});

bot.hears('➕/🗑️ Import/Remove Wallet', (ctx) => {
  ctx.replyWithHTML('What would you like to do?', Markup.inlineKeyboard([
    Markup.button.callback('Import Wallet', 'import_wallet'),
    Markup.button.callback('Remove Wallet', 'remove_wallet')
  ]));
});

bot.action('import_wallet', (ctx) => {
  if (ctx.session.wallets.length >= 2) {
    return ctx.answerCbQuery('You have reached the maximum limit of 2 wallets. Please remove a wallet before adding a new one.');
  }

  ctx.answerCbQuery();
  ctx.session.state = 'import_wallet';
  ctx.replyWithHTML('Please enter the private key of the wallet you want to import:');
});

bot.action('remove_wallet', (ctx) => {
  if (ctx.session.wallets.length === 0) {
    return ctx.answerCbQuery('You don\'t have any wallets to remove.');
  }

  ctx.answerCbQuery();
  let message = 'Which account would you like to remove? Your accounts are:\n';
  ctx.session.wallets.forEach((wallet, index) => {
    message += `${index + 1}: ${makeClickableCode(wallet.publicKey)}\n`;
  });

  const buttons = ctx.session.wallets.map((_, index) => 
    Markup.button.callback(`${index + 1}`, `remove_wallet_${index}`)
  );
  buttons.push(Markup.button.callback('Cancel', 'cancel_remove_wallet'));

  ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
});

bot.action(/^remove_wallet_(\d+)$/, (ctx) => {
  const index = parseInt(ctx.match[1]);
  if (index >= 0 && index < ctx.session.wallets.length) {
    const removedWallet = ctx.session.wallets.splice(index, 1)[0];
    ctx.session.activeWalletIndex = 0; // Reset to the first wallet
    ctx.answerCbQuery(`Wallet ${removedWallet.publicKey} has been removed.`);
    ctx.replyWithHTML(`Wallet ${removedWallet.publicKey} has been removed.`);
  } else {
    ctx.answerCbQuery('Invalid wallet selection.');
  }
  showMainMenu(ctx);
});

bot.action('cancel_remove_wallet', (ctx) => {
  ctx.answerCbQuery('Wallet removal cancelled.');
  showMainMenu(ctx);
});

bot.hears('🔄 Switch Wallet', (ctx) => {
  if (ctx.session.wallets.length < 2) {
    return ctx.replyWithHTML('You need at least two wallets to switch between them. Please generate or import another wallet first.');
  }

  ctx.session.activeWalletIndex = 1 - ctx.session.activeWalletIndex;
  const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
  ctx.replyWithHTML(`Switched to: ${makeClickableCode(activeWallet.publicKey)}`);
  showMainMenu(ctx);
});

bot.command('buy', async (ctx) => {
  const contractAddress = ctx.message.text.split(' ')[1];
  if (!contractAddress) {
    return ctx.replyWithHTML('Please provide a token contract address. Usage: /buy <contract_address>');
  }
  await sendTokenInfo(ctx, contractAddress);
});

bot.command('sell', async (ctx) => {
  const contractAddress = ctx.message.text.split(' ')[1];
  if (!contractAddress) {
    return ctx.replyWithHTML('Please provide a token contract address. Usage: /sell <contract_address>');
  }
  await sendTokenInfo(ctx, contractAddress);
});

bot.hears('💵 Buy', (ctx) => {
  if (ctx.session.wallets.length === 0) {
    return ctx.replyWithHTML('You haven\'t generated or imported any wallets yet. Please use the "🔑 Generate New Wallet" or "➕/🗑️ Import/Remove Wallet" option first.');
  }

  ctx.replyWithHTML(
    'Please enter the Raydium listed token contract address or select Pinky:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Pinky', 'buy_pinky')],
      [Markup.button.callback('🔙 Main Menu', 'main_menu')]
    ])
  );
  ctx.session.state = 'enter_contract';
});

bot.action('buy_pinky', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.contractAddress = PINKY_TOKEN_ADDRESS;
  handleContractAddress(ctx, PINKY_TOKEN_ADDRESS);
});
bot.action('main_menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.state = 'main';
  showMainMenu(ctx);
});

async function handleContractAddress(ctx, address) {
  try {
    await sendTokenInfo(ctx, address);
    ctx.session.state = 'select_amount';
    await ctx.replyWithHTML('Select the amount you want to buy with:', Markup.inlineKeyboard([
      [Markup.button.callback('1 SOL', 'buy_1'), Markup.button.callback('0.5 SOL', 'buy_0.5'), Markup.button.callback('0.25 SOL', 'buy_0.25')],
      [Markup.button.callback('0.1 SOL', 'buy_0.1'), Markup.button.callback('X SOL', 'buy_custom'), Markup.button.callback('Max Balance', 'buy_max')]
    ]));
  } catch (error) {
    ctx.replyWithHTML(`Error fetching token info: ${error.message}`);
    ctx.session.state = 'main';
    showMainMenu(ctx);
  }
}

bot.hears('Pinky', (ctx) => {
  if (ctx.session.state === 'enter_contract') {
    ctx.session.contractAddress = PINKY_TOKEN_ADDRESS;
    handleContractAddress(ctx, PINKY_TOKEN_ADDRESS);
  }
});

bot.hears('💸 Sell', (ctx) => {
  if (ctx.session.wallets.length === 0) {
    return ctx.replyWithHTML('You haven\'t generated or imported any wallets yet. Please use the "🔑 Generate New Wallet" or "➕/🗑️ Import/Remove Wallet" option first.');
  }

  ctx.session.state = 'enter_sell_contract';
  ctx.replyWithHTML('Please enter the token contract address you want to sell:');
});

async function getTokenBalance(walletAddress, tokenMintAddress) {
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenMintPublicKey = new PublicKey(tokenMintAddress);
  
  try {
    const tokenAccount = await getAssociatedTokenAddress(tokenMintPublicKey, walletPublicKey);
    const balance = await connection.getTokenAccountBalance(tokenAccount);
    return balance.value.uiAmount;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0; // Return 0 if the token account doesn't exist
  }
}

async function executeBuy(ctx, amount) {
  try {
    const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
    const wallet = Keypair.fromSecretKey(bs58.decode(activeWallet.privateKey));
    const solanaTracker = new SolanaTracker(wallet, "https://api.mainnet-beta.solana.com", "YOUR_API_KEY");

    // Check balance before executing the swap
    const hasBalance = await checkTokenBalance(wallet.publicKey.toBase58(), WSOL_ADDRESS, amount);
    if (!hasBalance) {
      throw new Error("Insufficient balance for the swap");
    }

    const swapResponse = await solanaTracker.getSwapInstructions(
      WSOL_ADDRESS,
      ctx.session.contractAddress,
      amount,
      ctx.session.slippage * 10, // Convert percentage to basis points
      wallet.publicKey.toBase58(),
      0.0005 // Priority fee
    );

    const transaction = Transaction.from(Buffer.from(swapResponse.txn, 'base64'));
    transaction.sign(wallet);

    const txid = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 5,
    });

    await ctx.replyWithHTML(
      `Buy transaction sent!\n\nAmount: ${amount} SOL\nSlippage: ${ctx.session.slippage}%\nTransaction ID: ${makeClickableCode(txid)}\n` +
      `Transaction URL: https://solscan.io/tx/${txid}\n\n` +
      `Please note that the transaction is still being processed. Check the URL for the latest status.`,
      { disable_web_page_preview: true }
    );

    checkTransactionStatus(ctx, txid);

  } catch (error) {
    console.error('Error executing buy:', error);
    let errorMessage = 'An unexpected error occurred. Please try again later or contact support.';

    if (error.message.includes("InstructionError") && error.message.includes("Custom: 1")) {
      errorMessage = "The swap failed due to insufficient liquidity or high price impact. Please try a smaller amount or wait for better market conditions.";
    } else if (error.message.includes("Insufficient balance")) {
      errorMessage = error.message;
    }

    await ctx.replyWithHTML(`Error executing buy: ${errorMessage}`);
  } finally {
    ctx.session.state = 'main';
    await showMainMenu(ctx);
  }
}




// async function checkTransactionStatus(ctx, txid) {
//   try {
//     const status = await connection.confirmTransaction(txid, 'confirmed');
//     if (status.value.err) {
//       await ctx.replyWithHTML(`Transaction failed. Please check the transaction details: https://solscan.io/tx/${txid}`, { disable_web_page_preview: true });
//     } else {
//       await ctx.replyWithHTML(`Transaction confirmed successfully! https://solscan.io/tx/${txid}`, { disable_web_page_preview: true });
//     }
//   } catch (error) {
//     console.error('Error checking transaction status:', error);
//   }
// }

async function executeSell(ctx, percentage) {
  try {
    const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
    const wallet = Keypair.fromSecretKey(bs58.decode(activeWallet.privateKey));
    const solanaTracker = new SolanaTracker(wallet, "https://api.mainnet-beta.solana.com", "YOUR_API_KEY");

    const tokenMint = new PublicKey(ctx.session.contractAddress);
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    let tokenAccountInfo;
    try {
      tokenAccountInfo = await getAccount(connection, tokenAccount);
    } catch (error) {
      if (error.name === 'TokenAccountNotFoundError') {
        await ctx.replyWithHTML(`You don't have any balance of this token in your wallet.`);
        return;
      }
      throw error;
    }

    const tokenBalance = Number(tokenAccountInfo.amount) / Math.pow(10, tokenAccountInfo.decimals);

    let amount;
    if (percentage === 'custom') {
      amount = ctx.session.customSellAmount;
    } else {
      amount = (tokenBalance * percentage) / 100;
    }

    if (amount > tokenBalance) {
      await ctx.replyWithHTML(`Insufficient token balance. You only have ${tokenBalance.toFixed(6)} tokens, but you're trying to sell ${amount.toFixed(6)} tokens.`);
      return;
    }

    if (amount <= 0) {
      await ctx.replyWithHTML(`Invalid amount. The amount to sell must be greater than zero.`);
      return;
    }

    const swapResponse = await solanaTracker.getSwapInstructions(
      ctx.session.contractAddress,
      WSOL_ADDRESS,
      amount,
      ctx.session.slippage * 10, // Convert percentage to basis points
      wallet.publicKey.toBase58(),
      0.0005 // Priority fee
    );

    const transaction = Transaction.from(Buffer.from(swapResponse.txn, 'base64'));
    transaction.sign(wallet);

    const txid = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 5,
    });

    await ctx.replyWithHTML(
      `Sell transaction sent!\n\nAmount: ${amount.toFixed(6)} tokens\nSlippage: ${ctx.session.slippage}%\nTransaction ID: ${makeClickableCode(txid)}\n` +
      `Transaction URL: https://solscan.io/tx/${txid}\n\n` +
      `Please note that the transaction is still being processed. Check the URL for the latest status.`,
      { disable_web_page_preview: true }
    );

    checkTransactionStatus(ctx, txid);

  } catch (error) {
    console.error('Error executing sell:', error);
    let errorMessage = 'An unexpected error occurred. Please try again later or contact support.';

    if (error.message.includes("InstructionError") && error.message.includes("Custom: 1")) {
      errorMessage = "The swap failed due to insufficient liquidity or high price impact. Please try a smaller amount or wait for better market conditions.";
    } else if (error.message.includes("Insufficient token balance")) {
      errorMessage = error.message;
    }

    await ctx.replyWithHTML(`Error executing sell: ${errorMessage}`);
  } finally {
    ctx.session.state = 'main';
    await showMainMenu(ctx);
  }
}


async function checkTransactionStatus(ctx, txid) {
  try {
    const status = await connection.confirmTransaction(txid, 'confirmed');
    if (status.value.err) {
      await ctx.replyWithHTML(`Transaction failed. Please check the transaction details: https://solscan.io/tx/${txid}`, { disable_web_page_preview: true });
    } else {
      await ctx.replyWithHTML(`Transaction confirmed successfully! https://solscan.io/tx/${txid}`, { disable_web_page_preview: true });
    }
  } catch (error) {
    console.error('Error checking transaction status:', error);
  }
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (ctx.session.state === 'import_wallet') {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(text));
      const importedWallet = {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: text
      };
      ctx.session.wallets.push(importedWallet);
      ctx.session.activeWalletIndex = ctx.session.wallets.length - 1;
      await ctx.replyWithHTML(`Wallet imported successfully!\n\nPublic Address: ${importedWallet.publicKey}`);
      ctx.session.state = 'main';
      await showMainMenu(ctx);
    } catch (error) {
      console.error('Error importing wallet:', error);
      await ctx.replyWithHTML('Invalid private key. Please try again or use the "🔙 Main Menu" option to cancel.');
    }
  } else if (ctx.session.state === 'enter_contract') {
    ctx.session.contractAddress = text;
    try {
      await sendTokenInfo(ctx, text);
      ctx.session.state = 'select_amount';
      await ctx.replyWithHTML('Select the amount you want to buy with:', Markup.inlineKeyboard([
        [Markup.button.callback('1 SOL', 'buy_1'), Markup.button.callback('0.5 SOL', 'buy_0.5'), Markup.button.callback('0.25 SOL', 'buy_0.25')],
        [Markup.button.callback('0.1 SOL', 'buy_0.1'), Markup.button.callback('X SOL', 'buy_custom'), Markup.button.callback('Max Balance', 'buy_max')]
      ]));
    } catch (error) {
      ctx.replyWithHTML(`Error fetching token info: ${error.message}`);
      ctx.session.state = 'main';
      showMainMenu(ctx);
    }
  } else if (ctx.session.state === 'enter_custom_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount)) {
      return ctx.replyWithHTML('Invalid amount. Please enter a valid number.');
    }
    await executeBuy(ctx, amount);
  } else if (ctx.session.state === 'selling') {
    const [contractAddress, amount] = text.split(' ');
    if (!contractAddress) {
      return ctx.replyWithHTML('Invalid format. Please use `<contract_address> <amount>`.');
    }
    try {
      await sendTokenInfo(ctx, contractAddress);
      if (!amount) {
        ctx.session.contractAddress = contractAddress;
        ctx.session.state = 'enter_sell_amount';
        return ctx.replyWithHTML('Please enter the amount of tokens you want to sell:');
      }
      await executeSell(ctx, contractAddress, amount);
    } catch (error) {
      ctx.replyWithHTML(`Error fetching token info: ${error.message}`);
      ctx.session.state = 'main';
      showMainMenu(ctx);
    }
  } else if (ctx.session.state === 'transfer_sol_address') {
    try {
      new PublicKey(text); // This will throw an error if the address is invalid
      ctx.session.transferRecipient = text;
      ctx.session.state = 'transfer_sol_amount';
      await ctx.replyWithHTML('Please enter the amount of SOL you want to transfer:');
    } catch (error) {
      await ctx.replyWithHTML('Invalid SOL address. Please try again or use the "🔙 Main Menu" option to cancel.');
    }
  } else if (ctx.session.state === 'transfer_sol_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount)) {
      return ctx.replyWithHTML('Invalid amount. Please enter a valid number.');
    }
    await executeTransferSOL(ctx, amount);
  } else if (ctx.session.state === 'enter_sell_contract') {
    ctx.session.contractAddress = text;
    try {
      await sendTokenInfo(ctx, text);
      ctx.session.state = 'select_sell_amount';
      ctx.replyWithHTML('Select the amount of tokens you want to sell:', Markup.inlineKeyboard([
        [Markup.button.callback('25%', 'sell_25'), Markup.button.callback('50%', 'sell_50'), Markup.button.callback('100%', 'sell_100')],
        [Markup.button.callback('Custom Amount', 'sell_custom')]
      ]));
    } catch (error) {
      ctx.replyWithHTML(`Error fetching token info: ${error.message}`);
      ctx.session.state = 'main';
      showMainMenu(ctx);
    }
  } else if (ctx.session.state === 'enter_sell_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount)) {
      return ctx.replyWithHTML('Invalid amount. Please enter a valid number.');
    }
    ctx.session.customSellAmount = amount;
    await executeSell(ctx, 'custom');
  }
  else if (ctx.session.state === 'enter_custom_slippage') {
    const customSlippage = parseFloat(text);
    if (isNaN(customSlippage) || customSlippage <= 0 || customSlippage > 100) {
      return ctx.replyWithHTML('Invalid slippage. Please enter a number between 0 and 100.');
    }
    ctx.session.slippage = customSlippage;
    ctx.replyWithHTML(`Custom slippage set to ${customSlippage}%`);
    ctx.session.state = 'main';
    showMainMenu(ctx);
  }
});

bot.action(/buy_(.+)/, async (ctx) => {
  const amount = ctx.match[1];
  if (amount === 'custom') {
    ctx.session.state = 'enter_custom_amount';
    ctx.answerCbQuery();
    return ctx.replyWithHTML('Please enter the custom amount in SOL:');
  } else if (amount === 'max') {
    const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
    const balance = await connection.getBalance(new PublicKey(activeWallet.publicKey));
    const maxAmount = Math.max(0, balance / LAMPORTS_PER_SOL - 0.001).toFixed(3); // Deduct 0.001 SOL for fees
    await executeBuy(ctx, parseFloat(maxAmount));
  } else {
    await executeBuy(ctx, parseFloat(amount));
  }
});

bot.action(/sell_(\d+)/, async (ctx) => {
  const percentage = parseInt(ctx.match[1]);
  await executeSell(ctx, percentage);
});

bot.action('sell_custom', (ctx) => {
  ctx.session.state = 'enter_sell_amount';
  ctx.answerCbQuery();
  ctx.replyWithHTML('Please enter the custom amount of tokens you want to sell:');
});


async function executeTransferSOL(ctx, amount) {
  try {
    const activeWallet = ctx.session.wallets[ctx.session.activeWalletIndex];
    const fromPubkey = new PublicKey(activeWallet.publicKey);
    const toPubkey = new PublicKey(ctx.session.transferRecipient);

    const { sufficient, balance } = await checkBalance(fromPubkey, amount);
    if (!sufficient) {
      return ctx.replyWithHTML(`Insufficient balance. Your current balance is ${balance} SOL.`);
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL
      })
    );

    const blockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = fromPubkey;

    const signers = [Keypair.fromSecretKey(bs58.decode(activeWallet.privateKey))];
    const signature = await sendAndConfirmTransaction(connection, transaction, signers);

    ctx.replyWithHTML(`Transfer successful!\n\nAmount: ${amount} SOL\nTo: ${makeClickableCode(ctx.session.transferRecipient)}\nTransaction: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error('Error executing SOL transfer:', error);
    ctx.replyWithHTML(`Error executing SOL transfer: ${error.message}`);
  } finally {
    ctx.session.state = 'main';
    showMainMenu(ctx);
  }
}


bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export default function Component() {
  // This is a placeholder since we're not actually rendering a React component
  return null;
}