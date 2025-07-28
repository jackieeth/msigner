// Constants
export const BUYING_PSBT_SELLER_SIGNATURE_INDEX = 2; // based on 2-dummy algo
export const BUYING_PSBT_BUYER_RECEIVE_INDEX = 1; // based on 2-dummy algo
export const BUYING_PSBT_PLATFORM_FEE_INDEX = 3; // based on 2-dummy algo
export const DELIST_MAGIC_PRICE = 20 * 1_000_000 * 100_000_000; // 20M BTC in sats

// Env
export const BTC_NETWORK = 'mainnet';
export const ORDINALS_API_URL =
  BTC_NETWORK === 'mainnet'
    ? 'https://ordinals.com'
    : 'https://explorer-signet.openordex.org';
// export const PLATFORM_FEE_ADDRESS = process.env.PLATFORM_FEE_ADDRESS || ''; // removed from constants
export const DUMMY_UTXO_VALUE = 600;
export const DUMMY_UTXO_MAX_VALUE = 1000;
export const DUMMY_UTXO_MIN_VALUE = 600;
// export const ORDINALS_POSTAGE_VALUE = 546;
export const BITCOIN_RPC_HOST = 'http://localhost';
export const BITCOIN_RPC_PORT = 38332;
export const BITCOIN_RPC_USER = '__cookie__';
export const BITCOIN_RPC_PASS = '';
export const BITCOIN_RPC_TIMEOUT = 120000;