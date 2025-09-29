import { getFees } from './mempool';

export async function calculateTxBytesFee(
  vinsLength: number,
  voutsLength: number,
  feeRateTier: string,
  includeChangeOutput: 0 | 1 = 1,
) {
  const recommendedFeeRate = await getFees(feeRateTier);
  return calculateTxBytesFeeWithRate(
    vinsLength,
    voutsLength,
    recommendedFeeRate,
    includeChangeOutput,
  );
}

export function calculateTxBytesFeeWithRate(
  vinsLength: number,
  voutsLength: number,
  feeRate: number,
  includeChangeOutput: 0 | 1 = 1,
): number {
  const baseTxSize = 10;
  const inSize = 180;
  const outSize = 34;

  const txSize =
    baseTxSize +
    vinsLength * inSize +
    voutsLength * outSize +
    includeChangeOutput * outSize;
  const fee = txSize * feeRate;
  return fee;
}

export function getSellerOrdOutputValue(
  price: number,
  makerFeeBp: number): number {
    const fee = Math.ceil((price * makerFeeBp) / 100);
  return (
    Math.floor(price - fee) // output value is price minus fee
  );
}

// Address type enum for clarity
enum AddressType {
  P2TR = 'P2TR',         // Taproot (bc1p...)
  P2WPKH = 'P2WPKH',     // Native SegWit (bc1q...)
  P2PKH = 'P2PKH',       // Legacy (1...)
  P2SH = 'P2SH',         // Legacy multisig or wrapped SegWit (3...)
  UNKNOWN = 'UNKNOWN',
}

// Function to identify address type
function getAddressType(address: string): AddressType {
  if (!address) return AddressType.UNKNOWN;
  address = address.toLowerCase();
  if (address.startsWith('bc1p') && address.length === 62) return AddressType.P2TR;
  if (address.startsWith('bc1q') && address.length === 42) return AddressType.P2WPKH;
  if (address.startsWith('1') && address.length >= 26 && address.length <= 34) return AddressType.P2PKH;
  if (address.startsWith('3') && address.length >= 26 && address.length <= 34) return AddressType.P2SH;
  return AddressType.UNKNOWN;
}

// Virtual sizes (vbytes) for different address types
const sizes = {
  [AddressType.P2TR]: { inVsize: 57.5, outVsize: 43 },     // Taproot: Schnorr sig, 32-byte key
  [AddressType.P2WPKH]: { inVsize: 68, outVsize: 31 },     // Native SegWit: ECDSA, 20-byte hash
  [AddressType.P2PKH]: { inVsize: 148, outVsize: 34 },     // Legacy: Full bytes, no witness discount
  [AddressType.P2SH]: { inVsize: 91, outVsize: 32 },       // P2SH: Conservative estimate (varies by script)
  [AddressType.UNKNOWN]: { inVsize: 148, outVsize: 34 },   // Default to legacy for safety
};

// Main fee calculation function
export async function calculateOptimalTxFeeWithAddresses(
  inputAddresses: string[],           // Addresses of UTXOs being spent
  outputAddresses: string[],         // Non-change output addresses
  includeChangeOutput: 0 | 1 = 1,    // Whether to include a change output
  changeAddress: string = '',        // Change address (optional, defaults to first input's type)
  customFeeRate?: number,            // Optional: Provide fee rate; otherwise, fetch dynamically
  opReturnText?: string,          // Optional: OP_RETURN data (not currently factored in)
): Promise<number> {
  const baseOverhead = 10.5;  // Version, counts, locktime (vbytes)
  const segwitOverhead = inputAddresses.some(addr => 
    [AddressType.P2TR, AddressType.P2WPKH].includes(getAddressType(addr))) ? 0.5 : 0; // SegWit marker/flag

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

// Placeholder for fetching real-time fee rate (sat/vbyte)
async function getFeeRate(): Promise<number> {
  try {
    const response = await fetch('https://mempool.space/api/v1/fees/recommended');
    const data = await response.json();
    return data.economyFee;
  } catch (error) {
    console.warn('Failed to fetch fee rate, using fallback: 1 sat/vbyte', error);
    return 1; // Fallback for current uncongested network
  }
}
