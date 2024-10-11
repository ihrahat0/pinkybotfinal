import { solanaWeb3 } from '@solana/web3.js';

async function createAccount() {
    const keypair = solanaWeb3.Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    return { publicKey, keypair };
}

async function getBalance(publicKey) {
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'), 'confirmed');
    let balance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
    return balance / solanaWeb3.LAMPORTS_PER_SOL;  // Convert lamports to SOL
}

module.exports = { createAccount, getBalance };
