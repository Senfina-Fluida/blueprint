import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type TestTokenConfig = {
    owner: Address;
    totalSupply: bigint;
};

export function testTokenConfigToCell(config: TestTokenConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeAddress(config.owner)
        .storeDict(null)
        .endCell();
}

export class TestToken implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromConfig(config: TestTokenConfig, code: Cell) {
        const data = testTokenConfigToCell(config);
        const init = { code, data };
        return new TestToken(contractAddress(0, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            to: Address;
            amount: bigint;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(1, 32) // op = 1 for mint
                .storeAddress(opts.to)
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            to: Address;
            amount: bigint;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(2, 32) // op = 2 for transfer
                .storeAddress(opts.to)
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async getBalance(provider: ContractProvider, address: Address) {
        const result = await provider.get('balance', [
            { type: 'slice', cell: beginCell().storeAddress(address).endCell() },
        ]);
        return result.stack.readBigNumber();
    }

    async getTotalSupply(provider: ContractProvider) {
        const result = await provider.get('get_total_supply', []);
        return result.stack.readBigNumber();
    }
}