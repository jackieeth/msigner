export declare const mempoolBitcoin: {
    addresses: import("@mempool/mempool.js/lib/interfaces/bitcoin/addresses").AddressInstance;
    blocks: import("@mempool/mempool.js/lib/interfaces/bitcoin/blocks").BlockInstance;
    difficulty: import("@mempool/mempool.js/lib/interfaces/bitcoin/difficulty").DifficultyInstance;
    fees: import("@mempool/mempool.js/lib/interfaces/bitcoin/fees").FeeInstance;
    mempool: import("@mempool/mempool.js/lib/interfaces/bitcoin/mempool").MempoolInstance;
    transactions: import("@mempool/mempool.js/lib/interfaces/bitcoin/transactions").TxInstance;
    websocket: import("@mempool/mempool.js/lib/interfaces/bitcoin/websockets").WsInstance;
};
export declare function getFeesRecommended(): Promise<import("@mempool/mempool.js/lib/interfaces/bitcoin/fees").FeesRecommended>;
export declare function getUtxosByAddress(address: string): Promise<import("@mempool/mempool.js/lib/interfaces/bitcoin/addresses").AddressTxsUtxo[]>;
export declare function getMempoolTxIds(): Promise<string[]>;
export declare function getFees(feeRateTier: string): Promise<number>;
//# sourceMappingURL=mempool.d.ts.map