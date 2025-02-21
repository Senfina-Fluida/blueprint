import { compileFunc } from "@ton-community/func-js";
import pkg from "ton-contract-executor";
import { Cell, Address, beginCell, toNano } from "@ton/core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { SmartContract, internal, stackInt } = pkg;
import { TonClient } from "@ton/ton";

// --------------------------------------------------------------------
// Helper: Fix address padding if needed
// --------------------------------------------------------------------
function fixAddressPadding(addr: string): string {
  const remainder = addr.length % 4;
  if (remainder !== 0) {
    const fixed = addr + "=".repeat(4 - remainder);
    console.log(`DEBUG: Fixed address by adding ${4 - remainder} "=" characters: ${fixed}`);
    return fixed;
  }
  return addr;
}

// --------------------------------------------------------------------
// Helper: Convert a friendly address to bounceable (if needed)
// --------------------------------------------------------------------
// function getBounceableAddress(friendlyStr: string): Address {
//   // First, fix any missing padding.
//   const padded = fixAddressPadding(friendlyStr);
//   console.log("DEBUG: Padded address:", padded, "Length:", padded.length);
//   // parseFriendly returns an object { address: Address, bounceable: boolean }
//   const parsed = Address.parseFriendly(padded);
//   if (!parsed.bounceable) {
//     console.log("DEBUG: Address is non-bounceable. Converting to bounceable...");
//     const bounceableStr = parsed.address.toFriendly({ bounceable: true });
//     const bounceableAddr = Address.parse(bounceableStr);
//     console.log("DEBUG: Converted Bounceable Address:", bounceableAddr.toString());
//     return bounceableAddr;
//   }
//   console.log("DEBUG: Address is already bounceable:", parsed.address.toString());
//   return parsed.address;
// }

// --------------------------------------------------------------------
// Set up file paths and constants
// --------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Provided Jetton contract address (friendly format)
const rawJettonAddress = "EQBergMVZZS6uM85K0KZhsB5N1YKCrAw--l81nu9ZNrwhLRY";
// Convert to bounceable address using our helper:
const jettonContractAddress = Address.parse(rawJettonAddress)

// For testing, we use a fixed Fluida contract address (assumed correctly formatted)
const fluidaContractAddressFixed = Address.parse("EQDfhi-iqk3Ol2pH2-yXQk19ip4OTm3KYOfqxjazCZjIJQsk");

// --------------------------------------------------------------------
// Fluida Contract: Compile from local source files
// --------------------------------------------------------------------
async function compileFluidaContract() {
  console.log("Compiling Fluida contract...");
  const contractPath = path.resolve(__dirname, "../contracts/fluida.fc");
  const stdlibPath = path.resolve(__dirname, "../contracts/stdlib.fc");
  const source = fs.readFileSync(contractPath, "utf8");
  const stdlib = fs.readFileSync(stdlibPath, "utf8");

  const compileResult = await compileFunc({
    sources: {
      "stdlib.fc": stdlib,
      "fluida.fc": source,
    },
    targets: ["fluida.fc"],
  });

  if (compileResult.status === "error") {
    throw new Error(`Fluida compilation failed: ${compileResult.message}`);
  }
  return Cell.fromBoc(Buffer.from(compileResult.codeBoc, "base64"))[0];
}

async function createFluidaContract() {
  const code = await compileFluidaContract();
  const data = new Cell(); // Empty cell for initial data
  const fluidaContract = await SmartContract.fromCell(code, data, { debug: true });
  console.log("Fluida contract created locally.");
  return fluidaContract;
}

// --------------------------------------------------------------------
// Jetton Contract: Load from network using TonClient
// --------------------------------------------------------------------
const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
});

async function getJettonContract() {
  console.log("Fetching Jetton contract state from network...");
  const state = await client.getContractState(jettonContractAddress);
  console.log("Raw contract state:", state);
  if (!state.code || !state.data) {
    throw new Error(
      "Failed to get jetton contract code/data from network. Verify that the contract is deployed at " +
        jettonContractAddress.toString()
    );
  }
  const code = Cell.fromBoc(state.code)[0];
  const data = Cell.fromBoc(state.data)[0];
  const jettonContract = await SmartContract.fromCell(code, data, { debug: true });
  console.log("Jetton contract loaded from network. Address:", jettonContractAddress.toString());
  return jettonContract;
}

