import { toNano, Dictionary, Address } from '@ton/core';
import { Fluida, FluidaConfig } from '../wrappers/Fluida';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    try {
        // 1) Compile the Fluida contract
        console.log('🔧 Compiling Fluida contract...');
        const fluidaCode = await compile('Fluida');

        // 2) Initialize an empty swaps dictionary
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

        // 3) Configure the Fluida contract
        // Here we use the sender's address as the approved jetton wallet.
        const fluidaConfig: FluidaConfig = {
            jettonWallet: Address.parse("kQDKqoHJ5sYKwB8CvPmdFSzOmDDu3BI85on_ks6WXnriIhSY"),
            swapCounter: 0n,
            swaps: emptySwaps,
        };
        console.log('📋 Configuring Fluida with:', {
            jettonWallet: fluidaConfig.jettonWallet.toString(),
            swapCounter: fluidaConfig.swapCounter.toString(),
            swaps: 'Empty Dictionary',
        });

        // 4) Deploy the Fluida contract
        console.log('🚀 Deploying Fluida contract with the above configuration...');
        const fluida = provider.open(Fluida.createFromConfig(fluidaConfig, fluidaCode));

        console.log('📤 Sending deployment transaction for Fluida...');
        await fluida.sendDeploy(provider.sender(), toNano('0.05'));
        console.log('📤 Deployment transaction sent. Awaiting confirmation...');

        await provider.waitForDeploy(fluida.address);
        console.log('✅ Fluida deployed successfully at address:', fluida.address.toString());

        // 5) Verification of Deployment
        console.log('\n--- Deployment Summary ---');
        console.log('📦 Fluida Address:', fluida.address.toString());

        const storedJettonWallet = await fluida.getJettonWallet();
        console.log('🔗 Stored jettonWallet in Fluida:', storedJettonWallet.toString());

        const swapCounter = await fluida.getSwapCounter();
        console.log('🔢 Initial Swap Counter:', swapCounter.toString());
    } catch (error) {
        console.error('❌ An error occurred during deployment:', error);
        process.exit(1);
    }
}
