"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOptimalTxFeeWithAddresses = exports.getSellerOrdOutputValue = exports.calculateTxBytesFeeWithRate = exports.calculateTxBytesFee = void 0;
const mempool_1 = require("./mempool");
async function calculateTxBytesFee(vinsLength, voutsLength, feeRateTier, includeChangeOutput = 1) {
    const recommendedFeeRate = await (0, mempool_1.getFees)(feeRateTier);
    return calculateTxBytesFeeWithRate(vinsLength, voutsLength, recommendedFeeRate, includeChangeOutput);
}
exports.calculateTxBytesFee = calculateTxBytesFee;
function calculateTxBytesFeeWithRate(vinsLength, voutsLength, feeRate, includeChangeOutput = 1) {
    const baseTxSize = 10;
    const inSize = 180;
    const outSize = 34;
    const txSize = baseTxSize +
        vinsLength * inSize +
        voutsLength * outSize +
        includeChangeOutput * outSize;
    const fee = txSize * feeRate;
    return fee;
}
exports.calculateTxBytesFeeWithRate = calculateTxBytesFeeWithRate;
function getSellerOrdOutputValue(price, makerFeeBp) {
    const fee = Math.ceil((price * makerFeeBp) / 100);
    return (Math.floor(price - fee) // output value is price minus fee
    );
}
exports.getSellerOrdOutputValue = getSellerOrdOutputValue;
// Address type enum for clarity
var AddressType;
(function (AddressType) {
    AddressType["P2TR"] = "P2TR";
    AddressType["P2WPKH"] = "P2WPKH";
    AddressType["P2PKH"] = "P2PKH";
    AddressType["P2SH"] = "P2SH";
    AddressType["UNKNOWN"] = "UNKNOWN";
})(AddressType || (AddressType = {}));
// Function to identify address type
function getAddressType(address) {
    if (!address)
        return AddressType.UNKNOWN;
    address = address.toLowerCase();
    if (address.startsWith('bc1p') && address.length === 62)
        return AddressType.P2TR;
    if (address.startsWith('bc1q') && address.length === 42)
        return AddressType.P2WPKH;
    if (address.startsWith('1') && address.length >= 26 && address.length <= 34)
        return AddressType.P2PKH;
    if (address.startsWith('3') && address.length >= 26 && address.length <= 34)
        return AddressType.P2SH;
    return AddressType.UNKNOWN;
}
// Virtual sizes (vbytes) for different address types
const sizes = {
    [AddressType.P2TR]: { inVsize: 57.5, outVsize: 43 },
    [AddressType.P2WPKH]: { inVsize: 68, outVsize: 31 },
    [AddressType.P2PKH]: { inVsize: 148, outVsize: 34 },
    [AddressType.P2SH]: { inVsize: 91, outVsize: 32 },
    [AddressType.UNKNOWN]: { inVsize: 148, outVsize: 34 }, // Default to legacy for safety
};
// Main fee calculation function
async function calculateOptimalTxFeeWithAddresses(inputAddresses, // Addresses of UTXOs being spent
outputAddresses, // Non-change output addresses
includeChangeOutput = 1, // Whether to include a change output
changeAddress = '', // Change address (optional, defaults to first input's type)
customFeeRate, // Optional: Provide fee rate; otherwise, fetch dynamically
opReturnText) {
    const baseOverhead = 10.5; // Version, counts, locktime (vbytes)
    const segwitOverhead = inputAddresses.some(addr => [AddressType.P2TR, AddressType.P2WPKH].includes(getAddressType(addr))) ? 0.5 : 0; // SegWit marker/flag
    // Determine address types
    const inputTypes = inputAddresses.map(getAddressType);
    const outputTypes = outputAddresses.map(getAddressType);
    const changeType = includeChangeOutput ? getAddressType(changeAddress || inputAddresses[0] || '') : AddressType.UNKNOWN;
    // Validate addresses
    if (inputTypes.includes(AddressType.UNKNOWN) || outputTypes.includes(AddressType.UNKNOWN) ||
        (includeChangeOutput && changeType === AddressType.UNKNOWN)) {
        throw new Error('Invalid or unsupported address detected');
    }
    // Calculate total vbytes
    let txVsize = baseOverhead + segwitOverhead;
    for (const type of inputTypes) {
        txVsize += sizes[type].inVsize;
    }
    for (const type of outputTypes) {
        txVsize += sizes[type].outVsize;
    }
    if (includeChangeOutput) {
        txVsize += sizes[changeType].outVsize;
    }
    // TODO: Factor in OP_RETURN output size if needed (typically ~80 vbytes for 80 bytes of data)
    // Fetch fee rate dynamically if not provided
    const feeRate = customFeeRate ?? (await getFeeRate());
    // Calculate fee
    const fee = Math.ceil(txVsize * feeRate); // Round up for safety
    console.log(`vtx size: ${txVsize}, fee rate: ${feeRate} sat/vbyte`, `calculated fee: ${fee} sats`);
    return fee;
}
exports.calculateOptimalTxFeeWithAddresses = calculateOptimalTxFeeWithAddresses;
// Placeholder for fetching real-time fee rate (sat/vbyte)
async function getFeeRate() {
    try {
        const response = await fetch('https://mempool.space/api/v1/fees/recommended');
        const data = await response.json();
        return data.economyFee;
    }
    catch (error) {
        console.warn('Failed to fetch fee rate, using fallback: 1 sat/vbyte', error);
        return 1; // Fallback for current uncongested network
    }
}
//# sourceMappingURL=feeprovider.js.map