import { toNano, beginCell, Address, SendMode } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { calculateHashLock } from './utils/hashHelper';
import readline from 'readline';

import { getFluidaAddress } from './utils/getFluidaAddress';


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
    // Constants from the Fluida contract
    const OP_COMPLETE_SWAP = 2271560481; // decimal 0x87654321

    // Connect to Fluida contract using its address.
    const fluidaAddress = Address.parse(getFluidaAddress());

    // --- STEP 1: Prompt for hashLock ---
    const hashLockInput = await prompt("Enter the HashLock for the swap to complete: ");
    let providedHashLock: bigint;
    try {
        // Handle both decimal and hex inputs
        if (hashLockInput.trim().toLowerCase().startsWith('0x')) {
            providedHashLock = BigInt(hashLockInput.trim());
        } else {
            // If no 0x prefix, assume decimal
            providedHashLock = BigInt(hashLockInput.trim());
        }
    } catch (err) {
        console.error("Invalid hashLock input.");
        process.exit(1);
    }

    // --- STEP 2: Get the swap directly by hashLock or fallback to iteration ---
    console.log(`Looking up swap with HashLock: ${providedHashLock}`);

    // Variables to store swap data
    let swapId: bigint | null = null;
    let initiator: Address | null = null;
    let recipient: Address | null = null;
    let amount: bigint | null = null;
    let hashLock: bigint | null = null;
    let timeLock: bigint | null = null;
    let isCompleted: boolean | null = null;

    // Try direct lookup first
    try {
        console.log("Attempting direct lookup by hashlock...");
        const result = await provider.provider(fluidaAddress).get("get_swap_by_hashlock", [
            { type: 'int', value: providedHashLock }
        ]);

        const stack = result.stack;
        swapId = stack.readBigNumber();
        initiator = stack.readAddress();
        recipient = stack.readAddress();
        amount = stack.readBigNumber();
        hashLock = stack.readBigNumber();
        timeLock = stack.readBigNumber();
        isCompleted = stack.readBoolean();

        console.log("Direct lookup successful!");
    } catch (err) {
        console.log("Direct lookup failed. Falling back to swap iteration...");

        // Fallback: Iterate through swaps
        try {
            const swapCounter = await provider.provider(fluidaAddress).get("get_swap_counter", []);
            const totalSwaps = swapCounter.stack.readBigNumber();

            console.log(`Total swaps in contract: ${totalSwaps}`);

            // Loop through all swaps
            for (let i = 0n; i < totalSwaps; i++) {
                try {
                    const swapResult = await provider.provider(fluidaAddress).get("get_swap", [
                        { type: 'int', value: i }
                    ]);

                    const swapStack = swapResult.stack;
                    const swapInitiator = swapStack.readAddress();
                    const swapRecipient = swapStack.readAddress();
                    const swapAmount = swapStack.readBigNumber();
                    const swapHashLock = swapStack.readBigNumber();
                    const swapTimeLock = swapStack.readBigNumber();
                    const swapIsCompleted = swapStack.readBoolean();

                    if (swapHashLock === providedHashLock) {
                        console.log(`Found matching swap with ID: ${i}`);
                        swapId = i;
                        initiator = swapInitiator;
                        recipient = swapRecipient;
                        amount = swapAmount;
                        hashLock = swapHashLock;
                        timeLock = swapTimeLock;
                        isCompleted = swapIsCompleted;
                        break;
                    }
                } catch (innerErr) {
                    console.log(`Error fetching swap ID ${i}, continuing...`);
                }
            }
        } catch (countErr) {
            console.error("Failed to get swap counter:", countErr);
            process.exit(1);
        }
    }

    // Check if we found the swap
    if (swapId === null) {
        console.error("No swap found with the provided hashLock. Please check the value and try again.");
        process.exit(1);
    }

    // Display swap details
    console.log(`Found swap with ID: ${swapId}`);
    console.log("Swap details:");
    console.log(`  Initiator: ${initiator!.toString()}`);
    console.log(`  Recipient: ${recipient!.toString()}`);
    console.log(`  Amount: ${amount!.toString()}`);
    console.log(`  Stored HashLock: ${hashLock!.toString()}`);
    console.log(`  TimeLock: ${timeLock!.toString()}`);
    console.log(`  Completed: ${isCompleted ? 'Yes' : 'No'}`);

    // Check if swap is already completed
    if (isCompleted) {
        console.error("This swap has already been completed!");
        process.exit(1);
    }

    // --- STEP 3: Prompt for the preimage ---
    const preimageInput = await prompt("Enter the preimage to complete the swap (in hex or decimal): ");
    let preimage: bigint;
    try {
        let inputStr = preimageInput.trim();
        // If the input is hex but doesn't have the 0x prefix, add it
        if (inputStr.match(/^[0-9a-fA-F]+$/) && !inputStr.startsWith("0x")) {
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

    // --- STEP 5: Create and send completeSwap message directly ---
    console.log("Completing swap with the following details:");
    console.log(`  Swap ID: ${swapId}`);
    console.log(`  Preimage: ${preimage}`);

    // Build message body
    const messageBody = beginCell()
        .storeUint(OP_COMPLETE_SWAP, 32)  // OP code
        .storeUint(swapId!, 256)   // Swap ID as BigInt
        .storeUint(preimage, 256) // Preimage as BigInt
        .endCell();

    console.log("Sending completeSwap transaction...");

    // Send message directly
    try {
        const result = await provider.provider(fluidaAddress).internal(provider.sender(), {
            value: toNano("0.2"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            bounce: true,
            body: messageBody,
        });

        console.log("✅ Complete swap message sent. Transaction result:", result);
    } catch (error) {
        console.error("❌ Error sending complete swap message:", error);
    }
} 