import { AddressTxsUtxo } from '@mempool/mempool.js/lib/interfaces/bitcoin/addresses';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import {
  BTC_NETWORK,
  BUYING_PSBT_BUYER_RECEIVE_INDEX,
  BUYING_PSBT_PLATFORM_FEE_INDEX,
  BUYING_PSBT_SELLER_SIGNATURE_INDEX,
  DUMMY_UTXO_MAX_VALUE,
  DUMMY_UTXO_MIN_VALUE,
  DUMMY_UTXO_VALUE,
  // ORDINALS_POSTAGE_VALUE,
} from './constant';
import {
  generateTxidFromHash,
  isP2SHAddress,
  mapUtxos,
  satToBtc,
  toXOnly,
  getrawtransaction,
} from './util';
import {
  calculateTxBytesFee,
  calculateTxBytesFeeWithRate,
  getSellerOrdOutputValue,
} from './vendors/feeprovider';
// import { FullnodeRPC } from './vendors/fullnoderpc';
import { getFees } from './vendors/mempool';
import {
  FeeProvider,
  IListingState,
  InvalidArgumentError,
  IOrdAPIPostPSBTBuying,
  IOrdAPIPostPSBTListing,
  ItemProvider,
  WitnessUtxo,
  utxo,
} from './interfaces';

bitcoin.initEccLib(ecc);

const network =
  BTC_NETWORK === 'mainnet'
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;

export namespace SellerSigner {
  /**
   * Generates an unsigned PSBT for listing an ordinal item.
   * @param listing The listing state containing seller information.
   * @returns The updated listing state with the unsigned PSBT base64 string.
   */
  export async function generateUnsignedListingPSBTBase64(
    listing: IListingState,
  ): Promise<IListingState> {
    const psbt = new bitcoin.Psbt({ network });
    const [ordinalUtxoTxId, ordinalUtxoVout] =
      listing.seller.ordItem.output.split(':');

    const txHex = await getrawtransaction(
      listing.seller.ordItem.output.split(':')[0],
    );
    if (!txHex) {
      throw new Error('Failed to fetch transaction hex for ordinalUtxoTxId');
    }
    const tx = bitcoin.Transaction.fromHex(txHex);

    // No need to add this witness if the seller is using taproot
    if (!listing.seller.tapInternalKey) {
      for (const output in tx.outs) {
        try {
          tx.setWitness(parseInt(output), []);
        } catch {}
      }
    }

    const input: any = {
      hash: ordinalUtxoTxId,
      index: parseInt(ordinalUtxoVout),
      // nonWitnessUtxo: tx.toBuffer(), // this is not needed for taproot ord address
      // No problem in always adding a witnessUtxo here
      witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
      sighashType:
        bitcoin.Transaction.SIGHASH_SINGLE |
        bitcoin.Transaction.SIGHASH_ANYONECANPAY,
    };
    // If taproot is used, we need to add the internal key
    if (listing.seller.tapInternalKey) {
      input.tapInternalKey = toXOnly(
        tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex'),
      );
    }

    psbt.addInput(input);

    const sellerOutput = getSellerOrdOutputValue(
      listing.seller.price,
      listing.seller.makerFeeBp,
    );

    psbt.addOutput({
      address: listing.seller.sellerReceiveAddress,
      value: sellerOutput,
    });

    listing.seller.unsignedListingPSBTBase64 = psbt.toBase64();
    return listing;
  }
}

export namespace BuyerSigner {
  /**
   * Selects dummy UTXOs for the buyer.
   * @param utxos The available UTXOs to select from.
   * @returns An array of selected dummy UTXOs or null if not enough found.
   */
  export async function selectDummyUTXOs(
    utxos: AddressTxsUtxo[],
  ): Promise<utxo[] | null> {
    const result = [];
    for (const utxo of utxos) {
      // Never spend a utxo that contains an inscription for cardinal purposes

      if (
        utxo.value >= DUMMY_UTXO_MIN_VALUE &&
        utxo.value <= DUMMY_UTXO_MAX_VALUE
      ) {
        result.push((await mapUtxos([utxo]))[0]);
        if (result.length === 2) return result;
      }
    }

    return null;
  }

