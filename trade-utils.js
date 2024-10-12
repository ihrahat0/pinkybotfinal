import { Connection, PublicKey, VersionedTransaction, Keypair, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { API_URLS } from "@raydium-io/raydium-sdk-v2";
import axios from 'axios';
import bs58 from 'bs58';

const QUICKNODE_RPC_URL = "https://muddy-sparkling-seed.solana-mainnet.quiknode.pro/04141016287f05de971dbf54aadd6e4a0931a8bf";
const connection = new Connection(QUICKNODE_RPC_URL, "confirmed");

function generateNewWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: bs58.encode(keypair.secretKey)
  };
}

async function getBalance(walletAddress) {
  try {
    const walletPublicKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(walletPublicKey);
    return (balance / 1e9).toFixed(4); // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting balance:', error);
    throw error;
  }
}

async function getTokenAccount(connection, wallet, mint) {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, { mint });
  return tokenAccounts.value[0]?.pubkey;
}

async function createAssociatedTokenAccount(connection, payer, mint, owner) {
  const associatedToken = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedToken,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  await connection.sendTransaction(transaction, [payer]);
  return associatedToken;
}

async function swap(wallet, inputMint, outputMint, amount, slippage) {
  try {
    const isInputSol = inputMint.equals(NATIVE_MINT);
    const isOutputSol = outputMint.equals(NATIVE_MINT);
    const txVersion = 'V0'; // Use versioned transactions

    // Get quote
    const { data: swapResponse } = await axios.get(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`
    );

    // Get priority fee
    const { data: priorityFeeData } = await axios.get(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`);

    // Serialize transaction
    const { data: swapTransactions } = await axios.post(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
      computeUnitPriceMicroLamports: String(priorityFeeData.data.default.h),
      swapResponse,
      txVersion,
      wallet: wallet.publicKey.toBase58(),
      wrapSol: isInputSol,
      unwrapSol: isOutputSol,
    });

    // Deserialize and sign transactions
    const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
    const allTransactions = allTxBuf.map((txBuf) => VersionedTransaction.deserialize(txBuf));

    // Sign and send transactions
    for (const tx of allTransactions) {
      tx.sign([wallet]);
      const txId = await connection.sendTransaction(tx, { skipPreflight: true });
      const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({
        commitment: 'finalized',
      });
      await connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature: txId,
        },
        'confirmed'
      );
      console.log(`Transaction confirmed, txId: ${txId}`);
    }

    return { success: true, message: "Swap executed successfully" };
  } catch (error) {
    console.error('Error in swap function:', error);
    throw error;
  }
}

export { swap, getBalance, generateNewWallet, getTokenAccount, createAssociatedTokenAccount };