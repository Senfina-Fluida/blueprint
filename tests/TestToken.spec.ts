import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TestToken } from '../wrappers/TestToken';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TestToken', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TestToken');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let testToken: SandboxContract<TestToken>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        testToken = blockchain.openContract(TestToken.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await testToken.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: testToken.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and testToken are ready to use
    });
});
