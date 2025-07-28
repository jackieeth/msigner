"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BITCOIN_RPC_TIMEOUT = exports.BITCOIN_RPC_PASS = exports.BITCOIN_RPC_USER = exports.BITCOIN_RPC_PORT = exports.BITCOIN_RPC_HOST = exports.DUMMY_UTXO_MIN_VALUE = exports.DUMMY_UTXO_MAX_VALUE = exports.DUMMY_UTXO_VALUE = exports.ORDINALS_API_URL = exports.BTC_NETWORK = exports.DELIST_MAGIC_PRICE = exports.BUYING_PSBT_PLATFORM_FEE_INDEX = exports.BUYING_PSBT_BUYER_RECEIVE_INDEX = exports.BUYING_PSBT_SELLER_SIGNATURE_INDEX = void 0;
// Constants
exports.BUYING_PSBT_SELLER_SIGNATURE_INDEX = 2; // based on 2-dummy algo
exports.BUYING_PSBT_BUYER_RECEIVE_INDEX = 1; // based on 2-dummy algo
exports.BUYING_PSBT_PLATFORM_FEE_INDEX = 3; // based on 2-dummy algo
exports.DELIST_MAGIC_PRICE = 20 * 1000000 * 100000000; // 20M BTC in sats
// Env
exports.BTC_NETWORK = 'mainnet';
exports.ORDINALS_API_URL = exports.BTC_NETWORK === 'mainnet'
    ? 'https://ordinals.com'
    : 'https://explorer-signet.openordex.org';
// export const PLATFORM_FEE_ADDRESS = process.env.PLATFORM_FEE_ADDRESS || ''; // removed from constants
exports.DUMMY_UTXO_VALUE = 600;
exports.DUMMY_UTXO_MAX_VALUE = 1000;
exports.DUMMY_UTXO_MIN_VALUE = 600;
// export const ORDINALS_POSTAGE_VALUE = 546;
exports.BITCOIN_RPC_HOST = 'http://localhost';
exports.BITCOIN_RPC_PORT = 38332;
exports.BITCOIN_RPC_USER = '__cookie__';
exports.BITCOIN_RPC_PASS = '';
exports.BITCOIN_RPC_TIMEOUT = 120000;
//# sourceMappingURL=constant.js.map