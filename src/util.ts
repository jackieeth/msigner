import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import * as bitcoin from 'bitcoinjs-lib';
import { utxo } from './interfaces';
// import { FullnodeRPC } from './vendors/fullnoderpc';

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);

export const satToBtc = (sat: number) => sat / 100000000;
export const btcToSats = (btc: number) => btc * 100000000;

export function generateTxidFromHash(hash: Buffer) {
  return hash.reverse().toString('hex');
}

export async function getrawtransaction(txid: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://mempool.space/api/tx/${txid}/hex`);
    if (!res.ok) {
      throw new Error(`Failed to fetch transaction hex: ${res.statusText}`);
    }
    const txHex = await res.text();
    return txHex;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function mapUtxos(
  utxosFromMempool: AddressTxsUtxo[],
): Promise<utxo[]> {
  const ret: utxo[] = [];
  for (const utxoFromMempool of utxosFromMempool) {
    const txHex = await getrawtransaction(utxoFromMempool.txid);
    if (!txHex) {
      throw new Error(`Transaction hex not found for txid: ${utxoFromMempool.txid}`);
    }
    ret.push({
      txid: utxoFromMempool.txid,
      vout: utxoFromMempool.vout,
      value: utxoFromMempool.value,
      status: utxoFromMempool.status,
      tx: bitcoin.Transaction.fromHex(txHex),
    });
  }
  return ret;
}

export function isP2SHAddress(
  address: string,
  network: bitcoin.Network,
): boolean {
  try {
    const { version, hash } = bitcoin.address.fromBase58Check(address);
    return version === network.scriptHash && hash.length === 20;
  } catch (error) {
    return false;
  }
}
