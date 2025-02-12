// -----------------------------------------------------------------
// File: tests/Fluida.spec.ts
// -----------------------------------------------------------------
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { FakeJetton } from '../wrappers/FakeJetton';

describe('Fluida', () => {
    let fluidaCode: Cell;
    let fakeJettonCode: Cell;

    beforeAll(async () => {
        console.log('🔧 Compiling Fluida contract...');
        fluidaCode = await compile('Fluida');
        console.log('✅ Fluida compilation successful.');
        console.log('🔧 Compiling FakeJetton contract...');
        fakeJettonCode = await compile('FakeJetton');
        console.log('✅ FakeJetton compilation successful.');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fluida: SandboxContract<Fluida>;
    let tgBTC: SandboxContract<FakeJetton>;
    let tgBTCAddress: Address;

    /**
     * Converts a Buffer to a bigint assuming big-endian order.
     */
    function bufferToBigInt(buffer: Buffer): bigint {
        let result = 0n;
        for (const byte of buffer) {
            result = (result << 8n) | BigInt(byte);
        }
        return result;
    }

    /**
     * Computes hashLock by storing `preimage` as a 256-bit integer in a cell
     * and returning the cell's hash as a bigint.
     */
    function computeHashLock(preimage: bigint): bigint {
        const cell = beginCell().storeUint(preimage, 256).endCell();
        const hashBuffer = cell.hash(); // Returns a Buffer
        return bufferToBigInt(hashBuffer);
    }

    // Run before each test
    beforeEach(async () => {
        console.log('\n🔄 Starting beforeEach setup...');

        // Create a new blockchain instance (sandbox)
        blockchain = await Blockchain.create();

        // Initialize the deployer treasury
        deployer = await blockchain.treasury('deployer');
        console.log(`👤 Deployer address: ${deployer.address}`);

        // Create a FakeJetton contract for tgBTC (jetton master) using our wrapper.
        tgBTC = blockchain.openContract(
            FakeJetton.createFromConfig({ initialSupply: toNano('1000.0') }, fakeJettonCode)
        );
        tgBTCAddress = tgBTC.address;
        console.log(`💰 tgBTC (FakeJetton) address: ${tgBTCAddress}`);

        // Fund tgBTC with some TON from deployer (if needed for processing)
        console.log(`💸 Sending 10 TON from deployer to tgBTC (${tgBTCAddress})...`);
        await deployer.getSender().send({
            to: tgBTCAddress,
            value: toNano('10.0')
        });
        console.log('💸 Funds sent to tgBTC successfully.');

        // Create an empty dictionary for swaps using 256-bit keys.
        const emptySwaps = Dictionary.empty<bigint, {
            initiator: Address;
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            isCompleted: boolean;
        }>(Dictionary.Keys.BigInt(256));

        // Initialize Fluida contract from config, using tgBTCAddress as the jetton master address.
        fluida = blockchain.openContract(
            Fluida.createFromConfig(
                {
                    tgBTCAddress,
                    swapCounter: 0n,
                    swaps: emptySwaps,
                },
                fluidaCode
            )
        );

        // Deploy Fluida contract
        await fluida.sendDeploy(deployer.getSender(), toNano('0.05'));
        console.log('✅ Fluida contract deployed successfully.');

        console.log('🔄 beforeEach setup completed.\n');
    });

    it('should deploy', async () => {
        console.log('✅ Running "should deploy" test...');
        // If we got here without an error, deployment worked.
        console.log('✅ "should deploy" test passed.');
    });

    it('should create new swap and update jetton balances accordingly', async () => {
        console.log('🧪 Running "should create new swap" test with balance checks...');

        // Use a treasury wallet as the sender (acting as both initiator and recipient)
        const sender = await blockchain.treasury('initiator');
        console.log(`👤 Sender address: ${sender.address}`);

        // Cast tgBTC to FakeJetton so we can call getBalance.
        const fakeJetton = tgBTC as unknown as FakeJetton;

        // Get a provider instance using tgBTC's address.
        const providerInstance = blockchain.provider(tgBTCAddress);

        // Get initial jetton token balances for the sender and the Fluida contract.
        const initialUserBalance = await fakeJetton.getBalance(providerInstance, sender.address);
        const initialContractBalance = await fakeJetton.getBalance(providerInstance, fluida.address);

        console.log(`🔍 Initial sender token balance: ${initialUserBalance}`);
        console.log(`🔍 Initial Fluida contract token balance: ${initialContractBalance}`);

        const amount = toNano('1.0'); // Token amount to transfer
        // Some arbitrary 256-bit preimage
        const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
        const hashLock = computeHashLock(preimage);
        console.log(`🔒 Computed hashLock: ${hashLock}`);

        // Make a timeLock for 1 hour in the future.
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const timeLock = currentTime + 3600n;

        // Create the swap (using sender's address for both initiator and recipient)
        console.log('📤 Sending CreateSwap transaction...');
        await fluida.sendCreateSwap(sender.getSender(), {
            amount,
            hashLock,
            timeLock,
            value: toNano('1.05'),
        });
        console.log('📤 CreateSwap transaction sent successfully.');

        // Verify by reading the swap counter and swap details.
        console.log('🔍 Verifying swap creation by retrieving the swap counter...');
        const swapCounter = await fluida.getSwapCounter();
        const swapId = swapCounter - 1n; // Last swap ID is counter - 1
        console.log(`🔍 Retrieved swap ID: ${swapId}`);

        console.log('🔍 Retrieving swap details...');
        const swap = await fluida.getSwap(swapId);
        console.log('🔍 Swap details:', swap);

        // Basic assertions on the swap record.
        expect(swap.initiator.equals(sender.address)).toBe(true);
        expect(swap.recipient.equals(sender.address)).toBe(true);
        expect(swap.amount).toBe(amount);
        expect(swap.hashLock).toBe(hashLock);
        expect(swap.timeLock).toBe(timeLock);
        expect(swap.isCompleted).toBe(false);

        // Check token balances after swap creation.
        const finalUserBalance = await fakeJetton.getBalance(providerInstance, sender.address);
        const finalContractBalance = await fakeJetton.getBalance(providerInstance, fluida.address);

        console.log(`🔍 Final sender token balance: ${finalUserBalance}`);
        console.log(`🔍 Final Fluida contract token balance: ${finalContractBalance}`);

        // Assert that the sender's token balance decreased by the swap amount...
        expect(finalUserBalance).toBe(initialUserBalance - amount);
        // ...and the Fluida contract's token balance increased by that same amount.
        expect(finalContractBalance).toBe(initialContractBalance + amount);

        console.log('🧪 "should create new swap" test passed.');
    });

    // Further tests (e.g., completeSwap) can be added below.
});
