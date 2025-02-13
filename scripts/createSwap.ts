// scripts/createSwap.ts
import { toNano, Address } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { NetworkProvider } from '@ton/blueprint';
import { generatePreimage, calculateHashLock } from './utils/hashHelper';
import fs from 'fs';

export async function run(provider: NetworkProvider) {
  // Replace with your deployed Fluida contract address
  const fluidaAddress = Address.parse('EQBuH-HaipDBM4xWuDQsIOxZox6Gad9h-iho3QcF00ivJN6p');
  // Use provider.open() to attach the provider to the contract instance.
  const fluida = provider.open(new Fluida(fluidaAddress));

  // Generate preimage and calculate hashLock
  const preimage = generatePreimage();
  const hashLock = calculateHashLock(preimage);

  const filePath = 'swap-secrets.json';

  // Initialize swapSecrets as an empty array.
  let swapSecrets = [];

  // Check if the file already exists.
  if (fs.existsSync(filePath)) {
    try {
      const existingData = fs.readFileSync(filePath, 'utf8');
      // Parse the JSON. If the file content is not an array, we wrap it in an array.
      const parsedData = JSON.parse(existingData);
      swapSecrets = Array.isArray(parsedData) ? parsedData : [parsedData];
    } catch (error) {
      console.error('Error reading or parsing swap-secrets.json:', error);
    }
  }

  // Create a new swap data entry.
  const newSwapData = {
    preimage: preimage.toString(),
    hashLock: hashLock.toString(),
    timestamp: Date.now()
  };

  // Add the new entry to the array.
  swapSecrets.push(newSwapData);

  // Write the updated array back to the file.
  fs.writeFileSync(filePath, JSON.stringify(swapSecrets, null, 2));

  // Define swap parameters
  const amount = 11000n; // Example: 11000 tokens
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeLock = BigInt(currentTimestamp + 3600); // 1 hour from now

  console.log('Creating swap with:');
  console.log(`HashLock: ${hashLock}`);
  console.log(`Preimage (keep secret!): ${preimage}`);
  console.log('Secrets saved to swap-secrets.json');

  console.log('Sending createSwap transaction...');
  await fluida.sendCreateSwap(provider.sender(), {
    amount,
    hashLock,
    timeLock,
    value: toNano('0.005'),
  });
  console.log('Create swap transaction sent.');
}
