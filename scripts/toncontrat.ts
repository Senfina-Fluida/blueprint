import { compileFunc } from "@ton-community/func-js";
import pkg from "ton-contract-executor";
import { Cell, Address, beginCell } from "@ton/core";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { SmartContract, internal, stackInt } = pkg;

async function compileContract() {
    console.log("Compiling contract...");
    
    // Read the contract source - adjust paths as needed
    const contractPath = path.resolve(__dirname, '../contracts/fluida.fc');
    const stdlibPath = path.resolve(__dirname, '../contracts/stdlib.fc');
    
    const source = fs.readFileSync(contractPath, 'utf8');
    const stdlib = fs.readFileSync(stdlibPath, 'utf8');

    const compileResult = await compileFunc({
        sources: {
            'stdlib.fc': stdlib,
            'fluida.fc': source
        },
        targets: ['fluida.fc']
    });

    if (compileResult.status === 'error') {
        throw new Error(`Compilation failed: ${compileResult.message}`);
    }

    return Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0];
}
async function createContract() {
    const code = await compileContract();
    const data = new Cell(); // Empty cell for initial data
    const contract = await SmartContract.fromCell(code, data, {
        debug: true,


    });
    return contract;
}

async function testInitialize(contract: any) {
    console.log("\n=== Test 1: Initialize Contract ===");
    try {
        const jettonWalletAddress = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
        
        console.log("Initializing with jetton wallet:", jettonWalletAddress.toString());

        const initMsg = beginCell()
            .storeUint(1, 32) // OP_INITIALIZE
            .storeAddress(jettonWalletAddress)
            .endCell();

        const result = await contract.sendInternalMessage(
            internal({
                dest: jettonWalletAddress,
                value: 1000000000n,
                bounce: true,
                body: initMsg
            })
        );

        console.log("Transaction Results:");
        console.log("Exit code:", result.exit_code);
        console.log("Gas consumed:", result.gas_consumed);
        console.log("Logs:", result.logs);

        // Verify initialization using getter
        const getterResult = await contract.invokeGetMethod("get_jetton_wallet", []);
        console.log("Getter Result:", {
            success: getterResult.success,
            stack: getterResult.stack,
            logs: getterResult.logs
        });

        if (result.exit_code !== 0) {
            console.error("Transaction failed with code:", result.exit_code);
            if (result.logs) {
                console.error("Transaction logs:", result.logs);
            }
        }

        return contract;
    } catch (error) {
        console.error("Initialization failed:", error);
        throw error;
    }
}

// Helper function to check contract state
async function checkContractState(contract: any) {
    const getterResult = await contract.invokeGetMethod("get_jetton_wallet", []);
    console.log("Current contract state:");
    console.log("Jetton wallet:", getterResult.stack);
    
    const counterResult = await contract.invokeGetMethod("get_swap_counter", []);
    console.log("Swap counter:", counterResult.stack);
}

async function runAllTests() {
    console.log("Starting Fluida contract tests...");
    try {
        let contract = await createContract();
        console.log("Contract created successfully");

        // Check initial state
        // await checkContractState(contract);

        // Run tests
        // contract = await testInitialize(contract);
        
        // Check state after initialization
        // await checkContractState(contract);

        // Continue with other tests...
        contract = await testDepositNotification(contract);

        // contract = await testJettonTransfer(contract);
        // contract = await testCompleteSwap(contract);

        console.log("\nAll tests completed successfully!");
    } catch (error) {
        console.error("\nTest suite failed:", error);
        throw error;
    }
}

