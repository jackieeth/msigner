import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import { FeeProvider, IListingState, IOrdAPIPostPSBTBuying, IOrdAPIPostPSBTListing, ItemProvider, utxo } from './interfaces';
export declare namespace SellerSigner {
    function generateUnsignedListingPSBTBase64(listing: IListingState): Promise<IListingState>;
    function verifySignedListingPSBTBase64(req: IOrdAPIPostPSBTListing, feeProvider: FeeProvider, itemProvider: ItemProvider): Promise<void>;
}
export declare namespace BuyerSigner {
    function selectDummyUTXOs(utxos: AddressTxsUtxo[]): Promise<utxo[] | null>;
    function selectPaymentUTXOs(utxos: AddressTxsUtxo[], amount: number, // amount is expected total output (except tx fee)
    vinsLength: number, voutsLength: number, feeRateTier: string): Promise<AddressTxsUtxo[]>;
    function generateUnsignedBuyingPSBTBase64(listing: IListingState, PLATFORM_FEE_ADDRESS: string): Promise<IListingState>;
    function mergeSignedBuyingPSBTBase64(signedListingPSBTBase64: string, signedBuyingPSBTBase64: string): string;
    function verifySignedBuyingPSBTBase64(req: IOrdAPIPostPSBTBuying, feeProvider: FeeProvider, itemProvider: ItemProvider, PLATFORM_FEE_ADDRESS: string): Promise<{
        newOutputOffset: number;
    }>;
    function generateUnsignedCreateDummyUtxoPSBTBase64(address: string, buyerPublicKey: string | undefined, unqualifiedUtxos: AddressTxsUtxo[], feeRateTier: string): Promise<string>;
}
//# sourceMappingURL=signer.d.ts.map