// --------------------------------------------------------------------
// Test Functions
// --------------------------------------------------------------------
async function testInitialize(contract: any) {
  console.log("\n=== Test 1: Initialize Fluida Contract ===");
  try {
    const jettonWalletParam = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
    console.log("Initializing Fluida contract with jetton wallet:", jettonWalletParam.toString());

    const initMsg = beginCell()
      .storeUint(1, 32) // OP_INITIALIZE
      .storeAddress(jettonWalletParam)
      .endCell();

    const result = await contract.sendInternalMessage(
      internal({
        dest: jettonWalletParam,
        value: 1000000000n,
        bounce: true,
        body: initMsg,
      })
    );

    console.log("Fluida Init Transaction Results:");
    console.log("Exit code:", result.exit_code);
    console.log("Gas consumed:", result.gas_consumed);
    console.log("Logs:", result.logs);

    const getterResult = await contract.invokeGetMethod("get_jetton_wallet", []);
    console.log("Fluida Getter Result:", {
      success: getterResult.success,
      stack: getterResult.stack,
      logs: getterResult.logs,
    });
    return contract;
  } catch (error) {
    console.error("Fluida Initialization failed:", error);
    throw error;
  }
}

async function testDepositNotification(contract: any) {
  console.log("\n=== Test 2: Deposit Notification on Fluida ===");
  try {
    const depositOp = 3735928559n;
    const depositAmount = 1000000000n;
    const depositor = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
    const recipient = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
    const hashLock = 123456789n;
    const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log("Deposit Notification Input Values:", {
      depositAmount: depositAmount.toString(),
      depositor: depositor.toString(),
      recipient: recipient.toString(),
      hashLock: hashLock.toString(),
      timeLock: timeLock.toString(),
    });

    const recipientRef = beginCell().storeAddress(recipient).endCell();

    const depositMsg = beginCell()
      .storeUint(depositOp, 32)
      .storeUint(depositAmount, 128)
      .storeAddress(depositor)
      .storeRef(recipientRef)
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();

    const result = await contract.sendInternalMessage(
      internal({
        dest: depositor,
        value: 1000000000n,
        bounce: true,
        body: depositMsg,
      })
    );

    console.log("\nDeposit Notification Transaction Results:");
    console.log("Exit code:", result.exit_code);
    console.log("Gas consumed:", result.gas_consumed);

    if (result.debugLogs && result.debugLogs.length > 0) {
      console.log("\nParsed Debug Logs:");
      const parsedLogs = parseDebugLogs(result.debugLogs);
      console.log(JSON.stringify(parsedLogs, null, 2));
    }

    const counterResult = await contract.invokeGetMethod("get_swap_counter", []);
    console.log("\nFluida Final State:");
    console.log("New swap counter:", counterResult.result[0]);

    const swapResult = await contract.invokeGetMethod("get_swap", [stackInt(0)]);
    console.log("Fluida swapResult", swapResult);

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
    console.error("Deposit notification failed:", error);
    throw error;
  }
}

async function testJettonTransfer(jettonContract: any) {
  console.log("\n=== Test 4: Jetton Transfer with Custom Deposit-Notification ===");
  try {
    const owner = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

    console.log("Jetton Wallet Address (from network):", jettonContractAddress.toString());
    console.log("Fluida Contract Address (target):", fluidaContractAddressFixed.toString());

    const tokenAmount = 5000000000n;
    const forwardTonAmount = 20000000n;
    const totalTonAmount = 100000000n;

    console.log("Input Parameters:", {
      tokenAmount: tokenAmount.toString(),
      forwardTonAmount: forwardTonAmount.toString(),
      totalTonAmount: totalTonAmount.toString(),
    });

    const OP_DEPOSIT_NOTIFICATION = 3735928559n;
    const depositAmount = 1000000000n;

    const minterContract = { address: jettonContractAddress };
    const PARTICIPANT_ADDRESS_2 = owner;
    const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
    const hashLock = 123456789n;
    const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log("Deposit Notification Input Values:", {
      OP_DEPOSIT_NOTIFICATION: OP_DEPOSIT_NOTIFICATION.toString(),
      depositAmount: depositAmount.toString(),
      hashLock: hashLock.toString(),
      timeLock: timeLock.toString(),
    });

    const depositNotificationPayload = beginCell()
      .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
      .storeUint(depositAmount, 128)
      .storeAddress(minterContract.address)
      .storeRef(
        beginCell()
          .storeAddress(PARTICIPANT_ADDRESS_2)
          .endCell()
      )
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();

    console.log("Deposit Notification Payload (hex):", depositNotificationPayload.toBoc().toString("hex"));

    const messageBody = beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(0, 64)
      .storeCoins(tokenAmount)
      .storeAddress(fluidaContractAddressFixed)
      .storeAddress(fluidaContractAddressFixed)
      .storeBit(0)
      .storeCoins(forwardTonAmount)
      .storeBit(1)
      .storeRef(depositNotificationPayload)
      .endCell();

    console.log("Jetton Transfer Payload (hex):", messageBody.toBoc().toString("hex"));

    const result = await jettonContract.sendInternalMessage(
      internal({
        dest: jettonContractAddress,
        value: totalTonAmount,
        bounce: true,
        body: messageBody,
      })
    );

    console.log("\nTransaction Results for Jetton Transfer:");
    console.log("Exit code:", result.exit_code);
    console.log("Gas consumed:", result.gas_consumed);
    console.log("###result", result);

    if (result.debugLogs && result.debugLogs.length > 0) {
      console.log("\nParsed Debug Logs for Jetton Transfer:");
      const parsedLogs = parseDebugLogs(result.debugLogs);
      console.log(JSON.stringify(parsedLogs, null, 2));
    }

    const counterResult = await jettonContract.invokeGetMethod("get_swap_counter", []);
    console.log("\nFinal State (Jetton):");
    console.log("New swap counter:", counterResult.result[0]);

    const swapResult = await jettonContract.invokeGetMethod("get_swap", [stackInt(0)]);
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

    return jettonContract;
  } catch (error) {
    console.error("Jetton transfer failed:", error);
    throw error;
  }
}

