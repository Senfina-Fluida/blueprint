import { toNano, Dictionary, Address } from '@ton/core';
import { Fluida, FluidaConfig } from '../wrappers/Fluida';
import { TestToken, TestTokenConfig } from '../wrappers/TestToken';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    try {
        // 1) Compile both contracts
        console.log('🔧 Compiling Fluida contract...');
        const fluidaCode = await compile('Fluida');
        // console.log('✅ Fluida contract compiled successfully. Code size:', fluidaCode.code.length);

        console.log('🔧 Compiling TestToken contract...');
        const testTokenCode = await compile('TestToken');
        // console.log('✅ TestToken contract compiled successfully. Code size:', testTokenCode.code.length);

        // 2) Deploy the TestToken contract first
        const testTokenConfig: TestTokenConfig = {
            owner: provider.sender().address!,
            totalSupply: 0n, // Start with 0, we'll mint later
        };

        console.log('🚀 Deploying TestToken with config:', testTokenConfig);
        const testToken = provider.open(TestToken.createFromConfig(testTokenConfig, testTokenCode));

        console.log('📤 Sending deployment transaction for TestToken...');
        await testToken.sendDeploy(provider.sender(), toNano('0.05'));
        console.log('📤 Deployment transaction sent. Awaiting confirmation...');

        await provider.waitForDeploy(testToken.address);
        console.log('✅ TestToken deployed successfully at address:', testToken.address.toString());

        // 3) Mint initial test tokens
        console.log('🪙 Minting initial test tokens...');
        const mintAmount = toNano('1000'); // Mint 1000 test tokens
        console.log(`📤 Sending mint transaction: ${mintAmount.toString()} tokens to ${provider.sender().address!.toString()}`);

        await testToken.sendMint(provider.sender(), {
            to: provider.sender().address!,
            amount: mintAmount,
            value: toNano('0.05'),
        });
        console.log('✅ Mint transaction sent successfully.');

        // 4) Initialize an empty swaps dictionary
        console.log('📚 Initializing empty swaps dictionary...');
        const emptySwaps = Dictionary.empty<bigint, {
            initiator: Address;
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            isCompleted: boolean;
        }>(Dictionary.Keys.BigInt(256));
        console.log('✅ Empty swaps dictionary initialized.');

        // 5) Configure the Fluida contract
        const fluidaConfig: FluidaConfig = {
            tgBTCAddress: testToken.address, // Address of the deployed TestToken
            swapCounter: 0n,
            swaps: emptySwaps,
        };
        console.log('📋 Configuring Fluida with:', {
            tgBTCAddress: fluidaConfig.tgBTCAddress.toString(),
            swapCounter: fluidaConfig.swapCounter.toString(),
            swaps: 'Empty Dictionary',
        });

        // 6) Deploy the Fluida contract
        console.log('🚀 Deploying Fluida contract with the above configuration...');
        const fluida = provider.open(Fluida.createFromConfig(fluidaConfig, fluidaCode));

        console.log('📤 Sending deployment transaction for Fluida...');
        await fluida.sendDeploy(provider.sender(), toNano('0.05'));
        console.log('📤 Deployment transaction sent. Awaiting confirmation...');

        await provider.waitForDeploy(fluida.address);
        console.log('✅ Fluida deployed successfully at address:', fluida.address.toString());

        // 7) Verification of Deployments
        console.log('\n--- Deployment Summary ---');
        console.log('📦 TestToken Address:', testToken.address.toString());
        console.log('📦 Fluida Address:', fluida.address.toString());

        const tokenBalance = await testToken.getBalance(provider.sender().address!);
        console.log('💰 Initial TestToken Balance:', tokenBalance.toString());

        const storedTgBtc = await fluida.getTgBTCAddress();
        console.log('🔗 Stored tgBTCAddress in Fluida:', storedTgBtc.toString());

        const swapCounter = await fluida.getSwapCounter();
        console.log('🔢 Initial Swap Counter:', swapCounter.toString());

    } catch (error) {
        console.error('❌ An error occurred during deployment:', error);
        process.exit(1); // Exit with failure
    }
}
