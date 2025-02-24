import { toNano, Address } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { NetworkProvider } from '@ton/blueprint';
import { calculateHashLock } from './utils/hashHelper';
import readline from 'readline';

// Helper function: prompt for user input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function run(provider: NetworkProvider) {
  // Connect to Fluida contract using its address.
  const fluidaAddress = Address.parse("EQAklm3nyaHLy49ePLVMBZwwfQd6WdQDD2Aboa8Vpw6f3e-i");

  const fluida = provider.open(new Fluida(fluidaAddress));

  // --- STEP 1: Prompt for hashLock ---
  const hashLockInput = await prompt("Enter the HashLock (as seen in readInfo) for the swap to complete: ");
  let providedHashLock: bigint;
  try {
    providedHashLock = BigInt(hashLockInput.trim());
  } catch (err) {
    console.error("Invalid hashLock input.");
    process.exit(1);
  }

  // --- STEP 2: Search for the swap with this hashLock ---
  console.log(`Searching for a swap with HashLock: ${providedHashLock}`);
  let swapCounter: bigint;
  try {
    swapCounter = await fluida.getSwapCounter();
  } catch (err) {
    console.error("Error fetching swap counter:", err);
    process.exit(1);
  }

  let targetSwapId: bigint | null = null;
  let targetSwap: any;
  for (let i = 0n; i < swapCounter; i++) {
    try {
      const swap = await fluida.getSwap(i);
      if (swap.hashLock === providedHashLock) {
        targetSwapId = i;
        targetSwap = swap;
        break;
      }
    } catch (err) {
      console.error(`Error fetching swap with id ${i}:`, err);
      // Continue searching in case of errors on a particular id
    }
  }
  if (targetSwapId === null) {
    console.error("No swap found with the provided HashLock.");
    process.exit(1);
  }
  console.log(`Found swap with ID: ${targetSwapId}`);
  console.log("Swap details:");
  console.log(`  Initiator: ${targetSwap.initiator.toString()}`);
  console.log(`  Recipient: ${targetSwap.recipient.toString()}`);
  console.log(`  Amount: ${targetSwap.amount}`);
  console.log(`  Stored HashLock: ${targetSwap.hashLock}`);
  console.log(`  TimeLock: ${targetSwap.timeLock}`);
  console.log(`  Completed: ${targetSwap.isCompleted}`);

  // --- STEP 3: Prompt for the preimage ---
  const preimageInput = await prompt("Enter the preimage to complete the swap (in hex or decimal): ");
  let preimage: bigint;
  try {
    let inputStr = preimageInput.trim();
    // If the input doesn't start with "0x", assume it's hex and add the prefix.
    if (!inputStr.startsWith("0x")) {
      inputStr = "0x" + inputStr;
    }
    preimage = BigInt(inputStr);
  } catch (err) {
    console.log(err);
    console.error("Invalid preimage input.");
    process.exit(1);
  }

  // --- STEP 4: Compute and debug the hashLock from the provided preimage ---
  const calculatedHashLock = calculateHashLock(preimage);
  console.log("==== DEBUG INFO ====");
  console.log("Preimage (decimal):", preimage.toString());
  console.log("Preimage (hex):", "0x" + preimage.toString(16));
  console.log("Calculated hashLock (decimal):", calculatedHashLock.toString());
  console.log("Calculated hashLock (hex):", "0x" + calculatedHashLock.toString(16));
  console.log("Provided hashLock (decimal):", providedHashLock.toString());
  console.log("Provided hashLock (hex):", "0x" + providedHashLock.toString(16));
  console.log("==== DEBUG INFO ====");

  if (calculatedHashLock !== providedHashLock) {
    console.error("Calculated hashLock from the provided preimage does not match the entered HashLock!");
    process.exit(1);
  }

  // --- STEP 5: Send completeSwap transaction ---
  console.log("Completing swap with the following details:");
  console.log(`  Swap ID: ${targetSwapId}`);
  console.log(`  Preimage: ${preimage}`);

  console.log("Sending completeSwap transaction...");
  await fluida.sendCompleteSwap(provider.sender(), {
    swapId: targetSwapId,
    preimage,
    value: toNano('0.2'),
  });
  console.log("Complete swap transaction sent.");
}