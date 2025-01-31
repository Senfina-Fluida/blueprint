import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary,
    DictionaryValue,
} from '@ton/core';

// Define the swap structure for dictionary value
const SwapValue: DictionaryValue<{
    initiator: Address;
    recipient: Address;
    amount: bigint;
    hashLock: bigint;
    timeLock: bigint;
    isCompleted: boolean;
}> = {
    serialize: (src, builder) => {
        builder.storeAddress(src.initiator);
        builder.storeAddress(src.recipient);
        builder.storeCoins(src.amount);
        builder.storeUint(src.hashLock, 256);
        builder.storeUint(src.timeLock, 64);
        builder.storeBit(src.isCompleted);
    },
    parse: (src) => {
        return {
            initiator: src.loadAddress(),
            recipient: src.loadAddress(),
            amount: src.loadCoins(),
            hashLock: BigInt(src.loadUint(256)), // ensure we convert to bigint
            timeLock: BigInt(src.loadUint(64)),
            isCompleted: src.loadBit(),
        };
    },
};

export type FluidaConfig = {
    tgBTCAddress: Address;
    swapCounter: bigint;
    swaps: Dictionary<bigint, {
        initiator: Address;
        recipient: Address;
        amount: bigint;
        hashLock: bigint;
        timeLock: bigint;
        isCompleted: boolean;
    }>;
};

export class Fluida implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromConfig(config: FluidaConfig, code: Cell) {
        const data = beginCell()
            .storeAddress(config.tgBTCAddress)
            .storeUint(config.swapCounter, 64)
            .storeDict(config.swaps)
            .endCell();

        const init = { code, data };
        const address = contractAddress(0, init);
        return new Fluida(address, init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // Removed getHashLock method

    async sendCreateSwap(
        provider: ContractProvider,
        via: Sender,
        opts: {
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            value: bigint;
        }
    ) {
        const OP_CREATE_SWAP = 305419896n; // 0x12345678

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(OP_CREATE_SWAP, 32)
                .storeAddress(via.address!) // initiator address
                .storeAddress(opts.recipient)
                .storeCoins(opts.amount)
                .storeUint(opts.hashLock, 256)
                .storeUint(opts.timeLock, 64)
                .endCell(),
        });
    }

    async getLastSwapId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_swap_counter', []);
        
        console.log("DEBUG, result", result.stack)
        return result.stack.readBigNumber() - 1n;
    }

    async getSwap(provider: ContractProvider, swapId: bigint) {
        const result = await provider.get('get_swap', [
            { type: 'int', value: swapId },
        ]);
        const stack = result.stack;

        return {
            initiator: stack.readAddress(),
            recipient: stack.readAddress(),
            amount: stack.readBigNumber(),
            hashLock: stack.readBigNumber(),
            timeLock: stack.readBigNumber(),
            isCompleted: stack.readBoolean(),
        };
    }

    async sendCompleteSwap(
        provider: ContractProvider,
        via: Sender,
        opts: {
            swapId: bigint;
            preimage: bigint;
            value: bigint;
        }
    ) {
        const OP_COMPLETE_SWAP = 2271560481n; // 0x87654321

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(OP_COMPLETE_SWAP, 32)
                .storeUint(opts.swapId, 256)
                .storeUint(opts.preimage, 256)
                .endCell(),
        });
    }

    async sendRefundSwap(
        provider: ContractProvider,
        via: Sender,
        opts: {
            swapId: bigint;
            value: bigint;
        }
    ) {
        const OP_REFUND_SWAP = 2882400018n; // 0xabcdef12

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(OP_REFUND_SWAP, 32)
                .storeUint(opts.swapId, 256)
                .endCell(),
        });
    }

    // Helper methods for getting contract state
    async getSwapCounter(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_swap_counter', []);
        return result.stack.readBigNumber();
    }

    async getTgBTCAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_tgbtc_address', []);
        return result.stack.readAddress();
    }

    // Helper method to check if a swap exists
    async hasSwap(provider: ContractProvider, swapId: bigint): Promise<boolean> {
        const result = await provider.get('has_swap', [
            { type: 'int', value: swapId },
        ]);
        return result.stack.readBoolean();
    }
}
