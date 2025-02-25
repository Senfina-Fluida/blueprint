// scripts/readData.ts
import { Address, beginCell, Cell } from '@ton/core';
import { Fluida } from '../wrappers/FluidaDeploy';
import { getFluidaAddress } from './utils/getFluidaAddress';


// If your Node.js version does not include fetch natively, uncomment the following line and install node-fetch:
// import fetch from 'node-fetch';

/**
 * A minimal TupleReader implementation to satisfy the wrapper.
 * 
 * 
 */


class SimpleTupleReader {
  private items: any[];
  private index = 0;
  constructor(items: any[]) {
    // Convert items that are arrays (e.g. ["num", "0xb"]) into objects with "type" and "value" keys.
    this.items = items.map(item =>
      Array.isArray(item) ? { type: item[0], value: item[1] } : item
    );
  }
  readBigNumber(): bigint {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readBigNumber()");
    const item = this.items[this.index++];
    if (item.type === 'num') return BigInt(item.value);
    throw new Error("Expected a number in stack, got type: " + item.type);
  }
  readAddress(): Address {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readAddress()");
    const item = this.items[this.index++];
    if (item.type === 'addr') {
      return Address.parse(item.value);
    }
    if (item.type === 'cell') {
      // Decode the cell from its base64 representation and then load the address.
      const cell = Cell.fromBoc(Buffer.from(item.value.bytes, 'base64'))[0];
      return cell.beginParse().loadAddress();
    }
    throw new Error("Expected an address in stack, got type: " + item.type);
  }
  readBoolean(): boolean {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readBoolean()");
    const item = this.items[this.index++];
    if (item.type === 'bool') {
      return item.value === true || item.value === 'true';
    }
    // Accept a number as a boolean (0 means false, non‑0 means true)
    if (item.type === 'num') {
      return BigInt(item.value) !== 0n;
    }
    throw new Error("Expected a boolean in stack, got type: " + item.type);
  }
}

/**
 * Converts a parameter into a BOC (base64 string) for the API call.
 */
function convertParam(param: any): string {
  if (param.type === 'int') {
    const cell = beginCell().storeUint(BigInt(param.value), 256).endCell();
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
const fluidaAddress = Address.parse(getFluidaAddress());


const consoleProvider = {
  async get(method: string, params: any[]): Promise<{ stack: SimpleTupleReader }> {
    const convertedParams = params.map(param => {
      if (param.type === 'int') return ['num', `0x${BigInt(param.value).toString(16)}`];
      throw new Error(`Unsupported parameter type: ${param.type}`);
    });
    const payload = {
      address: fluidaAddress.toString(),
      method: method,
      stack: convertedParams,
    };
    const response = await fetch(TON_CONSOLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }
    const json = await response.json();
    if (json.error) {
      throw new Error(`TON Console API error: ${json.error.message}`);
    }
    return { stack: new SimpleTupleReader(json.result.stack) };
  },
  async internal(): Promise<void> {
    throw new Error("internal() is not implemented in the read provider");
  }
};

// --------------------------------------------------------------------
// Main Script: Read Data from the Deployed Fluida Contract
// --------------------------------------------------------------------
export async function run() {
  const fluida = new Fluida(fluidaAddress);
  console.log("Reading data from Fluida contract at address:", fluidaAddress.toString());
  try {
    // Get the swap counter from the contract.
    const swapCounter = await fluida.getSwapCounter(consoleProvider as any);
    console.log("Swap Counter:", swapCounter.toString());

    if (swapCounter > 0n) {
      console.log("Swaps:");
      for (let i = 0n; i < swapCounter; i++) {
        const exists = await fluida.hasSwap(consoleProvider as any, i);
        console.log(`Checking swap id ${i.toString()}: exists = ${exists}`);
        if (exists) {
          const swap = await fluida.getSwap(consoleProvider as any, i);
          console.log(`Swap id ${i.toString()}:`);
          console.log("  Initiator:", swap.initiator.toString());
          console.log("  Recipient:", swap.recipient.toString());
          console.log("  Amount:", swap.amount.toString());
          console.log("  HashLock:", swap.hashLock.toString());
          console.log("  TimeLock:", swap.timeLock.toString());
          console.log("  Completed:", swap.isCompleted);
        } else {
          console.log(`Swap with id ${i.toString()} does not exist.`);
        }
      }
    } else {
      console.log("No swaps have been created yet.");
    }
  } catch (error) {
    console.error("Error reading contract state:", error);
  }
}


