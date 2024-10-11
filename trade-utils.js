import axios from 'axios';
import {
    clusterApiUrl,
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
  } from "@solana/web3.js";
  
import { Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { connection, owner } from './config.js';  // Ensure the file extension is .js
import { API_URLS } from '@raydium-io/raydium-sdk-v2';
const connection1 = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

async function getSwapQuote(inputMint, outputMint, amount, slippage, txVersion) {
  const url = `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`;
  const { data: swapResponse } = await axios.get(url);
  return swapResponse;
}
// Ensure to install @solana/spl-token

async function getBalance(walletAddress) {
    const walletPublicKey = new PublicKey(walletAddress);
    const balance = await connection1.getBalance(walletPublicKey);
    return balance / LAMPORTS_PER_SOL; // Return balance in SOL
  }
async function executeSwap(swapResponse, inputTokenAcc, outputTokenAcc, isInputSol, isOutputSol, txVersion) {
  const { data: swapTransactions } = await axios.post(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
    swapResponse,
    txVersion,
    wallet: owner.publicKey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol,
    inputAccount: isInputSol ? undefined : inputTokenAcc.toBase58(),
    outputAccount: isOutputSol ? undefined : outputTokenAcc.toBase58(),
  });

  const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
  const allTransactions = allTxBuf.map((txBuf) => txVersion === 'v0' ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf));

  for (const transaction of allTransactions) {
    transaction.sign(owner);
    await sendAndConfirmTransaction(connection, transaction, [owner], { skipPreflight: true });
  }
}

export { getSwapQuote, executeSwap, getBalance };

