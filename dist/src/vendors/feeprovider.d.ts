export declare function calculateTxBytesFee(vinsLength: number, voutsLength: number, feeRateTier: string, includeChangeOutput?: 0 | 1): Promise<number>;
export declare function calculateTxBytesFeeWithRate(vinsLength: number, voutsLength: number, feeRate: number, includeChangeOutput?: 0 | 1): number;
export declare function getSellerOrdOutputValue(price: number, makerFeeBp: number): number;
export declare function calculateOptimalTxFeeWithAddresses(inputAddresses: string[], // Addresses of UTXOs being spent
outputAddresses: string[], // Non-change output addresses
includeChangeOutput?: 0 | 1, // Whether to include a change output
changeAddress?: string, // Change address (optional, defaults to first input's type)
customFeeRate?: number, // Optional: Provide fee rate; otherwise, fetch dynamically
opReturnText?: string): Promise<number>;
//# sourceMappingURL=feeprovider.d.ts.map