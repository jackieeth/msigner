import { RPCClient } from 'rpc-bitcoin';
export type IAnalyzePSBTResult = {
    inputs: {
        has_utxo: boolean;
        is_final: boolean;
        next: string;
    }[];
    next: string;
};
export type ITestMempoolAcceptResult = {
    txid: string;
    wtxid: string;
    allowed: boolean;
    vsize: number;
    fees: {
        base: number;
    };
    'reject-reason': string;
}[];
export type IGetRawTransactionVerboseResult = {
    txid: string;
    hex: string;
    blochash: string;
    blocktime: number;
    confirmations: number;
    vin: {
        txid: string;
        vout: number;
        scriptSig: {
            asm: string;
            hex: string;
        };
        sequence: number;
        txinwitness: string[];
    }[];
    vout: {
        value: number;
        n: number;
    }[];
};
export declare class FullnodeRPC {
    static getClient(): RPCClient;
    static getrawtransaction(txid: string): Promise<string>;
    static getrawtransactionVerbose(txid: string): Promise<IGetRawTransactionVerboseResult>;
    static analyzepsbt(psbt: string): Promise<IAnalyzePSBTResult>;
    static finalizepsbt(psbt: string): Promise<{
        hex: string;
        complete: boolean;
    }>;
    static testmempoolaccept(rawtxs: string[]): Promise<ITestMempoolAcceptResult>;
    static sendrawtransaction(rawtx: string): Promise<string>;
    static getrawmempool(): Promise<string[]>;
}
//# sourceMappingURL=fullnoderpc.d.ts.map