  /**
   * Selects UTXOs for payment.
   * @param utxos The available UTXOs to select from.
   * @param amount The total amount to cover (including fees).
   * @param vinsLength The number of input UTXOs.
   * @param voutsLength The number of output UTXOs.
   * @returns The selected UTXOs.
   */
  export async function selectPaymentUTXOs(
    utxos: AddressTxsUtxo[],
    amount: number, // amount is expected total output (except tx fee)
    vinsLength: number,
    voutsLength: number,
    feeRateTier: string,
  ) {
    const selectedUtxos = [];
    let selectedAmount = 0;

    // Sort descending by value, and filter out dummy utxos
    utxos = utxos
      .filter((x) => x.value > DUMMY_UTXO_VALUE)
      .sort((a, b) => b.value - a.value);

    for (const utxo of utxos) {
      // Never spend a utxo that contains an inscription for cardinal purposes

      selectedUtxos.push(utxo);
      selectedAmount += utxo.value;

      if (
        selectedAmount >=
        amount +
          (await calculateTxBytesFee(
            vinsLength + selectedUtxos.length,
            voutsLength,
            feeRateTier,
          ))
      ) {
        break;
      }
    }

    if (selectedAmount < amount) {
      throw new InvalidArgumentError(`Not enough cardinal spendable funds.
Address has:  ${satToBtc(selectedAmount)} BTC
Needed:       ${satToBtc(amount)} BTC`);
    }

    return await mapUtxos(selectedUtxos);
  }

  // note: application shall not allow purchasing with non-cardinal utxos)

  /**
   * Retrieves the seller's input and output for the PSBT.
   * @param listing The listing state containing seller information.
   * @returns An object containing the seller's input and output.
   */
  async function getSellerInputAndOutput(listing: IListingState) {
    const [ordinalUtxoTxId, ordinalUtxoVout] =
      listing.seller.ordItem.output.split(':');
    const txHex = await getrawtransaction(ordinalUtxoTxId);
    if (!txHex) {
      throw new Error('Failed to fetch transaction hex for ordinalUtxoTxId');
    }
    const tx = bitcoin.Transaction.fromHex(txHex);
    // No need to add this witness if the seller is using taproot
    if (!listing.seller.tapInternalKey) {
      for (let outputIndex = 0; outputIndex < tx.outs.length; outputIndex++) {
        try {
          tx.setWitness(outputIndex, []);
        } catch {}
      }
    }

    const sellerInput: any = {
      hash: ordinalUtxoTxId,
      index: parseInt(ordinalUtxoVout),
      // nonWitnessUtxo: tx.toBuffer(), // this is not needed for taproot ord address
      // No problem in always adding a witnessUtxo here
      witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
    };
    // If taproot is used, we need to add the internal key
    if (listing.seller.tapInternalKey) {
      sellerInput.tapInternalKey = toXOnly(
        tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex'),
      );
    }

    const ret = {
      sellerInput,
      sellerOutput: {
        address: listing.seller.sellerReceiveAddress,
        value: listing.seller.ordItem.outputValue, // this should be the same value as original seller's utxo value instead of generic postage value
      },
    };

    return ret;
  }

