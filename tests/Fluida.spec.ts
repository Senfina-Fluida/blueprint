// -----------------------------------------------------------------
// File: tests/Fluida.spec.ts
// -----------------------------------------------------------------
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Fluida', () => {
    let code: Cell;

    beforeAll(async () => {
        console.log('🔧 Compiling Fluida contract...');
        code = await compile('Fluida'); 
        console.log('✅ Compilation successful.');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fluida: SandboxContract<Fluida>;
    let tgBTC: SandboxContract<TreasuryContract>;
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
        const hashBuffer = cell.hash(); // Buffer
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

        // Create a treasury for tgBTC
        tgBTC = await blockchain.treasury('tgBTC');
        tgBTCAddress = tgBTC.address;
        console.log(`💰 tgBTC address: ${tgBTCAddress}`);

        // Fund tgBTC with some TON from deployer
        console.log(`💸 Sending 10 TON from deployer to tgBTC (${tgBTCAddress})...`);
        await deployer.getSender().send({
            to: tgBTCAddress,
            value: toNano('10.0')
        });
        console.log('💸 Funds sent to tgBTC successfully.');

        // Create an empty dictionary for swaps
        // For a 256-bit key, use Dictionary.Keys.BigInt(256)
        const emptySwaps = Dictionary.empty<bigint, {
            initiator: Address;
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            isCompleted: boolean;
        }>(Dictionary.Keys.BigInt(256));

        // Initialize Fluida contract from config
        fluida = blockchain.openContract(
            Fluida.createFromConfig(
                {
                    tgBTCAddress,
                    swapCounter: 0n,
                    swaps: emptySwaps, // use the dictionary directly instead of .cell
                },
                code
            )
        );

        // Deploy Fluida contract
        await fluida.sendDeploy(deployer.getSender(), toNano('0.05'));
        console.log('✅ Fluida contract deployed successfully.');

        console.log('🔄 beforeEach setup completed.\n');
    });

    it('should deploy', async () => {
        console.log('✅ Running "should deploy" test...');
        // If we got here without an error, deployment worked
        console.log('✅ "should deploy" test passed.');
    });

    it('should create new swap', async () => {
        console.log('🧪 Running "should create new swap" test...');

        // We'll use new treasury wallets as initiator and recipient
        const initiator = await blockchain.treasury('initiator');
        const recipient = await blockchain.treasury('recipient');

        console.log(`👤 Initiator address: ${initiator.address}`);
        console.log(`👥 Recipient address: ${recipient.address}`);

        const amount = toNano('1.0');
        // Some arbitrary 256-bit preimage
        const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn; 
        const hashLock = computeHashLock(preimage);
        console.log(`🔒 Computed hashLock: ${hashLock}`);

        // Make a timeLock for 1 hour in the future
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const timeLock = currentTime + 3600n;

        // Create the swap
        console.log('📤 Sending CreateSwap transaction...');
        await fluida.sendCreateSwap(initiator.getSender(), {
            recipient: recipient.address,
            amount,
            hashLock,
            timeLock,
            value: toNano('1.05'),
        });
        console.log('📤 CreateSwap transaction sent successfully.');

        // Verify by reading the last swap ID
        console.log('🔍 Verifying swap creation by retrieving the last swap ID...');
        const swapId = await fluida.getLastSwapId();
        console.log(`🔍 Retrieved swap ID: ${swapId}`);

        // Get swap details
        console.log('🔍 Retrieving swap details...');
        const swap = await fluida.getSwap(swapId);
        console.log('🔍 Swap details:', swap);

        // Basic assertions
        expect(swap.initiator.equals(initiator.address)).toBe(true);
        expect(swap.recipient.equals(recipient.address)).toBe(true);
        expect(swap.amount).toBe(amount);
        expect(swap.hashLock).toBe(hashLock);
        expect(swap.timeLock).toBe(timeLock);
        expect(swap.isCompleted).toBe(false);

        console.log('🧪 "should create new swap" test passed.');
    });

    it('should complete a swap', async () => {
        console.log('🧪 Running "should complete a swap" test...');

        const initiator = await blockchain.treasury('initiator');
        const recipient = await blockchain.treasury('recipient');

        const amount = toNano('1.0');
        // Another arbitrary preimage
        const preimage = 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890n;
        const hashLock = computeHashLock(preimage);

        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const timeLock = currentTime + 3600n;

        // 1) Create Swap first
        console.log('📤 Sending CreateSwap transaction...');
        await fluida.sendCreateSwap(initiator.getSender(), {
            recipient: recipient.address,
            amount,
            hashLock,
            timeLock,
            value: toNano('0.05'),
        });
        console.log('📤 CreateSwap transaction sent successfully.');

        // 2) Retrieve swapId (should be 0 if it's the first swap)
        const swapId = await fluida.getLastSwapId();
        console.log(`🔍 Created Swap ID: ${swapId}`);

        // 3) Complete the swap
        console.log('📤 Sending CompleteSwap transaction...');
        await fluida.sendCompleteSwap(recipient.getSender(), {
            swapId,
            preimage,
            value: toNano('0.05'),
        });
        console.log('📤 CompleteSwap transaction sent successfully.');

        // 4) Verify the swap is now "completed"
        console.log('🔍 Retrieving updated swap details...');
        const swap = await fluida.getSwap(swapId);
        console.log('🔍 Swap details after completion:', swap);

        expect(swap.isCompleted).toBe(true);

        console.log('🧪 "should complete a swap" test passed.');
    });
});
