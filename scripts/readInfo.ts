// scripts/readData.ts
import { Address, beginCell } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';

// If your Node.js version does not include fetch natively, uncomment the following line and install node-fetch:
// import fetch from 'node-fetch';

/**
 * A minimal TupleReader implementation to satisfy the wrapper.
 */
class SimpleTupleReader {
  private items: any[];
  private index = 0;
  constructor(items: any[]) {
    this.items = items;
  }
  readBigNumber(): bigint {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readBigNumber()");
    const item = this.items[this.index++];
    if (item.type === 'num') return BigInt(item.value);
    throw new Error("Expected a number in stack");
  }
  readAddress(): Address {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readAddress()");
    const item = this.items[this.index++];
    if (item.type === 'addr') return Address.parse(item.value);
    throw new Error("Expected an address in stack");
  }
  readBoolean(): boolean {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readBoolean()");
    const item = this.items[this.index++];
    if (item.type === 'bool') return item.value === true || item.value === 'true';
    throw new Error("Expected a boolean in stack");
  }
}

/**
 * Converts a parameter into a BOC (base64 string) for the API call.
 */
function convertParam(param: any): string {
  if (param.type === 'int') {
    const cell = beginCell().storeUint(BigInt(param.value), 256).endCell();
    // Pass only the idx and crc32 options as required.
    const boc = cell.toBoc({ idx: false, crc32: false });
    return boc.toString('base64');
  }
  throw new Error(`Unsupported parameter type: ${param.type}`);
}

// --------------------------------------------------------------------
// Custom provider using the TON Console API (public testnet endpoint)
// --------------------------------------------------------------------
const TON_CONSOLE_ENDPOINT = 'https://ton-testnet.core.chainstack.com/7f51376bae293d5148c231c1270a74f9/api/v2/runGetMethod';

// Replace with your actual deployed Fluida contract address.
const fluidaAddress = Address.parse('EQB1VRTeaV1QrRpP-0TfkW2TBGs-SQUHgPe0Ti57mgFKchmt');

const consoleProvider = {
  /**
   * Implements the get() method required by the Fluida wrapper.
   * It sends a JSON‑RPC request to TON Console API's "runGetMethod".
   */
  async get(method: string, params: any[]): Promise<{ stack: SimpleTupleReader }> {
    // Convert params to the format expected by the API
    const convertedParams = params.map(param => {
      if (param.type === 'int') return ['num', `0x${BigInt(param.value).toString(16)}`];
      throw new Error(`Unsupported parameter type: ${param.type}`);
    });

    const payload = {
      address: fluidaAddress.toString(),
      method: method,
      stack: convertedParams,
    };

    console.log('Sending API request to:', TON_CONSOLE_ENDPOINT);
    console.log('Request payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(TON_CONSOLE_ENDPOINT, {
      method: 'POST',
      headers: { 
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response body:', errorText);
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = await response.json();
    console.log('API response:', JSON.stringify(json, null, 2));
    
    if (json.error) {
      throw new Error(`TON Console API error: ${json.error.message}`);
    }
    return { stack: new SimpleTupleReader(json.result.stack) };
  },
  // internal() is not used for read-only getter calls.
  async internal(): Promise<void> {
    throw new Error("internal() is not implemented in the read provider");
  }
};

// --------------------------------------------------------------------
// Main Script: Read Data from the Deployed Fluida Contract
// --------------------------------------------------------------------
export async function run() {
  // Create a Fluida contract wrapper instance with the deployed address.
  const fluida = new Fluida(fluidaAddress);
  console.log("Reading data from Fluida contract at address:", fluidaAddress.toString());

  try {
    // 1) Read the swap counter from the contract
    const swapCounter = await fluida.getSwapCounter(consoleProvider as any);
    console.log("Swap Counter:", swapCounter.toString());

    // 2) Read the stored tgBTC address from the contract
    const tgBTCAddress = await fluida.getTgBTCAddress(consoleProvider as any);
    console.log("tgBTCAddress stored in contract:", tgBTCAddress.toString());

    // 3) If there is at least one swap, read details of the last swap.
    if (swapCounter > 0n) {
      // Assume the last swap has id = swapCounter - 1
      const lastSwapId = swapCounter - 1n;
      const exists = await fluida.hasSwap(consoleProvider as any, lastSwapId);
      console.log(`Swap with id ${lastSwapId.toString()} exists?`, exists);
      if (exists) {
        const swap = await fluida.getSwap(consoleProvider as any, lastSwapId);
        console.log("Swap details:");
        console.log("  Initiator:", swap.initiator.toString());
        console.log("  Recipient:", swap.recipient.toString());
        console.log("  Amount:", swap.amount.toString());
        console.log("  HashLock:", swap.hashLock.toString());
        console.log("  TimeLock:", swap.timeLock.toString());
        console.log("  Completed:", swap.isCompleted);
      } else {
        console.log(`Swap with id ${lastSwapId.toString()} does not exist.`);
      }
    } else {
      console.log("No swaps have been created yet.");
    }
  } catch (error) {
    console.error("Error reading contract state:", error);
  }
}
