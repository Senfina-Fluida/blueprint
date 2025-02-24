import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell, internal } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { Address as AddressTon, beginCell as beginCellTon, toNano as tonNanoTon } from "ton";
import crypto from 'crypto';

import '@ton/test-utils';
import { compile } from '@ton/blueprint';

// Jetton stuff
import { internalMessage, randomAddress } from "./helpers";
import { JettonMinter } from "./lib/jetton-minter";
import { actionToMessage } from "./lib/utils";
import { JettonWallet } from "./lib/jetton-wallet";
import { parseJettonDetails, parseJettonWalletDetails } from "./lib/jetton-utils";

import {
    JETTON_WALLET_CODE,
    JETTON_MINTER_CODE,
    jettonMinterInitData,
} from "../build/jetton-minter.deploy";

// Test addresses
const OWNER_ADDRESS = randomAddress("owner");
const PARTICIPANT_ADDRESS_1 = randomAddress("participant_1");
const PARTICIPANT_ADDRESS_2 = randomAddress("participant_2");

// Helper: Create a JettonWallet contract
const getJWalletContract = async (
    walletOwnerAddress: AddressTon,
    jettonMasterAddress: AddressTon
): Promise<JettonWallet> =>
    await JettonWallet.create(
        JETTON_WALLET_CODE,
        beginCellTon()
            .storeCoins(0)
            .storeAddress(walletOwnerAddress)
            .storeAddress(jettonMasterAddress)
            .storeRef(JETTON_WALLET_CODE)
            .endCell()
    );

