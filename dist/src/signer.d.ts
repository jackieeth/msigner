import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import { IListingState, utxo } from './interfaces';
export declare namespace SellerSigner {
    function generateUnsignedListingPSBTBase64(listing: IListingState): Promise<IListingState>;
}
export declare namespace BuyerSigner {
    function selectDummyUTXOs(utxos: AddressTxsUtxo[]): Promise<utxo[] | null>;
    function selectPaymentUTXOs(utxos: AddressTxsUtxo[], amount: number, // amount is expected total output (except tx fee)
    vinsLength: number, voutsLength: number, feeRateTier: string): Promise<utxo[]>;
    function generateUnsignedBuyingPSBTBase64(listing: IListingState, PLATFORM_FEE_ADDRESS: string, customOpReturnText?: string): Promise<IListingState>;
    function mergeSignedBuyingPSBTBase64(signedListingPSBTBase64: string, signedBuyingPSBTBase64: string): string;
    function generateUnsignedCreateDummyUtxoPSBTBase64(address: string, buyerPublicKey: string | undefined, unqualifiedUtxos: AddressTxsUtxo[], feeRateTier: string): Promise<string>;
    function generateUnsignedDummiesUtxoPSBTBase64(address: string, buyerPublicKey: string | undefined, unqualifiedUtxos: AddressTxsUtxo[], feeRateTier: string, numberOfDummies?: number, customOpReturnText?: string): Promise<string>;
}
//# sourceMappingURL=signer.d.ts.map