async function testCompleteSwap(contract: any) {
  console.log("\n=== Test 3: Complete Swap on Fluida ===");
  try {
    const completeOp = 2271560481n;
    const swapId = 0n;
    const preimage = 123456789n;
    const targetAddress = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

    const completeMsg = beginCell()
      .storeUint(completeOp, 32)
      .storeUint(swapId, 256)
      .storeUint(preimage, 256)
      .endCell();

    console.log("Completing swap on Fluida...");
    console.log("SwapId:", swapId.toString());
    console.log("Preimage:", preimage.toString());

    const result = await contract.sendInternalMessage(
      internal({
        dest: targetAddress,
        value: 1000000000n,
        bounce: true,
        body: completeMsg,
      })
    );

    console.log("Transaction Results for Complete Swap:");
    console.log("Exit code:", result.exit_code);
    console.log("Gas consumed:", result.gas_consumed);
    console.log("Logs:", result.logs);

    const swapResult = await contract.invokeGetMethod("get_swap", [stackInt(0)]);
    console.log("Final swap state on Fluida:", swapResult.stack);

    return contract;
  } catch (error) {
    console.error("Complete swap failed:", error);
    throw error;
  }
}

// --------------------------------------------------------------------
// Helper to parse debug logs
// --------------------------------------------------------------------
function parseDebugLogs(debugLogs: string[]): any {
  const parsedLogs: any = {};
  let currentSection = "";

  debugLogs.forEach((log) => {
    const logContent = log.replace("#DEBUG#: ", "").trim();

    if (logContent.includes("CS{Cell{")) {
      const hexMatch = logContent.match(/Cell{(.*?)}/);
      if (hexMatch) {
        const hex = hexMatch[1].split("bits")[0].trim();
        return `Address: ${hex.substring(0, 16)}...`;
      }
    }

    if (logContent.includes(":")) {
      const [header, value] = logContent.split(":").map((s) => s.trim());
      if (value) {
        parsedLogs[header] = value;
      } else {
        currentSection = header;
      }
    } else if (logContent.startsWith("s0 = ")) {
      const value = logContent.replace("s0 = ", "").trim();
      if (currentSection) {
        parsedLogs[currentSection] = value;
        currentSection = "";
      }
    }
  });

  return parsedLogs;
}

// --------------------------------------------------------------------
// Run All Tests: Use both the Fluida contract and Jetton contract
// --------------------------------------------------------------------
async function runAllTests() {
  console.log("Starting combined contract tests...");

  try {
    const fluidaContract = await createFluidaContract();
    console.log("Fluida contract created successfully.");

    const jettonContract = await getJettonContract();

    // Uncomment tests as needed:
    // fluidaContract = await testInitialize(fluidaContract);
    // fluidaContract = await testDepositNotification(fluidaContract);
    // fluidaContract = await testCompleteSwap(fluidaContract);
    await testJettonTransfer(jettonContract);

    console.log("\nAll tests completed successfully!");
  } catch (error) {
    console.error("\nTest suite failed:", error);
    throw error;
  }
}

runAllTests()
  .then(() => {
    console.log("Test script finished");
  })
  .catch((error) => {
    console.error("Fatal error:", error);
  });