  /**
   * Generates an unsigned PSBT for buying an ordinal item.
   * @param listing The listing state containing buyer and seller information.
   * @param PLATFORM_FEE_ADDRESS The address to send platform fees to.
   * @param customOpReturnText Optional custom text to include in the OP_RETURN output.
   * @returns The updated listing state with the unsigned PSBT base64 string.
   */
  export async function generateUnsignedBuyingPSBTBase64(
    listing: IListingState,
    PLATFORM_FEE_ADDRESS: string,
    customOpReturnText?: string,
  ) {
    const psbt = new bitcoin.Psbt({ network });
    if (
      !listing.buyer ||
      !listing.buyer.buyerAddress ||
      !listing.buyer.buyerTokenReceiveAddress
    ) {
      throw new InvalidArgumentError('Buyer address is not set');
    }

    if (
      listing.buyer.buyerDummyUTXOs?.length !== 2 ||
      !listing.buyer.buyerPaymentUTXOs
    ) {
      throw new InvalidArgumentError('Buyer address has not enough utxos');
    }

    let totalInput = 0;

    // Add two dummyUtxos
    for (const dummyUtxo of listing.buyer.buyerDummyUTXOs) {
      const input: any = {
        hash: dummyUtxo.txid,
        index: dummyUtxo.vout,
        nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
      };

      const p2shInputRedeemScript: any = {};
      const p2shInputWitnessUTXO: any = {};

      if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(listing.buyer.buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        p2shInputWitnessUTXO.witnessUtxo = {
          script: p2sh.output,
          value: dummyUtxo.value,
        } as WitnessUtxo;
        p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
      }

      psbt.addInput({
        ...input,
        ...p2shInputWitnessUTXO,
        ...p2shInputRedeemScript,
      });
      totalInput += dummyUtxo.value;
    }

    // Add dummy output
    psbt.addOutput({
      address: listing.buyer.buyerAddress, // use buyer's btc payment address for receiving dummies to reduce total price required
      value:
        listing.buyer.buyerDummyUTXOs[0].value +
        listing.buyer.buyerDummyUTXOs[1].value,
      // Number(listing.seller.ordItem.location.split(':')[2]), // this is sat location, but we use the dummy utxo value instead to leave selling utxo in tact.
    });
    // Add ordinal output
    psbt.addOutput({
      address: listing.buyer.buyerTokenReceiveAddress,
      value: listing.seller.ordItem.outputValue, // this should be the same value as original seller's utxo value instead of generic postage value
    });

    const { sellerInput, sellerOutput } = await getSellerInputAndOutput(
      listing,
    );

    psbt.addInput(sellerInput);
    psbt.addOutput(sellerOutput);

    // Add payment utxo inputs
    for (const utxo of listing.buyer.buyerPaymentUTXOs) {
      const input: any = {
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: utxo.tx.toBuffer(),
      };

      const p2shInputWitnessUTXOUn: any = {};
      const p2shInputRedeemScriptUn: any = {};

      if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(listing.buyer.buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        p2shInputWitnessUTXOUn.witnessUtxo = {
          script: p2sh.output,
          value: utxo.value,
        } as WitnessUtxo;
        p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
      }

      psbt.addInput({
        ...input,
        ...p2shInputWitnessUTXOUn,
        ...p2shInputRedeemScriptUn,
      });

      totalInput += utxo.value;
    }

    // Create a platform fee output
    let platformFeeValue = Math.floor(
      (listing.seller.price *
        (listing.buyer.takerFeeBp + listing.seller.makerFeeBp)) /
        100,
    );
    platformFeeValue =
      platformFeeValue > DUMMY_UTXO_MIN_VALUE ? platformFeeValue : 0; // platform fee should be at least DUMMY_UTXO_MIN_VALUE or free

    if (platformFeeValue > 0) {
      psbt.addOutput({
        address: PLATFORM_FEE_ADDRESS,
        value: platformFeeValue,
      });
    }

    // Create two new dummy utxo output for the next purchase
    psbt.addOutput({
      address: listing.buyer.buyerAddress,
      value: DUMMY_UTXO_VALUE,
    });
    psbt.addOutput({
      address: listing.buyer.buyerAddress,
      value: DUMMY_UTXO_VALUE,
    });

    const fee = await calculateTxBytesFee(
      psbt.txInputs.length,
      psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
      listing.buyer.feeRateTier,
    );

    const totalOutput = psbt.txOutputs.reduce(
      (partialSum, a) => partialSum + a.value,
      0,
    );
    const changeValue = totalInput - totalOutput - fee;

    if (changeValue < 0) {
      throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:      ${satToBtc(listing.seller.price)} BTC
Required:   ${satToBtc(totalOutput + fee)} BTC
Missing:    ${satToBtc(-changeValue)} BTC`;
    }

    // Change utxo
    if (changeValue > DUMMY_UTXO_MIN_VALUE) {
      psbt.addOutput({
        address: listing.buyer.buyerAddress,
        value: changeValue,
      });
    }

    // add op_return text
    if (customOpReturnText) {
      psbt.addOutput({
        script: bitcoin.script.compile([
          bitcoin.opcodes.OP_RETURN,
          Buffer.from(customOpReturnText, 'utf-8'),
        ]),
        value: 0,
      });
    }

    listing.buyer.unsignedBuyingPSBTBase64 = psbt.toBase64();
    listing.buyer.unsignedBuyingPSBTInputSize = psbt.data.inputs.length;
    return listing;
  }

  // Buying multiple listings
  /**
   * Generates an unsigned PSBT for buying multiple ordinal items.
   * @param listings The array of listing states containing buyer and seller information.
   * @param PLATFORM_FEE_ADDRESS The address to send platform fees to.
   * @param customOpReturnText Optional custom text to include in the OP_RETURN output.
   * @returns An object containing the unsigned PSBT base64 string and input size.
   */
  export async function generateUnsignedBatchBuyingPSBTBase64(
    listings: IListingState[],
    PLATFORM_FEE_ADDRESS: string,
    customOpReturnText?: string,
  ) {
    if (listings.length < 2) {
      throw new InvalidArgumentError('At least two listings are required');
    }

    // use first listing's buyer address and dummy utxos because they are the same for all listings
    const buyer = listings[0].buyer;
    if (!buyer || !buyer.buyerAddress || !buyer.buyerTokenReceiveAddress) {
      throw new InvalidArgumentError('Buyer address is not set');
    }

    // check if buyer can afford to buy multiple listings
    if (!buyer.buyerPaymentUTXOs || buyer.buyerPaymentUTXOs.length === 0) {
      throw new InvalidArgumentError('Buyer address has no payment utxos');
    }
    let buyerPaymentTotal = 0;
    for (const buyerUtxo of buyer.buyerPaymentUTXOs) {
      buyerPaymentTotal += buyerUtxo.value;
    }

    const totalPrice = listings.reduce(
      (sum, listing) => sum + listing.seller.price,
      0,
    );

    if (buyerPaymentTotal < totalPrice) {
      throw new InvalidArgumentError(
        `Your wallet address doesn't have enough funds to buy these inscriptions. 
Price:      ${satToBtc(totalPrice)} BTC
Required:   ${satToBtc(buyerPaymentTotal)} BTC
Missing:    ${satToBtc(buyerPaymentTotal - totalPrice)} BTC
        `,
      );
    }

    // 1 + len(listings) dummy utxos are required for buyer to safely purchase multiple listings
    const requiredDummyUTXOs = 1 + listings.length;
    if (buyer?.buyerDummyUTXOs?.length !== requiredDummyUTXOs) {
      throw new InvalidArgumentError('Buyer address has not enough safe utxos');
    }

    const psbt = new bitcoin.Psbt({ network });

    let totalInput = 0;

    // Add inputs 0 to n:  1 + len(listings) dummyUtxos as inputs
    for (const dummyUtxo of buyer.buyerDummyUTXOs) {
      const input: any = {
        hash: dummyUtxo.txid,
        index: dummyUtxo.vout,
        nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
      };

      const p2shInputRedeemScript: any = {};
      const p2shInputWitnessUTXO: any = {};

      if (isP2SHAddress(buyer.buyerAddress, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(buyer.buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        p2shInputWitnessUTXO.witnessUtxo = {
          script: p2sh.output,
          value: dummyUtxo.value,
        } as WitnessUtxo;
        p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
      }

      if (psbt.data.inputs.length < requiredDummyUTXOs) {
        psbt.addInput({
          ...input,
          ...p2shInputWitnessUTXO,
          ...p2shInputRedeemScript,
        });
        totalInput += dummyUtxo.value;
      }
    }

    // Add output 0, sum of dummy utxos for safe purchase
    psbt.addOutput({
      address: buyer.buyerAddress, // use buyer's btc payment address for receiving dummies to reduce total price required
      value: DUMMY_UTXO_MIN_VALUE * requiredDummyUTXOs, // 1 + len(listings) dummy utxos
    });

    for (const listing of listings) {
      // Add ordinal output
      psbt.addOutput({
        address: buyer.buyerTokenReceiveAddress,
        value: listing.seller.ordItem.outputValue, // this should be the same value as original seller's utxo value instead of generic postage value
      });
    }

    for (const listing of listings) {
      const { sellerInput, sellerOutput } = await getSellerInputAndOutput(
        listing,
      );

      psbt.addInput(sellerInput);
      psbt.addOutput(sellerOutput);
    }

    // Add payment utxo inputs
    for (const utxo of buyer.buyerPaymentUTXOs) {
      const input: any = {
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: utxo.tx.toBuffer(),
      };

      const p2shInputWitnessUTXOUn: any = {};
      const p2shInputRedeemScriptUn: any = {};

      if (isP2SHAddress(buyer.buyerAddress, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(buyer.buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        p2shInputWitnessUTXOUn.witnessUtxo = {
          script: p2sh.output,
          value: utxo.value,
        } as WitnessUtxo;
        p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
      }

      psbt.addInput({
        ...input,
        ...p2shInputWitnessUTXOUn,
        ...p2shInputRedeemScriptUn,
      });

      totalInput += utxo.value;
    }

    // Create a platform fee output
    let platformFeeValue = 0;
    for (const listing of listings) {
      platformFeeValue +=
        Math.floor(
          (listing.seller.price * (1 + listing.seller.makerFeeBp)) / 100,
        ) || 0;
    }

    // platform fee should be at least DUMMY_UTXO_MIN_VALUE or free
    if (platformFeeValue > DUMMY_UTXO_MIN_VALUE) {
      psbt.addOutput({
        address: PLATFORM_FEE_ADDRESS,
        value: platformFeeValue,
      });
    }

    // Create two new dummy utxo output for the next purchase
    for (let i = 0; i < requiredDummyUTXOs; i++) {
      psbt.addOutput({
        address: buyer.buyerAddress,
        value: DUMMY_UTXO_VALUE,
      });
    }

    const fee = await calculateTxBytesFee(
      psbt.txInputs.length,
      psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
      buyer.feeRateTier,
    );

    const totalOutput = psbt.txOutputs.reduce(
      (partialSum, a) => partialSum + a.value,
      0,
    );
    const changeValue = totalInput - totalOutput - fee;

    if (changeValue < 0) {
      throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:      ${satToBtc(totalPrice)} BTC
Required:   ${satToBtc(totalOutput + fee)} BTC
Missing:    ${satToBtc(-changeValue)} BTC`;
    }

    // Change utxo
    if (changeValue > DUMMY_UTXO_MIN_VALUE) {
      psbt.addOutput({
        address: buyer.buyerAddress,
        value: changeValue,
      });
    }

    // add op_return text
    if (customOpReturnText) {
      psbt.addOutput({
        script: bitcoin.script.compile([
          bitcoin.opcodes.OP_RETURN,
          Buffer.from(customOpReturnText, 'utf-8'),
        ]),
        value: 0,
      });
    }

    return {
      unsignedBuyingPSBTBase64: psbt.toBase64(),
      unsignedBuyingPSBTInputSize: psbt.data.inputs.length,
    };
  }

