// scripts/createSwap.ts
import { toNano, Address } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
  // Replace with your deployed Fluida contract address
  const fluidaAddress = Address.parse('EQB9nLhjbcv2lbKIQMqEzMVGlYFk-be7oO8X1jb-cB5v9g8L');
  // Use provider.open() to attach the provider to the contract instance.
  const fluida = provider.open(new Fluida(fluidaAddress));

  // Define swap parameters (recipient removed, the contract uses the sender's address)
  const amount = 3000n; // Example: 1000 tokens
  // Dummy hashLock; in a real scenario, compute the hash of a secret preimage.
  const hashLock = 1234567890123456789012345678901234567890n;
  // Set a timelock 1 hour in the future
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeLock = BigInt(currentTimestamp + 3600);

  console.log('Sending createSwap transaction...');
  await fluida.sendCreateSwap(provider.sender(), {
    amount,
    hashLock,
    timeLock,
    value: toNano('0.05'),
  });
  console.log('Create swap transaction sent.');
}
