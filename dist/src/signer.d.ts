import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import { IListingState, utxo } from './interfaces';
export declare namespace SellerSigner {
    /**
     * Generates an unsigned PSBT for listing an ordinal item.
     * @param listing The listing state containing seller information.
     * @returns The updated listing state with the unsigned PSBT base64 string.
     */
    function generateUnsignedListingPSBTBase64(listing: IListingState): Promise<IListingState>;
}
export declare namespace BuyerSigner {
    /**
     * Selects dummy UTXOs for the buyer.
     * @param utxos The available UTXOs to select from.
     * @returns An array of selected dummy UTXOs or null if not enough found.
     */
    function selectDummyUTXOs(utxos: AddressTxsUtxo[]): Promise<utxo[] | null>;
    /**
     * Selects UTXOs for payment.
     * @param utxos The available UTXOs to select from.
     * @param amount The total amount to cover (including fees).
     * @param vinsLength The number of input UTXOs.
     * @param voutsLength The number of output UTXOs.
     * @returns The selected UTXOs.
     */
    function selectPaymentUTXOs(utxos: AddressTxsUtxo[], amount: number, // amount is expected total output (except tx fee)
    vinsLength: number, voutsLength: number, feeRateTier: string): Promise<utxo[]>;
    /**
     * Generates an unsigned PSBT for buying an ordinal item.
     * @param listing The listing state containing buyer and seller information.
     * @param PLATFORM_FEE_ADDRESS The address to send platform fees to.
     * @param customOpReturnText Optional custom text to include in the OP_RETURN output.
     * @returns The updated listing state with the unsigned PSBT base64 string.
     */
    function generateUnsignedBuyingPSBTBase64(listing: IListingState, PLATFORM_FEE_ADDRESS: string, customOpReturnText?: string): Promise<IListingState>;
    /**
     * Generates an unsigned PSBT for buying multiple ordinal items.
     * @param listings The array of listing states containing buyer and seller information.
     * @param PLATFORM_FEE_ADDRESS The address to send platform fees to.
     * @param customOpReturnText Optional custom text to include in the OP_RETURN output.
     * @returns An object containing the unsigned PSBT base64 string and input size.
     */
    function generateUnsignedBatchBuyingPSBTBase64(listings: IListingState[], PLATFORM_FEE_ADDRESS: string, customOpReturnText?: string): Promise<{
        unsignedBuyingPSBTBase64: string;
        unsignedBuyingPSBTInputSize: number;
    }>;
    /**
     * Merges the signed listing PSBT with the signed buying PSBT.
     * @param signedListingPSBTBase64 The base64 encoded signed listing PSBT.
     * @param signedBuyingPSBTBase64 The base64 encoded signed buying PSBT.
     * @returns The merged PSBT as a base64 encoded string.
     */
    function mergeSignedBuyingPSBTBase64(signedListingPSBTBase64: string, signedBuyingPSBTBase64: string): string;
    /**
     * Generates an unsigned PSBT for creating dummy UTXOs.
     * @param address The address to send the dummy UTXOs to.
     * @param buyerPublicKey The public key of the buyer.
     * @param unqualifiedUtxos The unqualified UTXOs available for use.
     * @param feeRateTier The fee rate tier to use for the transaction.
     * @returns The base64 encoded unsigned PSBT.
     */
    function generateUnsignedCreateDummyUtxoPSBTBase64(address: string, buyerPublicKey: string | undefined, unqualifiedUtxos: AddressTxsUtxo[], feeRateTier: string): Promise<string>;
    /**
     * Generates an unsigned PSBT for creating dummy UTXOs.
     * @param address The address to send the dummy UTXOs to.
     * @param buyerPublicKey The public key of the buyer.
     * @param unqualifiedUtxos The unqualified UTXOs available for use.
     * @param feeRateTier The fee rate tier to use for the transaction.
     * @returns The base64 encoded unsigned PSBT.
     */
    function generateUnsignedDummiesUtxoPSBTBase64(address: string, buyerPublicKey: string | undefined, unqualifiedUtxos: AddressTxsUtxo[], feeRateTier: string, numberOfDummies?: number, customOpReturnText?: string): Promise<string>;
}
//# sourceMappingURL=signer.d.ts.map