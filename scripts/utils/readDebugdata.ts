// scripts/readTestData.ts
import { Address, Cell, beginCell } from '@ton/core';

class SimpleTupleReader {
  private items: any[];
  private index = 0;
  
  constructor(items: any[]) {
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
  
  readBoolean(): boolean {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readBoolean()");
    const item = this.items[this.index++];
    if (item.type === 'num') return BigInt(item.value) !== 0n;
    throw new Error("Expected a boolean in stack, got type: " + item.type);
  }

  readCell(): Cell {
    if (this.index >= this.items.length)
      throw new Error("No more items in stack for readCell()");
    const item = this.items[this.index++];
    if (item.type === 'cell') {
      return Cell.fromBoc(Buffer.from(item.value.bytes, 'base64'))[0];
    }
    throw new Error("Expected a cell in stack, got type: " + item.type);
  }
}

const CONTRACT_ADDRESS = Address.parse('EQD4s_e859JWqQK8fuT8ITRpquhYX0PKN4B-2g8lgmKLDZuq');
const API_ENDPOINT = 'https://ton-testnet.core.chainstack.com/7f51376bae293d5148c231c1270a74f9/api/v2/runGetMethod';

const testProvider = {
  async get(method: string, params: any[] = []): Promise<{ stack: SimpleTupleReader }> {
    const convertedParams = params.map(param => {
      if (param.type === 'int') return ['num', `0x${BigInt(param.value).toString(16)}`];
      throw new Error(`Unsupported parameter type: ${param.type}`);
    });

    const payload = {
      address: CONTRACT_ADDRESS.toString(),
      method: method,
      stack: convertedParams,
    };

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`API error: ${json.error.message}`);
    }

    return { stack: new SimpleTupleReader(json.result.stack) };
  }
};

async function readTestData() {
  console.log('📝 Reading Test Function Data from Contract');
  console.log('📫 Address:', CONTRACT_ADDRESS.toString());
  console.log('═══════════════════════════════════════════');

  try {
    // 1. Message Value Information
    console.log('💰 Message Value Data:');
    const msgValue = await testProvider.get('get_msg_value');
    const msgValueEmpty = await testProvider.get('get_msg_value_empty');
    console.log('  • Actual Value:', msgValue.stack.readBigNumber().toString(), 'nanoTON');
    console.log('  • Is Empty:', msgValueEmpty.stack.readBoolean());
    console.log('───────────────────────────────────────────');

    // 2. Full Message Information
    console.log('📨 Full Message Data:');
    const msgFull = await testProvider.get('get_msg_full');
    const msgFullEmpty = await testProvider.get('get_msg_full_empty');
    console.log('  • Message Cell:', msgFull.stack.readCell().toString());
    console.log('  • Is Empty:', msgFullEmpty.stack.readBoolean());
    console.log('───────────────────────────────────────────');

    // 3. Message Body Information
    console.log('📩 Message Body Status:');
    const msgBodyEmpty = await testProvider.get('get_msg_body_empty');
    console.log('  • Is Empty:', msgBodyEmpty.stack.readBoolean());
    console.log('───────────────────────────────────────────');

    // 4. Empty Components Summary
    console.log('📊 Components Summary:');
    const totalEmpty = await testProvider.get('get_total_empty_count');
    console.log('  • Total Empty Components:', totalEmpty.stack.readBigNumber().toString(), 'out of 3');
    console.log('───────────────────────────────────────────');

    // 5. Error Status
    console.log('⚠️  Error Information:');
    const hasError = await testProvider.get('get_error_occurred');
    console.log('  • Error Occurred:', hasError.stack.readBoolean());
    console.log('═══════════════════════════════════════════');

    console.log('💰 Message Value Data:');
    const get_msg_body = await testProvider.get('get_msg_body');
    // const msgValueEmpty = await testProvider.get('get_msg_value_empty');
    console.log('  • Actual Value:', get_msg_body.stack.readCell().toString());
    // console.log('  • Is Empty:', msgValueEmpty.stack.readBoolean());
    console.log('───────────────────────────────────────────');

  } catch (error) {
    console.error('❌ Error reading contract data:');
    console.error(error);
  }
}

// Execute the script
readTestData().catch(console.error);