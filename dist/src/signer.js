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
const fullnoderpc_1 = require("./vendors/fullnoderpc");
const mempool_1 = require("./vendors/mempool");
const interfaces_1 = require("./interfaces");
bitcoin.initEccLib(ecc);
const network = constant_1.BTC_NETWORK === 'mainnet'
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
var SellerSigner;
(function (SellerSigner) {
    async function generateUnsignedListingPSBTBase64(listing) {
        const psbt = new bitcoin.Psbt({ network });
        const [ordinalUtxoTxId, ordinalUtxoVout] = listing.seller.ordItem.output.split(':');
        const tx = bitcoin.Transaction.fromHex(await fullnoderpc_1.FullnodeRPC.getrawtransaction(listing.seller.ordItem.output.split(':')[0]));
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
            nonWitnessUtxo: tx.toBuffer(),
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
        const sellerOutput = (0, feeprovider_1.getSellerOrdOutputValue)(listing.seller.price, listing.seller.makerFeeBp, listing.seller.ordItem.outputValue);
        psbt.addOutput({
            address: listing.seller.sellerReceiveAddress,
            value: sellerOutput,
        });
        listing.seller.unsignedListingPSBTBase64 = psbt.toBase64();
        return listing;
    }
    SellerSigner.generateUnsignedListingPSBTBase64 = generateUnsignedListingPSBTBase64;
    async function verifySignedListingPSBTBase64(req, feeProvider, itemProvider) {
        const psbt = bitcoin.Psbt.fromBase64(req.signedListingPSBTBase64, {
            network,
        });
        // Verify that the seller has signed the PSBT if Ordinal is held on a taproot and tapInternalKey is present
        psbt.data.inputs.forEach((input) => {
            if (input.tapInternalKey) {
                const finalScriptWitness = input.finalScriptWitness;
                if (finalScriptWitness && finalScriptWitness.length > 0) {
                    // Validate that the finalScriptWitness is not empty (and not just the initial value, without the tapKeySig)
                    if (finalScriptWitness.toString('hex') === '0141') {
                        throw new interfaces_1.InvalidArgumentError(`Invalid signature - no taproot signature present on the finalScriptWitness`);
                    }
                }
                else {
                    throw new interfaces_1.InvalidArgumentError(`Invalid signature - no finalScriptWitness`);
                }
            }
        });
        // verify signatures valid, so that the psbt is signed by the item owner
        if ((await fullnoderpc_1.FullnodeRPC.analyzepsbt(req.signedListingPSBTBase64))?.inputs[0]
            ?.is_final !== true) {
            throw new interfaces_1.InvalidArgumentError(`Invalid signature`);
        }
        // verify that the input's sellerOrdAddress is the same as the sellerOrdAddress of the utxo
        if (psbt.inputCount !== 1) {
            throw new interfaces_1.InvalidArgumentError(`Invalid number of inputs`);
        }
        const utxoOutput = (0, util_1.generateTxidFromHash)(psbt.txInputs[0].hash) +
            ':' +
            psbt.txInputs[0].index;
        // verify that the ordItem is the same as the seller wants
        const ordItem = await itemProvider.getTokenByOutput(utxoOutput);
        if (ordItem?.id !== req.tokenId) {
            throw new interfaces_1.InvalidArgumentError(`Invalid tokenId`);
        }
        // verify that the ordItem's selling price matches the output value with makerFeeBp
        const output = psbt.txOutputs[0];
        const expectedOutput = (0, feeprovider_1.getSellerOrdOutputValue)(req.price, await feeProvider.getMakerFeeBp(ordItem.owner), ordItem.outputValue);
        if (output.value !== expectedOutput) {
            throw new interfaces_1.InvalidArgumentError(`Invalid price`);
        }
        // verify that the output address is the same as the seller's receive address
        if (output.address !== req.sellerReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError(`Invalid sellerReceiveAddress`);
        }
        // verify that the seller address is a match
        const sellerAddressFromPSBT = bitcoin.address.fromOutputScript(bitcoin.Transaction.fromHex(await fullnoderpc_1.FullnodeRPC.getrawtransaction((0, util_1.generateTxidFromHash)(psbt.txInputs[0].hash))).outs[psbt.txInputs[0].index].script, network);
        if (ordItem?.owner !== sellerAddressFromPSBT) {
            throw new interfaces_1.InvalidArgumentError(`Invalid seller address`);
        }
    }
    SellerSigner.verifySignedListingPSBTBase64 = verifySignedListingPSBTBase64;
})(SellerSigner = exports.SellerSigner || (exports.SellerSigner = {}));
var BuyerSigner;
(function (BuyerSigner) {
    async function selectDummyUTXOs(utxos, itemProvider) {
        const result = [];
        for (const utxo of utxos) {
            if (await doesUtxoContainInscription(utxo, itemProvider)) {
                continue;
            }
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
    async function selectPaymentUTXOs(utxos, amount, // amount is expected total output (except tx fee)
    vinsLength, voutsLength, feeRateTier, itemProvider) {
        const selectedUtxos = [];
        let selectedAmount = 0;
        // Sort descending by value, and filter out dummy utxos
        utxos = utxos
            .filter((x) => x.value > constant_1.DUMMY_UTXO_VALUE)
            .sort((a, b) => b.value - a.value);
        for (const utxo of utxos) {
            // Never spend a utxo that contains an inscription for cardinal purposes
            if (await doesUtxoContainInscription(utxo, itemProvider)) {
                continue;
            }
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
        return selectedUtxos;
    }
    BuyerSigner.selectPaymentUTXOs = selectPaymentUTXOs;
    async function doesUtxoContainInscription(utxo, itemProvider) {
        // If it's confirmed, we check the indexing db for that output
        if (utxo.status.confirmed) {
            try {
                return ((await itemProvider.getTokenByOutput(`${utxo.txid}:${utxo.vout}`)) !==
                    null);
            }
            catch (err) {
                return true; // if error, we pretend that the utxo contains an inscription for safety
            }
        }
        // if it's not confirmed, we search the input script for the inscription
        const tx = await fullnoderpc_1.FullnodeRPC.getrawtransactionVerbose(utxo.txid);
        let foundInscription = false;
        for (const input of tx.vin) {
            if ((await fullnoderpc_1.FullnodeRPC.getrawtransactionVerbose(input.txid))
                .confirmations === 0) {
                return true; // to error on the safer side, and treat this as possible to have a inscription
            }
            const previousOutput = `${input.txid}:${input.vout}`;
            try {
                if ((await itemProvider.getTokenByOutput(previousOutput)) !== null) {
                    foundInscription = true;
                    return foundInscription;
                }
            }
            catch (err) {
                return true; // if error, we pretend that the utxo contains an inscription for safety
            }
        }
        return foundInscription;
    }
    async function getSellerInputAndOutput(listing) {
        const [ordinalUtxoTxId, ordinalUtxoVout] = listing.seller.ordItem.output.split(':');
        const tx = bitcoin.Transaction.fromHex(await fullnoderpc_1.FullnodeRPC.getrawtransaction(ordinalUtxoTxId));
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
            nonWitnessUtxo: tx.toBuffer(),
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
                value: (0, feeprovider_1.getSellerOrdOutputValue)(listing.seller.price, listing.seller.makerFeeBp, listing.seller.ordItem.outputValue),
            },
        };
        return ret;
    }
    async function generateUnsignedBuyingPSBTBase64(listing) {
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
        }
        // Add dummy output
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: listing.buyer.buyerDummyUTXOs[0].value +
                listing.buyer.buyerDummyUTXOs[1].value +
                Number(listing.seller.ordItem.location.split(':')[2]),
        });
        // Add ordinal output
        psbt.addOutput({
            address: listing.buyer.buyerTokenReceiveAddress,
            value: constant_1.ORDINALS_POSTAGE_VALUE,
        });
        const { sellerInput, sellerOutput } = await getSellerInputAndOutput(listing);
        psbt.addInput(sellerInput);
        psbt.addOutput(sellerOutput);
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
        }
        // Create a platform fee output
        let platformFeeValue = Math.floor((listing.seller.price *
            (listing.buyer.takerFeeBp + listing.seller.makerFeeBp)) /
            10000);
        platformFeeValue =
            platformFeeValue > constant_1.DUMMY_UTXO_MIN_VALUE ? platformFeeValue : 0;
        if (platformFeeValue > 0) {
            psbt.addOutput({
                address: constant_1.PLATFORM_FEE_ADDRESS,
                value: platformFeeValue,
            });
        }
        // Create two new dummy utxo output for the next purchase
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        psbt.addOutput({
            address: listing.buyer.buyerAddress,
            value: constant_1.DUMMY_UTXO_VALUE,
        });
        const fee = await (0, feeprovider_1.calculateTxBytesFee)(psbt.txInputs.length, psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
        listing.buyer.feeRateTier);
        const totalOutput = psbt.txOutputs.reduce((partialSum, a) => partialSum + a.value, 0);
        const changeValue = totalInput - totalOutput - fee;
        if (changeValue < 0) {
            throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:      ${(0, util_1.satToBtc)(listing.seller.price)} BTC
Required:   ${(0, util_1.satToBtc)(totalOutput + fee)} BTC
Missing:    ${(0, util_1.satToBtc)(-changeValue)} BTC`;
        }
        // Change utxo
        if (changeValue > constant_1.DUMMY_UTXO_MIN_VALUE) {
            psbt.addOutput({
                address: listing.buyer.buyerAddress,
                value: changeValue,
            });
        }
        listing.buyer.unsignedBuyingPSBTBase64 = psbt.toBase64();
        listing.buyer.unsignedBuyingPSBTInputSize = psbt.data.inputs.length;
        return listing;
    }
    BuyerSigner.generateUnsignedBuyingPSBTBase64 = generateUnsignedBuyingPSBTBase64;
    function mergeSignedBuyingPSBTBase64(signedListingPSBTBase64, signedBuyingPSBTBase64) {
        const sellerSignedPsbt = bitcoin.Psbt.fromBase64(signedListingPSBTBase64);
        const buyerSignedPsbt = bitcoin.Psbt.fromBase64(signedBuyingPSBTBase64);
        buyerSignedPsbt.data.globalMap.unsignedTx.tx.ins[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX] = sellerSignedPsbt.data.globalMap.unsignedTx.tx.ins[0];
        buyerSignedPsbt.data.inputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX] =
            sellerSignedPsbt.data.inputs[0];
        return buyerSignedPsbt.toBase64();
    }
    BuyerSigner.mergeSignedBuyingPSBTBase64 = mergeSignedBuyingPSBTBase64;
    function verifyDummyUTXOAndGetValue(psbt, index) {
        const dummyUtxoInput = psbt.data.inputs[index];
        if (dummyUtxoInput.witnessUtxo) {
            return dummyUtxoInput.witnessUtxo.value;
        }
        else if (dummyUtxoInput.nonWitnessUtxo) {
            // utxo can be a nonWitness if it is legacy
            const dummyUtxo = bitcoin.Transaction.fromBuffer(dummyUtxoInput.nonWitnessUtxo);
            const dummyOutIndex = psbt.txInputs[index].index;
            return dummyUtxo.outs[dummyOutIndex].value;
        }
        else {
            throw new interfaces_1.InvalidArgumentError(`Empty nonWitnessUtxo or witnessUtxo`);
        }
    }
    async function verifySignedBuyingPSBTBase64(req, feeProvider, itemProvider) {
        const psbt = bitcoin.Psbt.fromBase64(req.signedBuyingPSBTBase64, {
            network,
        });
        // verify all the signatures are valid from the buyer except the seller input
        const analyzepsbtInputs = (await fullnoderpc_1.FullnodeRPC.analyzepsbt(req.signedBuyingPSBTBase64)).inputs;
        for (let i = 0; i < analyzepsbtInputs.length; i++) {
            if (i !== constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX &&
                analyzepsbtInputs[i].is_final !== true) {
                throw new interfaces_1.InvalidArgumentError('Invalid signature');
            }
            if (!analyzepsbtInputs[i].has_utxo) {
                throw new interfaces_1.InvalidArgumentError('Missing utxo');
            }
        }
        // verify that we are paying to the correct buyerTokenReceiveAddress
        const buyerTokenReceiveAddress = psbt.txOutputs[constant_1.BUYING_PSBT_BUYER_RECEIVE_INDEX].address;
        if (buyerTokenReceiveAddress !== req.buyerTokenReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError('buyerTokenReceiveAddress mismatch');
        }
        // verify the ordItem is still owned by the seller and the buyer is buying the right item
        const ordCurrentOutput = (0, util_1.generateTxidFromHash)(psbt.txInputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX].hash) +
            ':' +
            psbt.txInputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX].index;
        // verify that the ordItem is the same as the seller wants
        const ordItemFromSignedBuyingPSBT = await itemProvider.getTokenByOutput(ordCurrentOutput);
        const ordItemFromReq = await itemProvider.getTokenById(req.tokenId);
        if (!ordItemFromSignedBuyingPSBT || !ordItemFromReq) {
            throw new interfaces_1.InvalidArgumentError('ordItem not found from psbt or req');
        }
        if (ordItemFromReq.location !== ordItemFromSignedBuyingPSBT.location) {
            throw new interfaces_1.InvalidArgumentError('ordItem location mismatch');
        }
        // verify the seller is getting paid the correct amount
        const priceSetByBuyerPSBT = psbt.txOutputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX].value;
        if (!ordItemFromReq?.listedPrice) {
            throw new interfaces_1.InvalidArgumentError('Invalid ordItem listedPrice');
        }
        if (ordItemFromReq.listedMakerFeeBp === undefined) {
            throw new interfaces_1.InvalidArgumentError('Invalid ordItem listedMakerFeeBp');
        }
        const expectedSellerReceiveValue = (0, feeprovider_1.getSellerOrdOutputValue)(ordItemFromReq.listedPrice, ordItemFromReq.listedMakerFeeBp, ordItemFromReq.outputValue);
        if (priceSetByBuyerPSBT !== expectedSellerReceiveValue) {
            throw new interfaces_1.InvalidArgumentError('Invalid ordItem listedPrice');
        }
        // verify we are paying to the correct seller receive address
        const sellerReceiveAddress = psbt.txOutputs[constant_1.BUYING_PSBT_SELLER_SIGNATURE_INDEX].address;
        if (sellerReceiveAddress !== ordItemFromReq.listedSellerReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError('Invalid seller receive address');
        }
        // verify that the buyer is getting the buyer receive token
        if (psbt.txOutputs[constant_1.BUYING_PSBT_BUYER_RECEIVE_INDEX].value !==
            constant_1.ORDINALS_POSTAGE_VALUE) {
            throw new interfaces_1.InvalidArgumentError('Invalid buyer token receive output postage value');
        }
        if (psbt.txOutputs[constant_1.BUYING_PSBT_BUYER_RECEIVE_INDEX].address !==
            req.buyerTokenReceiveAddress) {
            throw new interfaces_1.InvalidArgumentError('Invalid buyer token receive address');
        }
        // verify the the platform is getting paid maker and taker fees
        const platformFeeValueExpected = Math.floor((ordItemFromReq.listedPrice *
            (ordItemFromReq.listedMakerFeeBp +
                (await feeProvider.getTakerFeeBp(req.buyerAddress)))) /
            10000);
        if (platformFeeValueExpected > constant_1.DUMMY_UTXO_MIN_VALUE) {
            const platformFeeValue = psbt.txOutputs[constant_1.BUYING_PSBT_PLATFORM_FEE_INDEX].value;
            if (platformFeeValue !== platformFeeValueExpected) {
                throw new interfaces_1.InvalidArgumentError(`Invalid platform fee, expect ${platformFeeValueExpected}, but got ${platformFeeValue}`);
            }
            if (psbt.txOutputs[constant_1.BUYING_PSBT_PLATFORM_FEE_INDEX].address !==
                constant_1.PLATFORM_FEE_ADDRESS) {
                throw new interfaces_1.InvalidArgumentError('Invalid platform fee address');
            }
        }
        return {
            newOutputOffset: 0, // based on 2-dummy algo, the new outputOffset is 0
        };
    }
    BuyerSigner.verifySignedBuyingPSBTBase64 = verifySignedBuyingPSBTBase64;
    async function generateUnsignedCreateDummyUtxoPSBTBase64(address, buyerPublicKey, unqualifiedUtxos, feeRateTier, itemProvider) {
        const psbt = new bitcoin.Psbt({ network });
        const [mappedUnqualifiedUtxos, recommendedFee] = await Promise.all([
            (0, util_1.mapUtxos)(unqualifiedUtxos),
            (0, mempool_1.getFees)(feeRateTier),
        ]);
        // Loop the unqualified utxos until we have enough to create a dummy utxo
        let totalValue = 0;
        let paymentUtxoCount = 0;
        for (const utxo of mappedUnqualifiedUtxos) {
            if (await doesUtxoContainInscription(utxo, itemProvider)) {
                continue;
            }
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
})(BuyerSigner = exports.BuyerSigner || (exports.BuyerSigner = {}));
//# sourceMappingURL=signer.js.map