"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerOrdOutputValue = exports.calculateTxBytesFeeWithRate = exports.calculateTxBytesFee = void 0;
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
//# sourceMappingURL=feeprovider.js.map