describe('Fluida', () => {
    let fluidaCode: Cell;
    let jettonWalletCode: Cell;
    let minterContract: JettonMinter;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fluida: SandboxContract<Fluida>;

    // Create an empty dictionary for swaps
    const emptySwaps = Dictionary.empty<bigint, {
        initiator: Address;
        recipient: Address;
        amount: bigint;
        hashLock: bigint;
        timeLock: bigint;
        isCompleted: boolean;
    }>(Dictionary.Keys.BigInt(256));

    beforeAll(async () => {
        console.log('🔧 Compiling Fluida contract...');
        fluidaCode = await compile('Fluida');
        console.log('✅ Fluida compilation successful.');
        console.log('🔧 Compiling JettonWallet contract...');
        jettonWalletCode = await compile('JettonWallet');
        console.log('✅ JettonWallet compilation successful.');
    });

    beforeEach(async () => {
        console.log('\n🔄 Starting beforeEach setup...');
        blockchain = await Blockchain.create();

        const dataCell = jettonMinterInitData(OWNER_ADDRESS, {
            name: "MY_JETTON",
            symbol: "MJT",
            description: "My Long Description".repeat(100)
        });
        minterContract = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;

        deployer = await blockchain.treasury('deployer');
        console.log(`👤 Deployer address: ${deployer.address}`);

        const call = await minterContract.contract.invokeGetMethod("get_jetton_data", []);
        const { totalSupply, address, metadata } = parseJettonDetails(call);

        // Deploy Fluida using the JETTON MASTER address
        fluida = blockchain.openContract(
            Fluida.createFromConfig(
                {
                    jettonWallet: Address.parse(minterContract.address.toString()),
                    swapCounter: 0n,
                    swaps: emptySwaps,
                },
                fluidaCode
            )
        );
        await fluida.sendDeploy(deployer.getSender(), toNano('0.05'));

        const OP_SET_JETTON_WALLET = 1;
        const setJettonWalletPayload = beginCell()
            .storeUint(OP_SET_JETTON_WALLET, 32)
            .storeAddress(Address.parse(minterContract.address.toString()))
            .endCell();

        const setJettonWalletMsg = internal({
            to: fluida.address,
            value: toNano('0.05'),
            body: setJettonWalletPayload,
        });
        const setJettonWalletMsgFixed = {
            ...setJettonWalletMsg,
            info: {
                ...setJettonWalletMsg.info,
                src: Address.parse(PARTICIPANT_ADDRESS_1.toString()),
            }
        } as import('@ton/core').Message;
        await blockchain.sendMessage(setJettonWalletMsgFixed);
    });

    it('should transfer jettons with deposit notification payload', async () => {
        console.log('🧪 Running jetton transfer test...');

        // 1. MINT TOKENS FOR USER1
        const mintAmount = tonNanoTon(10);
        const { actionList: mintActions } = await minterContract.contract.sendInternalMessage(
            internalMessage({
                from: OWNER_ADDRESS,
                body: JettonMinter.mintBody(PARTICIPANT_ADDRESS_1, mintAmount),
            })
        );
        console.log('💸 Mint actions:', mintActions);

        // 2. DEPLOY USER1'S JETTON WALLET
        const user1JettonWallet = await getJWalletContract(PARTICIPANT_ADDRESS_1, minterContract.address);
        await user1JettonWallet.contract.sendInternalMessage(
            actionToMessage(minterContract.address, mintActions[0])
        );
        const { balance: initialBalance } = parseJettonWalletDetails(
            await user1JettonWallet.contract.invokeGetMethod('get_wallet_data', [])
        );
        console.log('🔎 User1 wallet initial balance:', initialBalance);

        // 3. PREPARE TRANSFER PARAMETERS
        const transferAmount = toNano('5');
        const forwardTonAmount = toNano('0.02');
        const depositAmount = toNano('1');
        const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
        const hashLock = computeHashLock(preimage);
        const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // 4. BUILD DEPOSIT NOTIFICATION PAYLOAD
        const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn;
        const depositNotificationPayload = beginCell()
            .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
            .storeUint(depositAmount, 128)
            .storeAddress(Address.parse(minterContract.address.toString()))
            .storeRef(
                beginCell()
                    .storeAddress(Address.parse(PARTICIPANT_ADDRESS_2.toString()))
                    .endCell()
            )
            .storeUint(hashLock!, 256)
            .storeUint(timeLock, 64)
            .endCell();

        // 5. BUILD JETTON TRANSFER MESSAGE
        const transferMessage = beginCell()
            .storeUint(0x0f8a7ea5, 32)           // transfer op code
            .storeUint(0, 64)                    // query id
            .storeCoins(transferAmount)
            .storeAddress(fluida.address)
            .storeAddress(fluida.address)
            .storeBit(0)
            .storeCoins(forwardTonAmount)
            .storeBit(1)
            .storeRef(depositNotificationPayload)
            .endCell();

        // 6. SEND THE TRANSFER
        // 6. SEND THE TRANSFER
        const transferMsg = internal({
            to: Address.parse(user1JettonWallet.address.toString()),
            value: toNano('0.1'),
            body: transferMessage,
        });

        console.log("#######TEST")

        const transferMsgFixed = {
            ...transferMsg,
            info: {
                ...transferMsg.info,
                src: Address.parse(PARTICIPANT_ADDRESS_1.toString()),
            }
        } as import('@ton/core').Message;

        await blockchain.sendMessage(transferMsgFixed);


        // 7. VERIFY RESULTS
        const { balance: finalBalance } = parseJettonWalletDetails(
            await user1JettonWallet.contract.invokeGetMethod('get_wallet_data', [])
        );
        console.log('🔎 User1 wallet final balance:', finalBalance);
        // expect(finalBalance.toString()).toBe((initialBalance - transferAmount).toString());

        // Verify swap creation
        const swapCounter = await fluida.getSwapCounter();
        console.log('🔍 Swap counter after transfer:', swapCounter);
        expect(swapCounter).toBe(1n);

        // Verify swap details
        const swap = await fluida.getSwap(0n);
        console.log('📄 Swap Details:');
        console.log('   Amount:', swap.amount.toString());
        console.log('   HashLock:', swap.hashLock.toString());
        console.log('   TimeLock:', swap.timeLock.toString());
        console.log('   IsCompleted:', swap.isCompleted);

        expect(swap.amount).toEqual(depositAmount);
        expect(swap.hashLock).toEqual(hashLock);
        expect(swap.timeLock).toEqual(timeLock);
        expect(swap.isCompleted).toEqual(false);

        console.log('✅ Jetton transfer test passed successfully');
    });
});

function computeHashLock(preimage: bigint): bigint {
    const cell = beginCell().storeUint(preimage, 256).endCell();
    const hashBuffer = cell.hash(); // Returns a Buffer
    return bufferToBigInt(hashBuffer);
}

function bufferToBigInt(buffer: Buffer): bigint {
    let result = 0n;
    for (const byte of buffer) {
        result = (result << 8n) | BigInt(byte);
    }
    return result;
}