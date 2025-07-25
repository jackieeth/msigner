/// <reference types="node" />
import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import * as bitcoin from 'bitcoinjs-lib';
import { utxo } from './interfaces';
export declare const toXOnly: (pubKey: Buffer) => Buffer;
export declare const satToBtc: (sat: number) => number;
export declare const btcToSats: (btc: number) => number;
export declare function generateTxidFromHash(hash: Buffer): string;
export declare function mapUtxos(utxosFromMempool: AddressTxsUtxo[]): Promise<utxo[]>;
export declare function isP2SHAddress(address: string, network: bitcoin.Network): boolean;
//# sourceMappingURL=util.d.ts.map