async function testJettonTransfer(contract: any) {
    console.log("\n=== Test 4: Jetton Transfer with Custom Deposit-Notification ===");
    try {
        // Use a fixed owner address
        const owner = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

        // Use a fixed jetton wallet address (for testing)
        const jettonWalletAddress = Address.parse("EQBergMVZZS6uM85K0KZhsB5N1YKCrAw--l81nu9ZNrwhLRY");
        console.log("Jetton Wallet Address:", jettonWalletAddress.toString());

        // Set the destination as the Fluida contract address.
        const fluidaAddress = Address.parse("EQDfhi-iqk3Ol2pH2-yXQk19ip4OTm3KYOfqxjazCZjIJQsk");
        console.log("Fluida Contract Address:", fluidaAddress.toString());

        // Define parameters (using raw numeric values, similar to other tests)
        // Assuming 1 token = 1e9 minimal units.
        const tokenAmount = 5000000000n;      // 5 tokens in minimal units
        const forwardTonAmount = 20000000n;     // 0.02 TON in minimal units (if 1 TON = 1e9)
        const totalTonAmount = 100000000n;      // 0.1 TON in minimal units

        console.log("Input Parameters:", {
            tokenAmount: tokenAmount.toString(),
            forwardTonAmount: forwardTonAmount.toString(),
            totalTonAmount: totalTonAmount.toString(),
        });

        // Build the deposit notification forward payload.
        // OP_DEPOSIT_NOTIFICATION = 3735928559 (0xDEADBEEF)
        const OP_DEPOSIT_NOTIFICATION = 3735928559n;
        const depositAmount = 1000000000n;      // 1 token in minimal units

        // Use the jetton wallet as the minter (depositor).
        const minterContract = { address: jettonWalletAddress };

        // Use the owner as the recipient.
        const PARTICIPANT_ADDRESS_2 = owner;

        // Define a dummy 256-bit preimage and set its hashLock value.
        const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
        const hashLock = 123456789n;
        const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

        console.log("Deposit Notification Input Values:", {
            OP_DEPOSIT_NOTIFICATION: OP_DEPOSIT_NOTIFICATION.toString(),
            depositAmount: depositAmount.toString(),
            hashLock: hashLock.toString(),
            timeLock: timeLock.toString()
        });

        const depositNotificationPayload = beginCell()
            .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
            .storeUint(depositAmount, 128)
            .storeAddress(minterContract.address) // depositor
            .storeRef(
                beginCell()
                    .storeAddress(PARTICIPANT_ADDRESS_2) // recipient
                    .endCell()
            )
            .storeUint(hashLock, 256)
            .storeUint(timeLock, 64)
            .endCell();

        console.log("Deposit Notification Payload (hex):", depositNotificationPayload.toBoc().toString("hex"));

        // Build the jetton transfer message body.
        // Structure:
        //   [ opcode (32 bits): 0x0f8a7ea5,
        //     query_id (64 bits): 0,
        //     tokenAmount (coins): tokenAmount,
        //     destination address: fluidaAddress,
        //     response destination: fluidaAddress,
        //     custom payload flag: 0 (no separate custom payload),
        //     forward TON amount: forwardTonAmount,
        //     forward payload flag: 1 (store forward payload as ref),
        //     attach depositNotificationPayload (ref cell)
        //   ]
        const messageBody = beginCell()
            .storeUint(0x0f8a7ea5, 32)      // opcode for jetton transfer
            .storeUint(0, 64)               // query id = 0
            .storeCoins(tokenAmount)        // token amount: 5 tokens
            .storeAddress(fluidaAddress)     // destination: Fluida contract
            .storeAddress(fluidaAddress)     // response destination: Fluida contract
            .storeBit(0)                   // custom payload flag: 0
            .storeCoins(forwardTonAmount)   // forward TON amount (0.02 TON)
            .storeBit(1)                   // forward payload flag: true
            .storeRef(depositNotificationPayload) // attach deposit-notification payload cell
            .endCell();

        console.log("Jetton Transfer Payload (hex):", messageBody.toBoc().toString("hex"));

        // Send the internal message to the jetton wallet contract.
        const result = await contract.sendInternalMessage(
            internal({
                dest: jettonWalletAddress,
                value: totalTonAmount,
                bounce: true,
                body: depositNotificationPayload,
            })
        );

        console.log("\nTransaction Results for Jetton Transfer:");
        console.log("Exit code:", result.exit_code);
        console.log("Gas consumed:", result.gas_consumed);

        console.log("###result", result);

        // Parse and display debug logs, if available
        if (result.debugLogs && result.debugLogs.length > 0) {
            console.log("\nParsed Debug Logs for Jetton Transfer:");
            const parsedLogs = parseDebugLogs(result.debugLogs);
            console.log(JSON.stringify(parsedLogs, null, 2));
        }

        const counterResult = await contract.invokeGetMethod("get_swap_counter", []);
        console.log("\nFinal State:");
        console.log("New swap counter:", counterResult.result[0]);

        // Retrieve the swap details using the get_swap method.
        // The smart contract's get_swap method is defined as:
        //
        // (slice, slice, int, int, int, int) get_swap(int swapId) method_id {
        //     var (_, _, swaps) = load_data();
        //     var (swapData, found) = swaps.udict_get?(256, swapId);
        //     throw_unless(ERR_SWAP_NOT_FOUND, found);
        //     return parseSwap(swapData);
        // }
        //
        // Now we log each element of the returned tuple:
        const swapResult = await contract.invokeGetMethod("get_swap", [
            // Pass swapId (e.g., 0)
            stackInt(0),
        ]);

        console.log("swapResult", swapResult);
        
        console.log("\nCreated swap details from get_swap:");
        if (swapResult.result && swapResult.result.length >= 6) {
            const [slice1, slice2, int1, int2, int3, int4] = swapResult.result;
            console.log("Slice 1:", slice1);
            console.log("Slice 2:", slice2);
            console.log("Int 1:", int1);
            console.log("Int 2:", int2);
            console.log("Int 3:", int3);
            console.log("Int 4:", int4);
        } else {
            console.log("Unexpected structure of swapResult:", swapResult);
        }

        return contract;
    } catch (error) {
        console.error("Jetton transfer failed:", error);
        throw error;
    }
}



