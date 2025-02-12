import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FakeJetton } from '../wrappers/FakeJetton';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('FakeJetton', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('FakeJetton');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fakeJetton: SandboxContract<FakeJetton>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        fakeJetton = blockchain.openContract(FakeJetton.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await fakeJetton.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: fakeJetton.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fakeJetton are ready to use
    });
});
