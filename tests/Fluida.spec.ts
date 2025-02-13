// -----------------------------------------------------------------
// File: tests/Fluida.spec.ts
// -----------------------------------------------------------------
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell, internal } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe.only('Fluida', () => {
    let fluidaCode: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        console.log('🔧 Compiling Fluida contract...');
        fluidaCode = await compile('Fluida');
        console.log('✅ Fluida compilation successful.');
        console.log('🔧 Compiling JettonWallet contract...');
        jettonWalletCode = await compile('JettonWallet');
        console.log('✅ JettonWallet compilation successful.');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fluida: SandboxContract<Fluida>;
    let jettonWallet: SandboxContract<JettonWallet>;
    let jettonWalletAddress: Address;

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

        // Deploy the JettonWallet contract.
        // For testing, we deploy the wallet with a temporary configuration.
        // In production the wallet’s owner should be set to the Fluida contract address.
        jettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    balance: toNano('0.0'),
                    owner: deployer.address,       // temporary owner
                    jettonMaster: deployer.address, // example configuration
                },
                jettonWalletCode
            )
        );
        jettonWalletAddress = jettonWallet.address;
        console.log(`💰 JettonWallet address: ${jettonWalletAddress}`);

        // Deploy the JettonWallet contract.
        await jettonWallet.sendDeploy(deployer.getSender(), toNano('0.05'));
        console.log('✅ JettonWallet deployed successfully.');

        // Create an empty dictionary for swaps using 256-bit keys.
        const emptySwaps = Dictionary.empty<bigint, {
            initiator: Address;
            recipient: Address;
            amount: bigint;
            hashLock: bigint;
            timeLock: bigint;
            isCompleted: boolean;
        }>(Dictionary.Keys.BigInt(256));

        // Initialize Fluida contract from config using the JettonWallet address.
        fluida = blockchain.openContract(
            Fluida.createFromConfig(
                {
                    jettonWallet: jettonWalletAddress,
                    swapCounter: 0n,
                    swaps: emptySwaps,
                },
                fluidaCode
            )
        );

        // Deploy Fluida contract.
        await fluida.sendDeploy(deployer.getSender(), toNano('0.05'));
        console.log('✅ Fluida contract deployed successfully.');

        console.log('🔄 beforeEach setup completed.\n');
    });

    it('should deploy', async () => {
        console.log('✅ Running "should deploy" test...');
        // If we got here without an error, deployment worked.
        console.log('✅ "should deploy" test passed.');
    });

    it('should process deposit notification and create new swap', async () => {
        console.log('🧪 Running "should process deposit notification and create new swap" test...');

        // Use a treasury wallet as the depositor for the deposit notification payload.
        // In production, the depositor's tokens would be forwarded by the JettonWallet.
        const sender = await blockchain.treasury('initiator');
        console.log(`👤 Sender address (depositor): ${sender.address}`);

        // Token amount to deposit.
        const amount = toNano('1.0');

        // Some arbitrary 256-bit preimage.
        const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
        const hashLock = computeHashLock(preimage);
        console.log(`🔒 Computed hashLock: ${hashLock}`);

        // Set a timeLock for 1 hour in the future.
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const timeLock = currentTime + 3600n;

        // Build a deposit notification payload.
        // The expected layout is:
        //   [ op code (32 bits), depositAmount (128-bit), depositor address,
        //     hashLock (256-bit), timeLock (64-bit) ]
        const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn;
        const depositNotificationPayload = beginCell()
            .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
            .storeUint(amount, 128)
            .storeAddress(sender.address) // depositor address
            .storeUint(hashLock, 256)
            .storeUint(timeLock, 64)
            .endCell();

        // Build the internal message that the JettonWallet will send.
        const depositMsg = internal({
            to: fluida.address,
            value: toNano('0.05'),
            body: depositNotificationPayload,
        }) as any;

        // Patch the message so that its info.src is set to the JettonWallet's address.
        depositMsg.info.src = jettonWalletAddress;

        // Send the message.
        await blockchain.sendMessage(depositMsg);
        console.log('📤 Deposit notification sent successfully.');

        // Verify that a new swap record has been created.
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

        console.log('🧪 "should process deposit notification and create new swap" test passed.');
    });

    // Further tests (e.g., completeSwap, refundSwap) can be added below.
});