async function testDepositNotification(contract: any) {
    console.log("\n=== Test 2: Deposit Notification ===");
    try {
        const transferOp = 0x7362d09cn;
        const depositAmount = 1000000000n;
        const depositor = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
        const recipient = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
        const hashLock = 123456789n;
        const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

        const extraCell = beginCell()
        .storeUint(hashLock, 256)
        .storeUint(timeLock, 64)
        .endCell();
    
      const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn; // 0xDEADBEEF = 3735928559

      // Build the deposit notification payload.
      const depositNotificationPayload = beginCell()
        .storeUint(0xdeadbeef, 32)  // deposit notification op code (0xDEADBEEF)
        .storeUint(depositAmount, 128)
        .storeAddress(depositor)
        .storeRef(
          beginCell()
            .storeAddress(depositor)
            .endCell()
        )
        // Instead of storing hashLock/timeLock inline, store a reference to the extra cell.
        .storeRef(extraCell)
        .endCell();

        // console.log("Input Values:");
        // console.log({
        //     depositAmount: depositAmount.toString(),
        //     depositor: depositor.toString(),
        //     recipient: recipient.toString(),
        //     hashLock: hashLock.toString(),
        //     timeLock: timeLock.toString()
        // });

        // const recipientRef = beginCell()
        //     .storeAddress(recipient)
        //     .endCell();


        

            const messageBody = beginCell()
            .storeUint(transferOp, 32)           // transfer op code for jetton transfer
            .storeUint(0, 64)                    // query_id
            .storeCoins(depositAmount)             // token amount for transfer
            .storeAddress(recipient)         // destination
            .storeAddress(recipient)         // response destination (ensure this is correct for your use case)
            .storeBit(0)                         // custom payload flag (0 = none)
            .storeCoins(depositAmount)        // forward TON amount
            .storeBit(1)                         // forward payload flag (1 = referenced cell)
            .storeRef(depositNotificationPayload)            // attach the forward payload
            .endCell();
        const result = await contract.sendInternalMessage(
            internal({
                dest: Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
                value: 1000000000n,
                bounce: true,
                body: messageBody
            })
        );

        console.log("\nTransaction Results:");
        console.log("Exit code:", result.exit_code);
        console.log("Gas consumed:", result.gas_consumed);

        // Parse and display the debug logs in a readable format
        if (result.debugLogs && result.debugLogs.length > 0) {
            console.log("\nParsed Debug Logs:");

            console.log(result.debugLogs);
            const parsedLogs = parseDebugLogs(result.debugLogs);
            console.log(JSON.stringify(parsedLogs, null, 2));
            
            console.log("\nSwap Storage Details:");
            Object.entries(parsedLogs).forEach(([key, value]) => {
                if (key.includes("STORING SWAP") || 
                    key.includes("Token Amount") || 
                    key.includes("Hash Lock") || 
                    key.includes("Time Lock")) {
                    console.log(`${key}: ${value}`);
                }
            });
        }

        // Check final state
        // const res = await contract.invokeGetMethod("get_jetton_wallet", []);
        // console.log("RES", res);

        const counterResult = await contract.invokeGetMethod("get_swap_counter", []);
        console.log("\nFinal State:");
        console.log("New swap counter:", counterResult.result[0]);

        // Retrieve the swap details using the get_swap method.
        // The smart contract's get_swap method is defined as:
        //
        // (slice, slice, int, int, int, int) get_swap(int swapId) method_id {
        //     var (_, _, swaps) = load_data();
        //     var (swapData, found) = swaps.udict_get?(256, swapId);
        //     throw_unless(ERR_SWAP_NOT_FOUND, found);
        //     return parseSwap(swapData);
        // }
        //
        // Now we log each element of the returned tuple:
        // const swapResult = await contract.invokeGetMethod("get_swap", [
        //     // Pass swapId (e.g., 0)
        //     stackInt(0),
        // ]);

        // console.log("swapResult",swapResult)
        
        // console.log("\nCreated swap details from get_swap:");
        // if (swapResult.result && swapResult.result.length >= 6) {
        //     const [slice1, slice2, int1, int2, int3, int4] = swapResult.result;
        //     console.log("Slice 1:", slice1);
        //     console.log("Slice 2:", slice2);
        //     console.log("Int 1:", int1);
        //     console.log("Int 2:", int2);
        //     console.log("Int 3:", int3);
        //     console.log("Int 4:", int4);
        // } else {
        //     console.log("Unexpected structure of swapResult:", swapResult);
        // }

        return contract;
    } catch (error) {
        console.error("Deposit notification failed:", error);
        throw error;
    }
}

