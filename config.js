// config.js
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';

// Replace with your actual wallet secret key and RPC URL
const owner = Keypair.fromSecretKey(bs58.decode('2tK1CxXDkdr9nCqJWDLSzUbsBsnmLBZ57Dai5DPhevafhJHGQ19oNsQbETueXMXCC3SZb1PA27RKz3xbZahSWV9K'));
const connection = new Connection('https://api.mainnet-beta.solana.com');


export { owner, connection };