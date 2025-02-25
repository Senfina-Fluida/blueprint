import { 
  Address, 
  Cell, 
  beginCell, 
  contractAddress, 
  Sender, 
  toNano, 
  // tuple, 
  TupleItem,
  SendMode
} from '@ton/core';
import { Contract, ContractProvider } from '@ton/core';

export type FluidaConfig = {};

// A helper to convert a FluidaConfig into a Cell.
export function fluidaConfigToCell(config: FluidaConfig): Cell {
  return beginCell().endCell();
}

// Exported constants – must match your FunC code.
export const OP_INITIALIZE = 1;
export const OP_COMPLETE_SWAP = 2271560481; // 0x87654321

export class Fluida implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address): Fluida {
    return new Fluida(address);
  }

  static createFromConfig(config: FluidaConfig, code: Cell, workchain = 0): Fluida {
    const data = fluidaConfigToCell(config);
    const init = { code, data };
    return new Fluida(contractAddress(workchain, init), init);
  }

  // ---- Message Sending Methods ----
  // Deploy the contract using the provided provider.
  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint = toNano('0.05')): Promise<any> {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  // Send an internal message using the provided provider.
  async sendInternalMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell): Promise<any> {
    return await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  // ---- Getter Methods (require provider as argument) ----
  async get_swap_counter(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('get_swap_counter', []);
    return result.stack.readBigNumber();
  }

  async get_jetton_wallet(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('get_jetton_wallet', []);
    return result.stack.readAddress();
  }

  // ---- Tuple Encoding for swapId ----
  private encodeSwapId(swapId: number): TupleItem[] {
    const idCell = beginCell().storeUint(swapId, 256).endCell();
    return [{
      type: 'cell',
      cell: idCell
    }];
  }

  async has_swap(provider: ContractProvider, swapId: number): Promise<number> {
    const param = this.encodeSwapId(swapId);
    const result = await provider.get('has_swap', param);
    return result.stack.readNumber();
  }

  async get_swap(provider: ContractProvider, swapId: number): Promise<[Address, Address, bigint, bigint, number, number]> {
    const param = this.encodeSwapId(swapId);
    const result = await provider.get('get_swap', param);
    const initiator = result.stack.readAddress();
    const recipient = result.stack.readAddress();
    const tokenAmount = result.stack.readBigNumber();
    const hashLock = result.stack.readBigNumber();
    const timeLock = result.stack.readNumber();
    const isCompleted = result.stack.readNumber();
    return [initiator, recipient, tokenAmount, hashLock, timeLock, isCompleted];
  }

  // ---- Test-Only Helper ----
  // Simulate storing a swap record by sending a crafted jetton transfer notification.
  async testStoreSwap(
    provider: ContractProvider,
    via: Sender,
    initiator: Address,
    recipient: Address,
    tokenAmount: bigint,
    hashLock: bigint,
    timeLock: number
  ): Promise<any> {
    const innerBody = beginCell()
      .storeAddress(initiator)
      .storeUint(tokenAmount, 128)
      .storeAddress(recipient)
      .storeRef(
        beginCell()
          .storeUint(hashLock, 256)
          .storeUint(timeLock, 64)
          .endCell()
      )
      .endCell();
    const fullBody = beginCell()
      .storeUint(0x7362d09c, 32) // op code for jetton transfer notification
      .storeSlice(innerBody.beginParse())
      .endCell();
    return await this.sendInternalMessage(provider, via, toNano("0.05"), fullBody);
  }

  async getTransactions(provider: ContractProvider, lt?: bigint, hash?: Buffer, limit: number = 16): Promise<any[]> {
    return provider.getTransactions(this.address, lt!, hash!, limit);
  }
}
