"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullnodeRPC = void 0;
const rpc_bitcoin_1 = require("rpc-bitcoin");
const constant_1 = require("../constant");
let client;
class FullnodeRPC {
    static getClient() {
        if (client)
            return client;
        client = new rpc_bitcoin_1.RPCClient({
            url: constant_1.BITCOIN_RPC_HOST,
            port: constant_1.BITCOIN_RPC_PORT,
            user: constant_1.BITCOIN_RPC_USER,
            pass: constant_1.BITCOIN_RPC_PASS,
            timeout: constant_1.BITCOIN_RPC_TIMEOUT,
        });
        return client;
    }
    static async getrawtransaction(txid) {
        const client = this.getClient();
        const res = await client.getrawtransaction({ txid });
        return res;
    }
    static async getrawtransactionVerbose(txid) {
        const client = this.getClient();
        const res = await client.getrawtransaction({ txid, verbose: true });
        return res;
    }
    static async analyzepsbt(psbt) {
        const client = this.getClient();
        const res = await client.analyzepsbt({ psbt });
        return res;
    }
    static async finalizepsbt(psbt) {
        const client = this.getClient();
        const res = await client.finalizepsbt({ psbt, extract: true });
        return res;
    }
    static async testmempoolaccept(rawtxs) {
        const client = this.getClient();
        const res = await client.testmempoolaccept({ rawtxs });
        return res;
    }
    static async sendrawtransaction(rawtx) {
        const client = this.getClient();
        const res = await client.sendrawtransaction({ hexstring: rawtx });
        return res;
    }
    static async getrawmempool() {
        const client = this.getClient();
        const res = await client.getrawmempool();
        return res;
    }
}
exports.FullnodeRPC = FullnodeRPC;
//# sourceMappingURL=fullnoderpc.js.map