async function testCompleteSwap(contract: any) {
    console.log("\n=== Test 3: Complete Swap ===");
    try {
        const completeOp = 2271560481n; // OP_COMPLETE_SWAP
        const swapId = 0n;
        const preimage = 123456789n;
        const jettonWalletAddress = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

        const completeMsg = beginCell()
            .storeUint(completeOp, 32)
            .storeUint(swapId, 256)
            .storeUint(preimage, 256)
            .endCell();

        console.log("Completing swap...");
        console.log("SwapId:", swapId.toString());
        console.log("Preimage:", preimage.toString());

        const result = await contract.sendInternalMessage(
            internal({
                dest: jettonWalletAddress,
                value: 1000000000n,
                bounce: true,
                body: completeMsg
            })
        );

        console.log("Transaction Results:");
        console.log("Exit code:", result.exit_code);
        console.log("Gas consumed:", result.gas_consumed);
        console.log("Logs:", result.logs);

        const swapResult = await contract.invokeGetMethod("get_swap", [stackInt(0)]);
        console.log("Final swap state:", swapResult.stack);

        return contract;
    } catch (error) {
        console.error("Complete swap failed:", error);
        throw error;
    }
}


// Helper function to parse debug logs
function parseDebugLogs(debugLogs: string[]): any {
    const parsedLogs: any = {};
    let currentSection = '';

    debugLogs.forEach(log => {
        const logContent = log.replace('#DEBUG#: ', '').trim();
        
        // Parse Cell Slice content
        if (logContent.includes('CS{Cell{')) {
            // Extract the hex content
            const hexMatch = logContent.match(/Cell{(.*?)}/);
            if (hexMatch) {
                const hex = hexMatch[1].split('bits')[0].trim();
                // Convert to more readable format - just take the first part for clarity
                return `Address: ${hex.substring(0, 16)}...`;
            }
        }
        
        // If it's a section header (contains ':')
        if (logContent.includes(':')) {
            const [header, value] = logContent.split(':').map(s => s.trim());
            if (value) {
                parsedLogs[header] = value;
            } else {
                currentSection = header;
            }
        } else if (logContent.startsWith('s0 = ')) {
            const value = logContent.replace('s0 = ', '').trim();
            if (currentSection) {
                parsedLogs[currentSection] = value;
                currentSection = '';
            }
        }
    });

    return parsedLogs;
}
// Run the tests
runAllTests().then(() => {
    console.log("Test script finished");
}).catch((error) => {
    console.error("Fatal error:", error);
});