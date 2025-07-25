"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isP2SHAddress = exports.mapUtxos = exports.generateTxidFromHash = exports.btcToSats = exports.satToBtc = exports.toXOnly = void 0;
const bitcoin = __importStar(require("bitcoinjs-lib"));
const fullnoderpc_1 = require("./vendors/fullnoderpc");
const toXOnly = (pubKey) => pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
exports.toXOnly = toXOnly;
const satToBtc = (sat) => sat / 100000000;
exports.satToBtc = satToBtc;
const btcToSats = (btc) => btc * 100000000;
exports.btcToSats = btcToSats;
function generateTxidFromHash(hash) {
    return hash.reverse().toString('hex');
}
exports.generateTxidFromHash = generateTxidFromHash;
async function mapUtxos(utxosFromMempool) {
    const ret = [];
    for (const utxoFromMempool of utxosFromMempool) {
        ret.push({
            txid: utxoFromMempool.txid,
            vout: utxoFromMempool.vout,
            value: utxoFromMempool.value,
            status: utxoFromMempool.status,
            tx: bitcoin.Transaction.fromHex(await fullnoderpc_1.FullnodeRPC.getrawtransaction(utxoFromMempool.txid)),
        });
    }
    return ret;
}
exports.mapUtxos = mapUtxos;
function isP2SHAddress(address, network) {
    try {
        const { version, hash } = bitcoin.address.fromBase58Check(address);
        return version === network.scriptHash && hash.length === 20;
    }
    catch (error) {
        return false;
    }
}
exports.isP2SHAddress = isP2SHAddress;
//# sourceMappingURL=util.js.map