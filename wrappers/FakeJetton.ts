// File: wrappers/FakeJetton.ts
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender } from '@ton/core';

export type FakeJettonConfig = {
    initialSupply: bigint;
};

export class FakeJetton implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromConfig(config: FakeJettonConfig, code: Cell): FakeJetton {
        const data = beginCell()
            .storeUint(config.initialSupply, 256)  // store the initial token supply
            .endCell();
        const init = { code, data };
        const address = contractAddress(0, init);
        return new FakeJetton(address, init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: 1, // or SendMode.PAY_GAS_SEPARATELY if you prefer
            body: beginCell().endCell(),
        });
    }

    // This method simulates a jetton transfer message.
    // Message layout:
    //   [ dummyOpCode (32 bits),
    //     tokenSender address,
    //     tokenAmount (128-bit),
    //     remainingGasTo address,
    //     ref cell: { hashLock (256-bit), timeLock (64-bit) } ]
    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            value: bigint;
        }
    ): Promise<void> {
        const dummyOpCode = 0n;
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(dummyOpCode, 32)
                .storeAddress(this.address) // tokenSender is the FakeJetton address
                .storeUint(opts.amount, 128)
                .storeAddress(opts.recipient)
                .storeRef(
                    beginCell()
                        .storeUint(opts.hashLock, 256)
                        .storeUint(opts.timeLock, 64)
                        .endCell()
                )
                .endCell(),
        });
    }

    // NEW: getBalance method returns the token balance for a given owner address.
    async getBalance(provider: ContractProvider, owner: Address): Promise<bigint> {
        // For addresses, use the "slice" type.
        const res = await provider.get('get_balance', [
            { type: 'slice', value: owner.toString() } as any
        ]);
        return res.stack.readBigNumber();
    }
}
