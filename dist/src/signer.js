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
exports.BuyerSigner = exports.SellerSigner = void 0;
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const constant_1 = require("./constant");
const util_1 = require("./util");
const feeprovider_1 = require("./vendors/feeprovider");
// import { FullnodeRPC } from './vendors/fullnoderpc';
const mempool_1 = require("./vendors/mempool");
const interfaces_1 = require("./interfaces");
bitcoin.initEccLib(ecc);
const network = constant_1.BTC_NETWORK === 'mainnet'
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
var SellerSigner;
(function (SellerSigner) {
    /**
     * Generates an unsigned PSBT for listing an ordinal item.
     * @param listing The listing state containing seller information.
     * @returns The updated listing state with the unsigned PSBT base64 string.
     */
    async function generateUnsignedListingPSBTBase64(listing) {
        const psbt = new bitcoin.Psbt({ network });
        const [ordinalUtxoTxId, ordinalUtxoVout] = listing.seller.ordItem.output.split(':');
        const txHex = await (0, util_1.getrawtransaction)(listing.seller.ordItem.output.split(':')[0]);
        if (!txHex) {
            throw new Error('Failed to fetch transaction hex for ordinalUtxoTxId');
        }
        const tx = bitcoin.Transaction.fromHex(txHex);
        // No need to add this witness if the seller is using taproot
        if (!listing.seller.tapInternalKey) {
            for (const output in tx.outs) {
                try {
                    tx.setWitness(parseInt(output), []);
                }
                catch { }
            }
        }
        const input = {
            hash: ordinalUtxoTxId,
            index: parseInt(ordinalUtxoVout),
            // nonWitnessUtxo: tx.toBuffer(), // this is not needed for taproot ord address
            // No problem in always adding a witnessUtxo here
            witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
            sighashType: bitcoin.Transaction.SIGHASH_SINGLE |
                bitcoin.Transaction.SIGHASH_ANYONECANPAY,
        };
        // If taproot is used, we need to add the internal key
        if (listing.seller.tapInternalKey) {
            input.tapInternalKey = (0, util_1.toXOnly)(tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex'));
        }
        psbt.addInput(input);
        const sellerOutput = (0, feeprovider_1.getSellerOrdOutputValue)(listing.seller.price, listing.seller.makerFeeBp);
        psbt.addOutput({
            address: listing.seller.sellerReceiveAddress,
            value: sellerOutput,
        });
        listing.seller.unsignedListingPSBTBase64 = psbt.toBase64();
        return listing;
    }
    SellerSigner.generateUnsignedListingPSBTBase64 = generateUnsignedListingPSBTBase64;
})(SellerSigner = exports.SellerSigner || (exports.SellerSigner = {}));
var BuyerSigner;
(function (BuyerSigner) {
    /**
     * Selects dummy UTXOs for the buyer.
     * @param utxos The available UTXOs to select from.
     * @returns An array of selected dummy UTXOs or null if not enough found.
     */
    async function selectDummyUTXOs(utxos) {
        const result = [];
        for (const utxo of utxos) {
            // Never spend a utxo that contains an inscription for cardinal purposes
            if (utxo.value >= constant_1.DUMMY_UTXO_MIN_VALUE &&
                utxo.value <= constant_1.DUMMY_UTXO_MAX_VALUE) {
                result.push((await (0, util_1.mapUtxos)([utxo]))[0]);
                if (result.length === 2)
                    return result;
            }
        }
        return null;
    }
    BuyerSigner.selectDummyUTXOs = selectDummyUTXOs;
    /**
     * Selects UTXOs for payment.
     * @param utxos The available UTXOs to select from.
     * @param amount The total amount to cover (including fees).
     * @param vinsLength The number of input UTXOs.
     * @param voutsLength The number of output UTXOs.
     * @returns The selected UTXOs.
     */
    async function selectPaymentUTXOs(utxos, amount, // amount is expected total output (except tx fee)
    vinsLength, voutsLength, feeRateTier) {
        const selectedUtxos = [];
        let selectedAmount = 0;
        // Sort descending by value, and filter out dummy utxos
        utxos = utxos
            .filter((x) => x.value > constant_1.DUMMY_UTXO_VALUE)
            .sort((a, b) => b.value - a.value);
        for (const utxo of utxos) {
            // Never spend a utxo that contains an inscription for cardinal purposes
            selectedUtxos.push(utxo);
            selectedAmount += utxo.value;
            if (selectedAmount >=
                amount +
                    (await (0, feeprovider_1.calculateTxBytesFee)(vinsLength + selectedUtxos.length, voutsLength, feeRateTier))) {
                break;
            }
        }
        if (selectedAmount < amount) {
            throw new interfaces_1.InvalidArgumentError(`Not enough cardinal spendable funds.
Address has:  ${(0, util_1.satToBtc)(selectedAmount)} BTC
Needed:       ${(0, util_1.satToBtc)(amount)} BTC`);
        }
        return await (0, util_1.mapUtxos)(selectedUtxos);
    }
    BuyerSigner.selectPaymentUTXOs = selectPaymentUTXOs;
    // note: application shall not allow purchasing with non-cardinal utxos)
    /**
     * Retrieves the seller's input and output for the PSBT.
     * @param listing The listing state containing seller information.
     * @returns An object containing the seller's input and output.
     */
    async function getSellerInputAndOutput(listing) {
        const [ordinalUtxoTxId, ordinalUtxoVout] = listing.seller.ordItem.output.split(':');
        const txHex = await (0, util_1.getrawtransaction)(ordinalUtxoTxId);
        if (!txHex) {
            throw new Error('Failed to fetch transaction hex for ordinalUtxoTxId');
        }
        const tx = bitcoin.Transaction.fromHex(txHex);
        // No need to add this witness if the seller is using taproot
        if (!listing.seller.tapInternalKey) {
            for (let outputIndex = 0; outputIndex < tx.outs.length; outputIndex++) {
                try {
                    tx.setWitness(outputIndex, []);
                }
                catch { }
            }
        }
        const sellerInput = {
            hash: ordinalUtxoTxId,
            index: parseInt(ordinalUtxoVout),
            // nonWitnessUtxo: tx.toBuffer(), // this is not needed for taproot ord address
            // No problem in always adding a witnessUtxo here
            witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
        };
        // If taproot is used, we need to add the internal key
        if (listing.seller.tapInternalKey) {
            sellerInput.tapInternalKey = (0, util_1.toXOnly)(tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex'));
        }
        const ret = {
            sellerInput,
            sellerOutput: {
                address: listing.seller.sellerReceiveAddress,
                value: (0, feeprovider_1.getSellerOrdOutputValue)(listing.seller.price, listing.seller.makerFeeBp)
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
    async function generateUnsignedBuyingPSBTBase64(listing, PLATFORM_FEE_ADDRESS, customOpReturnText) {
        const psbt = new bitcoin.Psbt({ network });
        if (!listing.buyer ||
            !listing.buyer.buyerAddress ||
            !listing.buyer.buyerTokenReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError('Buyer address is not set');
        }
        if (listing.buyer.buyerDummyUTXOs?.length !== 2 ||
            !listing.buyer.buyerPaymentUTXOs) {
            throw new interfaces_1.InvalidArgumentError('Buyer address has not enough utxos');
        }
        let totalInput = 0;
        const inputAddresses = [];
        const outputAddresses = [];
        // Add two dummyUtxos
        for (const dummyUtxo of listing.buyer.buyerDummyUTXOs) {
            const input = {
                hash: dummyUtxo.txid,
                index: dummyUtxo.vout,
                nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
            };
            const p2shInputRedeemScript = {};
            const p2shInputWitnessUTXO = {};
            if ((0, util_1.isP2SHAddress)(listing.buyer.buyerAddress, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(listing.buyer.buyerPublicKey, 'hex'),
                }).output;
                const p2sh = bitcoin.payments.p2sh({
                    redeem: { output: redeemScript },
                });
                p2shInputWitnessUTXO.witnessUtxo = {
                    script: p2sh.output,
                    value: dummyUtxo.value,
                };
                p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
            }
            psbt.addInput({
                ...input,
                ...p2shInputWitnessUTXO,
                ...p2shInputRedeemScript,
            });
            totalInput += dummyUtxo.value;
            inputAddresses.push(listing.buyer.buyerAddress);
        }
        // Add dummy output
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: listing.buyer.buyerDummyUTXOs[0].value +
                listing.buyer.buyerDummyUTXOs[1].value,
            // Number(listing.seller.ordItem.location.split(':')[2]), // this is sat location, but we use the dummy utxo value instead to leave selling utxo in tact.
        });
        outputAddresses.push(listing.buyer.buyerAddress);
        // Add ordinal output
        psbt.addOutput({
            address: listing.buyer.buyerTokenReceiveAddress,
            value: listing.seller.ordItem.outputValue, // this should be the same value as original seller's utxo value instead of generic postage value
        });
        outputAddresses.push(listing.buyer.buyerTokenReceiveAddress);
        const { sellerInput, sellerOutput } = await getSellerInputAndOutput(listing);
        psbt.addInput(sellerInput);
        inputAddresses.push(listing.seller.sellerOrdAddress);
        psbt.addOutput(sellerOutput);
        outputAddresses.push(listing.seller.sellerReceiveAddress);
        // Add payment utxo inputs
        for (const utxo of listing.buyer.buyerPaymentUTXOs) {
            const input = {
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: utxo.tx.toBuffer(),
            };
            const p2shInputWitnessUTXOUn = {};
            const p2shInputRedeemScriptUn = {};
            if ((0, util_1.isP2SHAddress)(listing.buyer.buyerAddress, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(listing.buyer.buyerPublicKey, 'hex'),
                }).output;
                const p2sh = bitcoin.payments.p2sh({
                    redeem: { output: redeemScript },
                });
                p2shInputWitnessUTXOUn.witnessUtxo = {
                    script: p2sh.output,
                    value: utxo.value,
                };
                p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
            }
            psbt.addInput({
                ...input,
                ...p2shInputWitnessUTXOUn,
                ...p2shInputRedeemScriptUn,
            });
            totalInput += utxo.value;
            inputAddresses.push(listing.buyer.buyerAddress);
        }
        // Create a platform fee output
        let platformFeeValue = Math.floor((listing.seller.price *
            (listing.buyer.takerFeeBp + listing.seller.makerFeeBp)) /
            100);
        platformFeeValue =
            platformFeeValue > constant_1.DUMMY_UTXO_MIN_VALUE ? platformFeeValue : 0; // platform fee should be at least DUMMY_UTXO_MIN_VALUE or free
        if (platformFeeValue > 0) {
            psbt.addOutput({
                address: PLATFORM_FEE_ADDRESS,
                value: platformFeeValue,
            });
            outputAddresses.push(PLATFORM_FEE_ADDRESS);
        }
        // Create two new dummy utxo output for the next purchase
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        outputAddresses.push(listing.buyer.buyerAddress);
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        outputAddresses.push(listing.buyer.buyerAddress);
        const fee0 = await (0, feeprovider_1.calculateTxBytesFee)(psbt.txInputs.length, psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
        listing.buyer.feeRateTier);
        const fee = await (0, feeprovider_1.calculateOptimalTxFeeWithAddresses)(inputAddresses, outputAddresses, 1, listing.buyer.buyerAddress);
        console.log(`Initial fee estimate: ${fee0}, optimal fee estimate: ${fee}`);
        const totalOutput = psbt.txOutputs.reduce((partialSum, a) => partialSum + a.value, 0);
        const changeValue = totalInput - totalOutput - fee;
        console.log(`Total input: ${totalInput}, total output: ${totalOutput}, fee: ${fee}, change: ${changeValue}`);
        if (changeValue < 0) {
            throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:      ${(0, util_1.satToBtc)(listing.seller.price)} BTC
Required:   ${(0, util_1.satToBtc)(totalOutput + fee)} BTC
Missing:    ${(0, util_1.satToBtc)(-changeValue)} BTC`;
        }
        // Change utxo
        if (changeValue >= 330) {
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
    BuyerSigner.generateUnsignedBuyingPSBTBase64 = generateUnsignedBuyingPSBTBase64;
    // Buying multiple listings
    /**
     * Generates an unsigned PSBT for buying multiple ordinal items.
     * @param listings The array of listing states containing buyer and seller information.
     * @param PLATFORM_FEE_ADDRESS The address to send platform fees to.
     * @param customOpReturnText Optional custom text to include in the OP_RETURN output.
     * @returns An object containing the unsigned PSBT base64 string and input size.
     */
    async function generateUnsignedBatchBuyingPSBTBase64(listings, PLATFORM_FEE_ADDRESS, customOpReturnText) {
        if (listings.length < 2) {
            throw new interfaces_1.InvalidArgumentError('At least two listings are required');
        }
        // use first listing's buyer address and dummy utxos because they are the same for all listings
        const buyer = listings[0].buyer;
        if (!buyer || !buyer.buyerAddress || !buyer.buyerTokenReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError('Buyer address is not set');
        }
        // check if buyer can afford to buy multiple listings
        if (!buyer.buyerPaymentUTXOs || buyer.buyerPaymentUTXOs.length === 0) {
            throw new interfaces_1.InvalidArgumentError('Buyer address has no payment utxos');
        }
        let buyerPaymentTotal = 0;
        for (const buyerUtxo of buyer.buyerPaymentUTXOs) {
            buyerPaymentTotal += buyerUtxo.value;
        }
        const totalPrice = listings.reduce((sum, listing) => sum + listing.seller.price, 0);
        if (buyerPaymentTotal < totalPrice) {
            throw new interfaces_1.InvalidArgumentError(`Your wallet address doesn't have enough funds to buy these inscriptions. 
Price:      ${(0, util_1.satToBtc)(totalPrice)} BTC
Required:   ${(0, util_1.satToBtc)(buyerPaymentTotal)} BTC
Missing:    ${(0, util_1.satToBtc)(buyerPaymentTotal - totalPrice)} BTC
        `);
        }
        // 1 + len(listings) dummy utxos are required for buyer to safely purchase multiple listings
        const requiredDummyUTXOs = 1 + listings.length;
        if (buyer?.buyerDummyUTXOs?.length !== requiredDummyUTXOs) {
            throw new interfaces_1.InvalidArgumentError('Buyer address has not enough safe utxos');
        }
        const psbt = new bitcoin.Psbt({ network });
        let totalInput = 0;
        const inputAddresses = [];
        const outputAddresses = [];
        // Add inputs 0 to n:  1 + len(listings) dummyUtxos as inputs
        for (const dummyUtxo of buyer.buyerDummyUTXOs) {
            const input = {
                hash: dummyUtxo.txid,
                index: dummyUtxo.vout,
                nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
            };
            const p2shInputRedeemScript = {};
            const p2shInputWitnessUTXO = {};
            if ((0, util_1.isP2SHAddress)(buyer.buyerAddress, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(buyer.buyerPublicKey, 'hex'),
                }).output;
                const p2sh = bitcoin.payments.p2sh({
                    redeem: { output: redeemScript },
                });
                p2shInputWitnessUTXO.witnessUtxo = {
                    script: p2sh.output,
                    value: dummyUtxo.value,
                };
                p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
            }
            if (psbt.data.inputs.length < requiredDummyUTXOs) {
                psbt.addInput({
                    ...input,
                    ...p2shInputWitnessUTXO,
                    ...p2shInputRedeemScript,
                });
                totalInput += dummyUtxo.value;
                inputAddresses.push(buyer.buyerAddress);
            }
        }
        // Add output 0, sum of dummy utxos for safe purchase
        psbt.addOutput({
            address: buyer.buyerAddress,
            value: constant_1.DUMMY_UTXO_MIN_VALUE * requiredDummyUTXOs, // 1 + len(listings) dummy utxos
        });
        outputAddresses.push(buyer.buyerAddress);
        for (const listing of listings) {
            // Add ordinal output
            psbt.addOutput({
                address: buyer.buyerTokenReceiveAddress,
                value: listing.seller.ordItem.outputValue, // this should be the same value as original seller's utxo value instead of generic postage value
            });
            outputAddresses.push(buyer.buyerTokenReceiveAddress);
        }
        for (const listing of listings) {
            const { sellerInput, sellerOutput } = await getSellerInputAndOutput(listing);
            psbt.addInput(sellerInput);
            psbt.addOutput(sellerOutput);
            inputAddresses.push(listing.seller.sellerOrdAddress);
            outputAddresses.push(listing.seller.sellerReceiveAddress);
        }
        // Add payment utxo inputs
        for (const utxo of buyer.buyerPaymentUTXOs) {
            const input = {
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: utxo.tx.toBuffer(),
            };
            const p2shInputWitnessUTXOUn = {};
            const p2shInputRedeemScriptUn = {};
            if ((0, util_1.isP2SHAddress)(buyer.buyerAddress, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(buyer.buyerPublicKey, 'hex'),
                }).output;
                const p2sh = bitcoin.payments.p2sh({
                    redeem: { output: redeemScript },
                });
                p2shInputWitnessUTXOUn.witnessUtxo = {
                    script: p2sh.output,
                    value: utxo.value,
                };
                p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
            }
            psbt.addInput({
                ...input,
                ...p2shInputWitnessUTXOUn,
                ...p2shInputRedeemScriptUn,
            });
            totalInput += utxo.value;
            inputAddresses.push(buyer.buyerAddress);
        }
        // Create a platform fee output
        let platformFeeValue = 0;
        for (const listing of listings) {
            platformFeeValue +=
                Math.floor((listing.seller.price * (1 + listing.seller.makerFeeBp)) / 100) || 0;
        }
        // platform fee should be at least DUMMY_UTXO_MIN_VALUE or free
        if (platformFeeValue > constant_1.DUMMY_UTXO_MIN_VALUE) {
            psbt.addOutput({
                address: PLATFORM_FEE_ADDRESS,
                value: platformFeeValue,
            });
            outputAddresses.push(PLATFORM_FEE_ADDRESS);
        }
        // Create two new dummy utxo output for the next purchase
        for (let i = 0; i < requiredDummyUTXOs; i++) {
            psbt.addOutput({
                address: buyer.buyerAddress,
                value: constant_1.DUMMY_UTXO_VALUE,
            });
            outputAddresses.push(buyer.buyerAddress);
        }
        const fee = await (0, feeprovider_1.calculateTxBytesFee)(psbt.txInputs.length, psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
        buyer.feeRateTier);
        const totalOutput = psbt.txOutputs.reduce((partialSum, a) => partialSum + a.value, 0);
        const changeValue = totalInput - totalOutput - fee;
        if (changeValue < 0) {
            throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:      ${(0, util_1.satToBtc)(totalPrice)} BTC
Required:   ${(0, util_1.satToBtc)(totalOutput + fee)} BTC
Missing:    ${(0, util_1.satToBtc)(-changeValue)} BTC`;
        }
        // Change utxo
        if (changeValue > constant_1.DUMMY_UTXO_MIN_VALUE) {
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
    BuyerSigner.generateUnsignedBatchBuyingPSBTBase64 = generateUnsignedBatchBuyingPSBTBase64;
    /**
     * Merges the signed listing PSBT with the signed buying PSBT.
     * @param signedListingPSBTBase64 The base64 encoded signed listing PSBT.
     * @param signedBuyingPSBTBase64 The base64 encoded signed buying PSBT.
     * @returns The merged PSBT as a base64 encoded string.
     */
    function mergeSignedBuyingPSBTBase64(signedListingPSBTBase64, signedBuyingPSBTBase64) {
        const sellerSignedPsbt = bitcoin.Psbt.fromBase64(signedListingPSBTBase64);
        const buyerSignedPsbt = bitcoin.Psbt.fromBase64(signedBuyingPSBTBase64);
        buyerSignedPsbt.data.globalMap.unsignedTx.tx.ins[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX] = sellerSignedPsbt.data.globalMap.unsignedTx.tx.ins[0];
        buyerSignedPsbt.data.inputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX] =
            sellerSignedPsbt.data.inputs[0];
        return buyerSignedPsbt.toBase64();
    }
    BuyerSigner.mergeSignedBuyingPSBTBase64 = mergeSignedBuyingPSBTBase64;
    /**
     * Generates an unsigned PSBT for creating dummy UTXOs.
     * @param address The address to send the dummy UTXOs to.
     * @param buyerPublicKey The public key of the buyer.
     * @param unqualifiedUtxos The unqualified UTXOs available for use.
     * @param feeRateTier The fee rate tier to use for the transaction.
     * @returns The base64 encoded unsigned PSBT.
     */
    async function generateUnsignedCreateDummyUtxoPSBTBase64(address, buyerPublicKey, unqualifiedUtxos, feeRateTier) {
        const psbt = new bitcoin.Psbt({ network });
        const [mappedUnqualifiedUtxos, recommendedFee] = await Promise.all([
            (0, util_1.mapUtxos)(unqualifiedUtxos),
            (0, mempool_1.getFees)(feeRateTier),
        ]);
        // Loop the unqualified utxos until we have enough to create a dummy utxo
        let totalValue = 0;
        let paymentUtxoCount = 0;
        for (const utxo of mappedUnqualifiedUtxos) {
            //// TODO: check inscription AND rare sats
            // if (await doesUtxoContainInscriptionOrRareSats(utxo, itemProvider)) {
            //   continue;
            // }
            const input = {
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: utxo.tx.toBuffer(),
            };
            if ((0, util_1.isP2SHAddress)(address, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(buyerPublicKey, 'hex'),
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
            const fees = (0, feeprovider_1.calculateTxBytesFeeWithRate)(paymentUtxoCount, 2, // 2-dummy outputs
            recommendedFee);
            if (totalValue >= constant_1.DUMMY_UTXO_VALUE * 2 + fees) {
                break;
            }
        }
        const finalFees = (0, feeprovider_1.calculateTxBytesFeeWithRate)(paymentUtxoCount, 2, // 2-dummy outputs
        recommendedFee);
        const changeValue = totalValue - constant_1.DUMMY_UTXO_VALUE * 2 - finalFees;
        // We must have enough value to create a dummy utxo and pay for tx fees
        if (changeValue < 0) {
            throw new interfaces_1.InvalidArgumentError(`You might have pending transactions or not enough fund`);
        }
        psbt.addOutput({
            address,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        psbt.addOutput({
            address,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        // to avoid dust
        if (changeValue > constant_1.DUMMY_UTXO_MIN_VALUE) {
            psbt.addOutput({
                address,
                value: changeValue,
            });
        }
        return psbt.toBase64();
    }
    BuyerSigner.generateUnsignedCreateDummyUtxoPSBTBase64 = generateUnsignedCreateDummyUtxoPSBTBase64;
    /**
     * Generates an unsigned PSBT for creating dummy UTXOs.
     * @param address The address to send the dummy UTXOs to.
     * @param buyerPublicKey The public key of the buyer.
     * @param unqualifiedUtxos The unqualified UTXOs available for use.
     * @param feeRateTier The fee rate tier to use for the transaction.
     * @returns The base64 encoded unsigned PSBT.
     */
    async function generateUnsignedDummiesUtxoPSBTBase64(address, buyerPublicKey, unqualifiedUtxos, feeRateTier, numberOfDummies = 8, customOpReturnText) {
        const psbt = new bitcoin.Psbt({ network });
        const [mappedUnqualifiedUtxos, recommendedFee] = await Promise.all([
            (0, util_1.mapUtxos)(unqualifiedUtxos),
            (0, mempool_1.getFees)(feeRateTier),
        ]);
        // Loop the unqualified utxos until we have enough to create a dummy utxo
        let totalValue = 0;
        let paymentUtxoCount = 0;
        for (const utxo of mappedUnqualifiedUtxos) {
            const input = {
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: utxo.tx.toBuffer(),
            };
            if ((0, util_1.isP2SHAddress)(address, network)) {
                const redeemScript = bitcoin.payments.p2wpkh({
                    pubkey: Buffer.from(buyerPublicKey, 'hex'),
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
            const fees = (0, feeprovider_1.calculateTxBytesFeeWithRate)(paymentUtxoCount, numberOfDummies, recommendedFee);
            if (totalValue >= constant_1.DUMMY_UTXO_VALUE * numberOfDummies + fees) {
                break;
            }
        }
        const finalFees = (0, feeprovider_1.calculateTxBytesFeeWithRate)(paymentUtxoCount, numberOfDummies, recommendedFee);
        const changeValue = totalValue - constant_1.DUMMY_UTXO_VALUE * numberOfDummies - finalFees;
        // We must have enough value to create a dummy utxo and pay for tx fees
        if (changeValue < 0) {
            throw new interfaces_1.InvalidArgumentError(`You might have pending transactions or not enough fund`);
        }
        for (let i = 0; i < numberOfDummies; i++) {
            psbt.addOutput({
                address,
                value: constant_1.DUMMY_UTXO_VALUE,
            });
        }
        // to avoid dust
        if (changeValue > constant_1.DUMMY_UTXO_MIN_VALUE) {
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
    BuyerSigner.generateUnsignedDummiesUtxoPSBTBase64 = generateUnsignedDummiesUtxoPSBTBase64;
})(BuyerSigner = exports.BuyerSigner || (exports.BuyerSigner = {}));
//# sourceMappingURL=signer.js.map