  /**
   * Merges the signed listing PSBT with the signed buying PSBT.
   * @param signedListingPSBTBase64 The base64 encoded signed listing PSBT.
   * @param signedBuyingPSBTBase64 The base64 encoded signed buying PSBT.
   * @returns The merged PSBT as a base64 encoded string.
   */
  export function mergeSignedBuyingPSBTBase64(
    signedListingPSBTBase64: string,
    signedBuyingPSBTBase64: string,
  ): string {
    const sellerSignedPsbt = bitcoin.Psbt.fromBase64(signedListingPSBTBase64);
    const buyerSignedPsbt = bitcoin.Psbt.fromBase64(signedBuyingPSBTBase64);

    (buyerSignedPsbt.data.globalMap.unsignedTx as any).tx.ins[
      BUYING_PSBT_SELLER_SIGNATURE_INDEX
    ] = (sellerSignedPsbt.data.globalMap.unsignedTx as any).tx.ins[0];
    buyerSignedPsbt.data.inputs[BUYING_PSBT_SELLER_SIGNATURE_INDEX] =
      sellerSignedPsbt.data.inputs[0];

    return buyerSignedPsbt.toBase64();
  }

  /**
   * Generates an unsigned PSBT for creating dummy UTXOs.
   * @param address The address to send the dummy UTXOs to.
   * @param buyerPublicKey The public key of the buyer.
   * @param unqualifiedUtxos The unqualified UTXOs available for use.
   * @param feeRateTier The fee rate tier to use for the transaction.
   * @returns The base64 encoded unsigned PSBT.
   */
  export async function generateUnsignedCreateDummyUtxoPSBTBase64(
    address: string,
    buyerPublicKey: string | undefined,
    unqualifiedUtxos: AddressTxsUtxo[],
    feeRateTier: string,
    // itemProvider: ItemProvider,
  ): Promise<string> {
    const psbt = new bitcoin.Psbt({ network });
    const [mappedUnqualifiedUtxos, recommendedFee] = await Promise.all([
      mapUtxos(unqualifiedUtxos),
      getFees(feeRateTier),
    ]);

    // Loop the unqualified utxos until we have enough to create a dummy utxo
    let totalValue = 0;
    let paymentUtxoCount = 0;
    for (const utxo of mappedUnqualifiedUtxos) {
      //// TODO: check inscription AND rare sats
      // if (await doesUtxoContainInscriptionOrRareSats(utxo, itemProvider)) {
      //   continue;
      // }

      const input: any = {
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: utxo.tx.toBuffer(),
      };

      if (isP2SHAddress(address, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        input.witnessUtxo = utxo.tx.outs[utxo.vout];
        input.redeemScript = p2sh.redeem?.output;
      }

      psbt.addInput(input);
      totalValue += utxo.value;
      paymentUtxoCount += 1;

      const fees = calculateTxBytesFeeWithRate(
        paymentUtxoCount,
        2, // 2-dummy outputs
        recommendedFee,
      );
      if (totalValue >= DUMMY_UTXO_VALUE * 2 + fees) {
        break;
      }
    }

    const finalFees = calculateTxBytesFeeWithRate(
      paymentUtxoCount,
      2, // 2-dummy outputs
      recommendedFee,
    );

    const changeValue = totalValue - DUMMY_UTXO_VALUE * 2 - finalFees;

    // We must have enough value to create a dummy utxo and pay for tx fees
    if (changeValue < 0) {
      throw new InvalidArgumentError(
        `You might have pending transactions or not enough fund`,
      );
    }

    psbt.addOutput({
      address,
      value: DUMMY_UTXO_VALUE,
    });
    psbt.addOutput({
      address,
      value: DUMMY_UTXO_VALUE,
    });

    // to avoid dust
    if (changeValue > DUMMY_UTXO_MIN_VALUE) {
      psbt.addOutput({
        address,
        value: changeValue,
      });
    }

    return psbt.toBase64();
  }

  /**
   * Generates an unsigned PSBT for creating dummy UTXOs.
   * @param address The address to send the dummy UTXOs to.
   * @param buyerPublicKey The public key of the buyer.
   * @param unqualifiedUtxos The unqualified UTXOs available for use.
   * @param feeRateTier The fee rate tier to use for the transaction.
   * @returns The base64 encoded unsigned PSBT.
   */
  export async function generateUnsignedDummiesUtxoPSBTBase64(
    address: string,
    buyerPublicKey: string | undefined,
    unqualifiedUtxos: AddressTxsUtxo[],
    feeRateTier: string,
    numberOfDummies: number = 8,
    customOpReturnText?: string,
  ): Promise<string> {
    const psbt = new bitcoin.Psbt({ network });
    const [mappedUnqualifiedUtxos, recommendedFee] = await Promise.all([
      mapUtxos(unqualifiedUtxos),
      getFees(feeRateTier),
    ]);

    // Loop the unqualified utxos until we have enough to create a dummy utxo
    let totalValue = 0;
    let paymentUtxoCount = 0;
    for (const utxo of mappedUnqualifiedUtxos) {
      const input: any = {
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: utxo.tx.toBuffer(),
      };

      if (isP2SHAddress(address, network)) {
        const redeemScript = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(buyerPublicKey!, 'hex'),
        }).output;
        const p2sh = bitcoin.payments.p2sh({
          redeem: { output: redeemScript },
        });
        input.witnessUtxo = utxo.tx.outs[utxo.vout];
        input.redeemScript = p2sh.redeem?.output;
      }

      psbt.addInput(input);
      totalValue += utxo.value;
      paymentUtxoCount += 1;

      const fees = calculateTxBytesFeeWithRate(
        paymentUtxoCount,
        numberOfDummies,
        recommendedFee,
      );
      if (totalValue >= DUMMY_UTXO_VALUE * numberOfDummies + fees) {
        break;
      }
    }

    const finalFees = calculateTxBytesFeeWithRate(
      paymentUtxoCount,
      numberOfDummies,
      recommendedFee,
    );

    const changeValue =
      totalValue - DUMMY_UTXO_VALUE * numberOfDummies - finalFees;

    // We must have enough value to create a dummy utxo and pay for tx fees
    if (changeValue < 0) {
      throw new InvalidArgumentError(
        `You might have pending transactions or not enough fund`,
      );
    }

    for (let i = 0; i < numberOfDummies; i++) {
      psbt.addOutput({
        address,
        value: DUMMY_UTXO_VALUE,
      });
    }

    // to avoid dust
    if (changeValue > DUMMY_UTXO_MIN_VALUE) {
      psbt.addOutput({
        address,
        value: changeValue,
      });
    }

    // add op_return text
    if (customOpReturnText) {
      psbt.addOutput({
        script: bitcoin.script.compile([
          bitcoin.opcodes.OP_RETURN,
          Buffer.from(customOpReturnText, 'utf-8'),
        ]),
        value: 0,
      });
    }

    return psbt.toBase64();
  }
}
