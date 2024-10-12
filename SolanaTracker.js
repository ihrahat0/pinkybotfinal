import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair } from "@solana/web3.js";
import axios from 'axios';
import { wait } from './utils.js';

export class SolanaTracker {
  constructor(keypair, rpcUrl, apiKey) {
    this.keypair = keypair;
    this.connection = new Connection(rpcUrl);
    this.apiKey = apiKey;
    this.baseUrl = "https://swap-v2.solanatracker.io";
  }

  async getSwapInstructions(from, to, fromAmount, slippage, payer, priorityFee) {
    const params = new URLSearchParams({
      from,
      to,
      fromAmount: fromAmount.toString(),
      slippage: slippage.toString(),
      payer,
    });
    if (priorityFee) {
      params.append("priorityFee", priorityFee.toString());
    }
    const url = `${this.baseUrl}/swap?${params}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error getting swap instructions:", error);
      throw error;
    }
  }

  async performSwap(swapResponse, options = {}) {
    const {
      sendOptions = { skipPreflight: true },
      confirmationRetries = 30,
      confirmationRetryTimeout = 1000,
      lastValidBlockHeightBuffer = 150,
      commitment = "processed",
    } = options;

    let serializedTransactionBuffer = Buffer.from(swapResponse.txn, "base64");
    let txn;

    const blockhash = await this.connection.getLatestBlockhash();

    if (swapResponse.txVersion === 'v0') {
      txn = VersionedTransaction.deserialize(serializedTransactionBuffer);
      txn.sign([this.keypair]);
    } else {
      txn = Transaction.from(serializedTransactionBuffer);
      txn.sign(this.keypair);
    }

    try {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          txn,
          [this.keypair],
          sendOptions
        );

      for (let i = 0; i < confirmationRetries; i++) {
        const status = await this.connection.getSignatureStatus(signature);
        if (status.value && status.value.confirmationStatus === commitment) {
          return signature;
        }
        await wait(confirmationRetryTimeout);
      }

      throw new Error("Transaction confirmation timeout");
    } catch (error) {
        console.error("Error performing swap:", error);
        if (error.logs) {
          console.error("Transaction logs:", error.logs);
        }
        throw error;
      }
    }
}