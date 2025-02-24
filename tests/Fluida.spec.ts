// -----------------------------------------------------------------
// File: tests/Fluida.spec.ts
// -----------------------------------------------------------------
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell, internal } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { Address as AddressTon, beginCell as beginCellTon, toNano as tonNanoTon } from "ton";
import crypto from 'crypto';

import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import BN from "bn.js";

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

// Helper: Create a JettonWallet contract for a given owner & jetton master address
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

describe.skip('Fluida', () => {
  let fluidaCode: Cell;
  let jettonWalletCode: Cell;
  let minterContract: JettonMinter;
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let fluida: SandboxContract<Fluida>;
  let jettonMinter : SandboxContract<JettonMinter>;



  // Create an empty dictionary for swaps (using 256-bit keys).
  const emptySwaps = Dictionary.empty<bigint, {
    initiator: Address;
    recipient: Address;
    amount: bigint;
    hashLock: bigint;
    timeLock: bigint;
    isCompleted: boolean;
  }>(Dictionary.Keys.BigInt(256));

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

    console.log("ABOUT TO DEPLOY");
    console.log("MINTERContract", minterContract.address.toString());
    console.log("PARTICIPANT_ADDRESS_1", PARTICIPANT_ADDRESS_1);


    // console.log("test", Address.parse("00f56801bb0889efbf0b972af835a9319e8d1f6c35ee676f874c8bd888712f2960d3583d003e54f2aae332fc190fca2f68f97c0be09db5d2c4dd2ea3cfdb7ebe6b32c32c11900bebc2000000000000000000000000000000000000c009fbdf812dadcbf37ba457dcf5b0e36f6fc0bb5bfe4961eca8d06773e90754f998"))

    // Deploy Fluida using the JETTON MASTER address (minterContract.address).
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
    console.log('✅ Fluida contract deployed successfully.');
    console.log('✅ "should deploy" test passed.');

    console.log("about to set jetton wallet (minter) address");

    // Rename the op code for clarity.
    const OP_SET_JETTON_WALLET = 1; // Using 1 for setting the jetton wallet address

    // Build the payload to set the jetton wallet.
    const setJettonWalletPayload = beginCell()
      .storeUint(OP_SET_JETTON_WALLET, 32)
      .storeAddress(Address.parse(minterContract.address.toString())) // minter address stored in the payload
      .endCell();
    console.log('📦 Set jetton wallet payload built:', setJettonWalletPayload.toString());

    // Build and send the message to set the jetton wallet.
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

  it('should deploy and set the jetton wallet (minter) address correctly', async () => {

    // Before 

  });


  it('should accept deposits from any user when deployed with the JETTON MASTER address', async () => {
    console.log('🧪 Running deposit test with Fluida deployed using the JETTON MASTER address...');

    // 1. MINT TOKENS FOR USER1:
    const mintAmount = tonNanoTon(0.01);
    const { actionList: mintActions } = await minterContract.contract.sendInternalMessage(
      internalMessage({
        from: OWNER_ADDRESS,
        body: JettonMinter.mintBody(PARTICIPANT_ADDRESS_1, mintAmount),
      })
    );
    console.log('💸 Mint actions:', mintActions);

    // 2. DEPLOY USER1’S JETTON WALLET:
    const user1JettonWallet = await getJWalletContract(PARTICIPANT_ADDRESS_1, minterContract.address);
    // Process the mint action so that user1's wallet is credited.
    await user1JettonWallet.contract.sendInternalMessage(
      actionToMessage(minterContract.address, mintActions[0])
    );
    const { balance: initialBalance } = parseJettonWalletDetails(
      await user1JettonWallet.contract.invokeGetMethod('get_wallet_data', [])
    );
    console.log('🔎 User1 wallet balance after mint:', initialBalance);

    // 3. DEPLOY FLUIDA WITH THE JETTON MASTER ADDRESS:
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
    console.log('✅ Fluida contract deployed with JETTON MASTER address:', minterContract.address.toString());

    // 4. PREPARE DEPOSIT DETAILS:
    const depositAmount = toNano(0.004); // depositAmount as bigint (from @ton/core)
    const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
    const hashLock = computeHashLock(preimage);
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const timeLock = currentTime + 3600n;
    console.log(`💰 Deposit amount: ${depositAmount}`);
    console.log(`🔒 HashLock: ${hashLock}`);
    console.log(`⏰ TimeLock: ${timeLock}`);

    // Build the deposit notification payload using @ton/core.
    // Use PARTICIPANT_ADDRESS_1 as depositor and PARTICIPANT_ADDRESS_2 as recipient.


    console.log("minterAddress", minterContract.address);
    const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn; // 3735928559
    const depositNotificationPayload = beginCell()
      .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
      .storeUint(depositAmount, 128)
      .storeAddress(Address.parse(minterContract.address.toString())) // depositor: use minter address!
      .storeRef(
        beginCell()
          .storeAddress(Address.parse(PARTICIPANT_ADDRESS_2.toString())) // recipient: user2
          .endCell()
      )
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();
    console.log('📦 Deposit notification payload built:', depositNotificationPayload.toString());




    const storedJettonWallet = await fluida.getJettonWallet();
    console.log("Stored jetton wallet:", storedJettonWallet.toString());
    console.log("Expected jetton wallet:", minterContract.address);
    // expect(storedJettonWallet.toFriendly?()).toEqual(minterContract.address.toFriendly());


    // Build and send the deposit message directly.
    const depositMsg = internal({
      to: fluida.address,       // @ton/core Address of Fluida
      value: toNano('0.05'),      // using @ton/core toNano -> returns bigint
      body: depositNotificationPayload, // payload begins with OP_DEPOSIT_NOTIFICATION
    });
    // Rebuild the message info so that `src` is defined.
    const depositMsgFixed = {
      ...depositMsg,
      info: {
        ...depositMsg.info,
        src: Address.parse(minterContract.address.toString()),
        // src: Address.parse(PARTICIPANT_ADDRESS_2.toString()),
      }
    } as import('@ton/core').Message;
    // console.log('📨 Sending deposit notification with src =', depositMsgFixed.info.src!.toString());
    await blockchain.sendMessage(depositMsgFixed);


    // 6. VERIFY THAT THE DEPOSIT WAS PROCESSED:
    const { balance: afterBalance } = parseJettonWalletDetails(
      await user1JettonWallet.contract.invokeGetMethod('get_wallet_data', [])
    );
    console.log('🔎 User1 wallet balance after transfer:', afterBalance);

    // Verify that Fluida has registered a new swap.
    const swapCounter = await fluida.getSwapCounter();
    console.log('🔍 Fluida swap counter:', swapCounter);
    expect(swapCounter).toBe(1n);

    console.log('✅ Deposit test passed: deposit accepted and swap created using the JETTON MASTER address.');
  });

  it('should reject deposits from an unaccepted jetton wallet', async () => {
    console.log('🧪 Running deposit rejection test with an unaccepted jetton wallet...');

    // 1. MINT TOKENS FOR USER1:
    const mintAmount = tonNanoTon(0.01);
    const { actionList: mintActions } = await minterContract.contract.sendInternalMessage(
      internalMessage({
        from: OWNER_ADDRESS,
        body: JettonMinter.mintBody(PARTICIPANT_ADDRESS_1, mintAmount),
      })
    );
    console.log('💸 Mint actions:', mintActions);

    // 2. DEPLOY USER1’S WRONG JETTON WALLET:
    // Use a wrong jetton master that does not match the accepted one.
    const wrongJettonMaster = randomAddress("wrong_jetton_master");
    const user1WrongWallet = await getJWalletContract(PARTICIPANT_ADDRESS_1, wrongJettonMaster);
    // Process the mint action so that the wrong wallet is credited.
    await user1WrongWallet.contract.sendInternalMessage(
      actionToMessage(minterContract.address, mintActions[0])
    );
    const { balance: initialBalance } = parseJettonWalletDetails(
      await user1WrongWallet.contract.invokeGetMethod('get_wallet_data', [])
    );
    console.log('🔎 User1 wrong wallet balance after mint:', initialBalance);

    // 3. DEPLOY FLUIDA WITH THE ACCEPTED JETTON MASTER ADDRESS:
    // Fluida expects deposits from the accepted jetton wallet (minterContract.address).
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
    console.log('✅ Fluida contract deployed with accepted jetton wallet:', minterContract.address.toString());

    // 4. PREPARE DEPOSIT DETAILS:
    const depositAmount = toNano(0.004); // depositAmount as bigint (from @ton/core)
    const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
    const hashLock = computeHashLock(preimage);
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const timeLock = currentTime + 3600n;
    console.log(`💰 Deposit amount: ${depositAmount}`);
    console.log(`🔒 HashLock: ${hashLock}`);
    console.log(`⏰ TimeLock: ${timeLock}`);

    const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn; // 3735928559
    const depositNotificationPayload = beginCell()
      .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
      .storeUint(depositAmount, 128)
      .storeAddress(Address.parse(PARTICIPANT_ADDRESS_1.toString())) // depositor: user1
      .storeRef(
        beginCell()
          .storeAddress(Address.parse(PARTICIPANT_ADDRESS_2.toString())) // recipient: user2
          .endCell()
      )
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();
    console.log('📦 Deposit notification payload built:', depositNotificationPayload.toString());

    // 5. BUILD AND SEND THE DEPOSIT MESSAGE FROM THE WRONG WALLET:
    const depositMsg = internal({
      to: fluida.address,       // @ton/core Address of Fluida
      value: toNano('0.05'),      // using @ton/core toNano -> returns bigint
      body: depositNotificationPayload, // payload beginning with OP_DEPOSIT_NOTIFICATION
    });
    // Set src to the wrong wallet's address.
    const depositMsgFixed = {
      ...depositMsg,
      info: {
        ...depositMsg.info,
        src: Address.parse(user1WrongWallet.address.toString()),
      }
    } as import('@ton/core').Message;
    console.log('📨 Sending deposit from wrong wallet with src =', depositMsgFixed.info.src!.toString());
    await blockchain.sendMessage(depositMsgFixed);
    console.log('📤 Deposit message sent from wrong wallet.');

    // 6. VERIFY THAT THE DEPOSIT WAS NOT PROCESSED:
    const { balance: afterBalance } = parseJettonWalletDetails(
      await user1WrongWallet.contract.invokeGetMethod('get_wallet_data', [])
    );
    console.log('🔎 User1 wrong wallet balance after deposit attempt:', afterBalance);
    // Expect that the wallet balance remains unchanged.
    expect(afterBalance.toString()).toBe(initialBalance.toString());

    // Also, check that Fluida's swap counter remains zero.
    const swapCounter = await fluida.getSwapCounter();
    console.log('🔍 Fluida swap counter (should be 0):', swapCounter);
    expect(swapCounter).toBe(0n);

    console.log('✅ Deposit rejection test passed: deposit not accepted as expected.');
  });

  it('should create a swap with correct data and, when completed, transfer tokens to the recipient', async () => {
    console.log('🧪 Running swap creation and completion test...');
  
    // Redeploy Fluida with the accepted jetton master address.
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
    console.log('✅ Fluida redeployed with accepted jetton wallet:', minterContract.address.toString());
  
    // Deploy the recipient's (user2's) JettonWallet contract.
    const user2JettonWallet = await getJWalletContract(PARTICIPANT_ADDRESS_2, minterContract.address);
    console.log('✅ User2 jetton wallet deployed:', user2JettonWallet.address.toString());
  
    // Prepare deposit details.
    const depositAmount = toNano(0.005);
  
    // Generate a random 256-bit preimage and calculate its SHA256 hash lock
    const preimageBuffer = crypto.randomBytes(32);
    const preimage = BigInt('0x' + preimageBuffer.toString('hex'));
    const preimageHex = preimage.toString(16).padStart(64, '0');
    const hashBuffer = crypto.createHash('sha256')
      .update(Buffer.from(preimageHex, 'hex'))
      .digest();
    const hashLock = BigInt('0x' + hashBuffer.toString('hex'));
  
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const timeLock = currentTime + 3600n; // 1 hour later
  
    console.log(`💰 Deposit Amount: ${depositAmount}`);
    console.log(`🔑 Preimage: ${preimage}`);
    console.log(`🔒 Computed HashLock: ${hashLock}`);
    console.log(`⏰ TimeLock: ${timeLock}`);
  
    // Build deposit notification payload.
    const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn; // 3735928559
    const depositNotificationPayload = beginCell()
      .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
      .storeUint(depositAmount, 128)
      .storeAddress(Address.parse(minterContract.address.toString())) // depositor: accepted jetton wallet
      .storeRef(
        beginCell()
          .storeAddress(Address.parse(PARTICIPANT_ADDRESS_2.toString())) // recipient: user2
          .endCell()
      )
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();
    console.log('📦 Deposit notification payload built:', depositNotificationPayload.toString());
  
    // Send the deposit notification message.
    const depositMsg = internal({
      to: fluida.address,
      value: toNano('0.05'),
      body: depositNotificationPayload,
    });
    const depositMsgFixed = {
      ...depositMsg,
      info: {
        ...depositMsg.info,
        src: Address.parse(minterContract.address.toString()),
      }
    } as import('@ton/core').Message;
    await blockchain.sendMessage(depositMsgFixed);
    console.log('📨 Deposit notification sent.');
  
    // Verify that a new swap was created.
    const swapCounter = await fluida.getSwapCounter();
    console.log('🔍 Swap counter after deposit:', swapCounter);
    expect(swapCounter).toBe(1n);
  
    // Retrieve swap details (using swap id 0n).
    const swap = await fluida.getSwap(0n);
    console.log('📄 Retrieved Swap Details:');
    console.log('   Initiator:', swap.initiator.toString());
    console.log('   Recipient:', swap.recipient.toString());
    console.log('   Amount:', swap.amount.toString());
    console.log('   HashLock:', swap.hashLock.toString());
    console.log('   TimeLock:', swap.timeLock.toString());
    console.log('   IsCompleted:', swap.isCompleted);
  
    expect(swap.amount).toEqual(depositAmount);
    expect(swap.hashLock).toEqual(hashLock);
    expect(swap.timeLock).toEqual(timeLock);
    expect(swap.isCompleted).toEqual(false);
  
    // Build the complete swap payload with the generated preimage.
    const OP_COMPLETE_SWAP = 2271560481; // 0x87654321
    const completeSwapPayload = beginCell()
      .storeUint(OP_COMPLETE_SWAP, 32)
      .storeUint(0n, 256) // swapId as bigint
      .storeUint(preimage, 256)
      .endCell();
    console.log('📦 Complete swap payload built:', completeSwapPayload.toString());
  
    // Send the complete swap message.
    const completeSwapMsg = internal({
      to: fluida.address,
      value: toNano('0.05'),
      body: completeSwapPayload,
    });
    const completeSwapMsgFixed = {
      ...completeSwapMsg,
      info: {
        ...completeSwapMsg.info,
        src: Address.parse(PARTICIPANT_ADDRESS_1.toString()),
      }
    } as import('@ton/core').Message;
    await blockchain.sendMessage(completeSwapMsgFixed);
    console.log('📨 Complete swap message sent.');
  
    // Verify that the swap is now marked as completed.
    const updatedSwap = await fluida.getSwap(0n);
    console.log('🔍 Updated swap isCompleted flag:', updatedSwap.isCompleted);
    expect(updatedSwap.isCompleted).toEqual(true);
  
    // Verify that the token transfer was executed:
    // The recipient's jetton wallet (user2) should have a balance equal to the depositAmount.
    const { balance: user2Balance } = parseJettonWalletDetails(
      await user2JettonWallet.contract.invokeGetMethod('get_wallet_data', [])
    );
    console.log('💰 User2 jetton wallet balance after swap completion:', user2Balance);
    expect(user2Balance).toEqual(depositAmount);
  
    console.log('✅ Swap creation and completion test passed.');
  });
  
  

  // Further tests (e.g., completeSwap, refundSwap) can be added below.
});
