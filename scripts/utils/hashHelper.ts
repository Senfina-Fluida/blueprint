import { beginCell } from '@ton/core';
import crypto from 'crypto';

export function generatePreimage(): bigint {
    // Generate 32 random bytes
    const randomBytes = crypto.randomBytes(32);
    // Convert to BigInt
    return BigInt('0x' + randomBytes.toString('hex'));
}

export function calculateHashLock(preimage: bigint): bigint {
    // Build a TON cell exactly as done on-chain:
    // Store the preimage as a 256-bit unsigned integer and then hash that cell.
    const cell = beginCell().storeUint(preimage, 256).endCell();
    const hashBuffer = cell.hash(); // This computes the TON cell's hash
    return BigInt('0x' + hashBuffer.toString('hex'));
} 