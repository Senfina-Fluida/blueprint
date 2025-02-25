import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, toNano, Address, SendMode } from '@ton/core';
import { Fluida, OP_INITIALIZE, OP_COMPLETE_SWAP } from '../wrappers/Fluida';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { calculateHashLock } from '../scripts/utils/hashHelper';

describe('Fluida Contract Tests', () => {
  let blockchain: Blockchain;
  let treasury: SandboxContract<TreasuryContract>;
  let recipient: SandboxContract<TreasuryContract>;

  let fluida: SandboxContract<Fluida>;
  let fluidaCode: Cell;
  let jettonWalletCode: Cell;
  
  // Define constants
  const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn;
  const JETTON_TRANSFER_OP = 0x0f8a7ea5; // op code for jetton transfer

  // For direct jetton handling
  let jettonWallet: SandboxContract<JettonWallet>;
  let jettonWalletAddress: Address;

  // Load the compiled contract cells from file
  beforeAll(async () => {
    fluidaCode = await compile('Fluida');
    jettonWalletCode = await compile('JettonWallet');
  });

  // Create a fresh blockchain instance and deploy the contracts before each test
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    treasury = await blockchain.treasury('deployer');
    recipient = await blockchain.treasury('recipient');
    
    // Deploy the Fluida contract
    fluida = blockchain.openContract(Fluida.createFromConfig({}, fluidaCode));
    await fluida.sendDeploy(treasury.getSender(), toNano("0.05"));
    
    // Deploy a mock JettonWallet contract
    jettonWallet = blockchain.openContract(JettonWallet.createFromConfig({
      master: treasury.address,
      owner: treasury.address,
      jettonAmount: toNano('100') // Give the wallet 100 jettons
    }, jettonWalletCode));
    
    await jettonWallet.sendDeploy(treasury.getSender(), toNano("0.05"));
    jettonWalletAddress = jettonWallet.address;
    
    // Initialize Fluida with the jetton wallet address
    const initBody = beginCell()
      .storeUint(OP_INITIALIZE, 32)
      .storeAddress(jettonWalletAddress)
      .endCell();
    
    await fluida.sendInternalMessage(treasury.getSender(), toNano("0.05"), initBody);
  });

  it('should initialize storage correctly with jetton wallet', async () => {
    // Verify via getters that the Fluida contract has the correct wallet
    const storedWallet = await fluida.get_jetton_wallet();
    expect(storedWallet.toString()).toEqual(jettonWalletAddress.toString());

    const swapCounter = await fluida.get_swap_counter();
    expect(Number(swapCounter)).toEqual(0);
  });

  // it('should directly create and complete a swap without jetton transfer', async () => {
  //   // In this test, we'll skip the jetton transfer part and just send a direct deposit notification
  //   // to simulate the process directly
    
  //   // Setup swap parameters
  //   const initiator = treasury.address;
  //   const recipientAddr = recipient.address;
  //   const tokenAmount = toNano("1");
  //   const preimage = BigInt('0x' + '123456789'.padStart(64, '0')); 
  //   const hashLock = calculateHashLock(preimage);
  //   const currentTime = Math.floor(Date.now() / 1000);
  //   const timeLock = BigInt(currentTime + 3600);
    
  //   // Create the extra cell for hashLock and timeLock
  //   const extraCell = beginCell()
  //     .storeUint(hashLock, 256)
  //     .storeUint(timeLock, 64)
  //     .endCell();
    
  //   // Create the deposit notification payload directly
  //   const depositNotificationPayload = beginCell()
  //     .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
  //     .storeUint(tokenAmount, 128)
  //     .storeAddress(initiator)
  //     .storeRef(
  //       beginCell()
  //         .storeAddress(recipientAddr)
  //         .endCell()
  //     )
  //     .storeRef(extraCell)
  //     .endCell();
    
  //   // Send the deposit notification directly to Fluida
  //   await fluida.sendInternalMessage(
  //     treasury.getSender(),
  //     toNano("0.1"),
  //     depositNotificationPayload
  //   );
    
  //   // Verify the swap was created
  //   const swapCounter = await fluida.get_swap_counter();
  //   expect(Number(swapCounter)).toEqual(1);
    
  //   // Get the swap data to verify it was stored correctly
  //   const swapData = await fluida.get_swap(0);
  //   expect(swapData[0].toString()).toEqual(initiator.toString());
  //   expect(swapData[1].toString()).toEqual(recipientAddr.toString());
  //   expect(swapData[2].toString()).toEqual(tokenAmount.toString());
  //   expect(swapData[3].toString()).toEqual(hashLock.toString());
  //   expect(swapData[4].toString()).toEqual(timeLock.toString());
  //   expect(Number(swapData[5])).toEqual(0);
    
  //   // Now complete the swap with the correct preimage
  //   const completeBody = beginCell()
  //   .storeUint(OP_COMPLETE_SWAP, 32)
  //     .storeUint(0, 256)        // swapId = 0
  //     .storeUint(preimage, 256) // correct preimage
  //     .endCell();
    
  //   // Send the complete message from the recipient
  //   const result = await fluida.sendInternalMessage(
  //     recipient.getSender(), 
  //     toNano("0.2"), 
  //     completeBody
  //   );
    
  //   // Verify that the swap is marked as completed
  //   const updatedSwapData = await fluida.get_swap(0);
  //   expect(Number(updatedSwapData[5])).toEqual(1);
    
  //   // Verify there were outgoing transactions
  //   expect(result.transactions.length).toBeGreaterThan(1);
  // });
  
  // it('should create swap via createSwap script approach and complete it', async () => {
  //   // This test attempts to closely mimic what the createSwap.ts script does
    
  //   // Setup swap parameters
  //   const initiator = treasury.address;
  //   const recipientAddr = recipient.address;
  //   const tokenAmount = toNano("0.05");  // same as in createSwap.ts
  //   const preimage = BigInt('0x' + '123456789'.padStart(64, '0'));
  //   const hashLock = calculateHashLock(preimage);
  //   const currentTime = Math.floor(Date.now() / 1000);
  //   const timeLock = BigInt(currentTime + 3600);
    
  //   // Create the extra cell for hashLock and timeLock
  //   const extraCell = beginCell()
  //     .storeUint(hashLock, 256)
  //     .storeUint(timeLock, 64)
  //     .endCell();
    
  //   // Create the deposit notification payload like in createSwap.ts
  //   const depositNotificationPayload = beginCell()
  //     .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
  //     .storeUint(tokenAmount, 128)
  //     .storeAddress(initiator)
  //     .storeRef(
  //       beginCell()
  //         .storeAddress(recipientAddr)
  //         .endCell()
  //     )
  //     .storeRef(extraCell)
  //     .endCell();
    
  //   // Forward TON amount and total amount from createSwap.ts
  //   const forwardTonAmount = toNano("0.02");
  //   const totalTonAmount = toNano("0.1");
      
  //   // Try direct JettonWallet interaction, replicating createSwap.ts
  //   const sender = treasury.getSender();
    
  //   // Create the jetton transfer message exactly like in createSwap.ts
  //   const jettonTransferBody = beginCell()
  //     .storeUint(JETTON_TRANSFER_OP, 32)  // transfer op code (0x0f8a7ea5)
  //     .storeUint(0, 64)                   // query_id
  //     .storeCoins(tokenAmount)            // token amount
  //     .storeAddress(fluida.address)       // destination
  //     .storeAddress(fluida.address)       // response destination
  //     .storeBit(0)                        // custom payload flag
  //     .storeCoins(forwardTonAmount)       // forward TON amount
  //     .storeBit(1)                        // forward payload flag (1 = referenced cell)
  //     .storeRef(depositNotificationPayload) // the notification
  //     .endCell();
    
  //   // Log the payload for debugging
  //   console.log("Jetton Transfer Body (hex):", jettonTransferBody.toBoc().toString("hex"));
    
  //   // Send the message directly - if this doesn't work, we'll implement a workaround
  //   try {
  //     await blockchain.provider(jettonWalletAddress).internal(sender, {
  //       value: totalTonAmount, 
  //       sendMode: SendMode.PAY_GAS_SEPARATELY,
  //       body: jettonTransferBody
  //     });
      
  //     // If JettonWallet doesn't work, manually simulate the deposit below:
  //     // await fluida.sendInternalMessage(sender, toNano("0.1"), depositNotificationPayload);
      
  //     // Verify swap was created
  //     const swapCounter = await fluida.get_swap_counter();
  //     expect(Number(swapCounter)).toEqual(1);
      
  //     // Now complete the swap with the correct preimage
  //     const completeBody = beginCell()
  //       .storeUint(OP_COMPLETE_SWAP, 32)
  //       .storeUint(0, 256)
  //       .storeUint(preimage, 256)
  //       .endCell();
      
  //     await fluida.sendInternalMessage(recipient.getSender(), toNano("0.2"), completeBody);
      
  //     // Verify completion
  //     const updatedSwapData = await fluida.get_swap(0);
  //     expect(Number(updatedSwapData[5])).toEqual(1);
      
  //   } catch (error) {
  //     console.error("Error during jetton transfer:", error);
  //     // If jetton transfer fails, we can simulate the result by sending directly to Fluida
  //     console.log("Falling back to direct deposit simulation");
  //     await fluida.sendInternalMessage(sender, toNano("0.1"), depositNotificationPayload);
      
  //     // Continue with completion as above
  //     const completeBody = beginCell()
  //       .storeUint(OP_COMPLETE_SWAP, 32)
  //       .storeUint(0, 256)
  //       .storeUint(preimage, 256)
  //       .endCell();
      
  //     await fluida.sendInternalMessage(recipient.getSender(), toNano("0.2"), completeBody);
      
  //     // Verify completion
  //     const updatedSwapData = await fluida.get_swap(0);
  //     expect(Number(updatedSwapData[5])).toEqual(1);
  //   }
  // });
  
  // it('should not complete swap with incorrect preimage', async () => {
  //   // This test focuses on testing the incorrect preimage, not the JettonWallet
  //   // so we'll use the direct deposit approach
    
  //   const initiator = treasury.address;
  //   const recipientAddr = recipient.address;
  //   const tokenAmount = toNano("1");
  //   const correctPreimage = BigInt('0x' + '123456789'.padStart(64, '0'));
  //   const hashLock = calculateHashLock(correctPreimage);
  //   const currentTime = Math.floor(Date.now() / 1000);
  //   const timeLock = BigInt(currentTime + 3600);
    
  //   // Create the extra cell
  //   const extraCell = beginCell()
  //     .storeUint(hashLock, 256)
  //     .storeUint(timeLock, 64)
  //     .endCell();
    
  //   // Create the deposit notification
  //   const depositNotificationPayload = beginCell()
  //     .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
  //     .storeUint(tokenAmount, 128)
  //     .storeAddress(initiator)
  //     .storeRef(
  //       beginCell()
  //         .storeAddress(recipientAddr)
  //         .endCell()
  //     )
  //     .storeRef(extraCell)
  //     .endCell();
    
  //   // Send directly to Fluida
  //   await fluida.sendInternalMessage(
  //     treasury.getSender(),
  //     toNano("0.1"),
  //     depositNotificationPayload
  //   );
    
  //   // Verify swap was created
  //   const swapCounter = await fluida.get_swap_counter();
  //   expect(Number(swapCounter)).toEqual(1);
    
  //   // Try to complete with incorrect preimage
  //   const incorrectPreimage = BigInt('0x' + '987654321'.padStart(64, '0'));
    
  //   const completeBody = beginCell()
  //     .storeUint(OP_COMPLETE_SWAP, 32)
  //     .storeUint(0, 256)
  //     .storeUint(incorrectPreimage, 256)
  //     .endCell();
    
  //   // Send the complete message with the wrong preimage
  //   await fluida.sendInternalMessage(
  //     recipient.getSender(), 
  //     toNano("0.2"), 
  //     completeBody
  //   );
    
  //   // Verify that the swap is still pending
  //   const updatedSwapData = await fluida.get_swap(0);
  //   expect(Number(updatedSwapData[5])).toEqual(0);
  // });

  it('should process direct jetton transfer notification', async () => {
    // Addresses needed for the test
    const senderAddress = treasury.address;
    const receiverAddress = recipient.address;
    
    // Parameters similar to createSwap.ts
    const tokenAmount = toNano("0.05");
    const forwardTonAmount = toNano("0.02");
    
    // Generate hashLock and timeLock
    const preimage = BigInt('0x' + '123456789'.padStart(64, '0'));
    const hashLock = calculateHashLock(preimage);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeLock = BigInt(currentTimestamp + 3600); // 1 hour from now
    
    // Create the extra cell for hashLock and timeLock
    const extraCell = beginCell()
      .storeUint(hashLock, 256)
      .storeUint(timeLock, 64)
      .endCell();
    
    // Create the deposit notification payload
    const depositNotificationPayload = beginCell()
      .storeUint(OP_DEPOSIT_NOTIFICATION, 32)
      .storeUint(tokenAmount, 128)
      .storeAddress(senderAddress)  // Depositor/Initiator
      .storeRef(
        beginCell()
          .storeAddress(receiverAddress)  // Recipient
          .endCell()
      )
      .storeRef(extraCell)  // Reference with hashLock and timeLock
      .endCell();
    
    // Create the jetton transfer notification exactly as it would arrive from jetton wallet
    const JETTON_TRANSFER_NOTIFICATION = 0x7362d09cn;
    const notificationBody = beginCell()
      .storeUint(JETTON_TRANSFER_NOTIFICATION, 32)  // op code for jetton transfer notification
      .storeUint(0, 64)                             // query_id (0 in this case)
      .storeCoins(tokenAmount)                      // amount of jettons transferred
      .storeAddress(senderAddress)                  // sender address (jetton wallet owner)
      .storeAddress(senderAddress)                  // from address (original sender)
      .storeRef(depositNotificationPayload)         // forward payload as reference
      .endCell();
    
    // Simulate receiving the notification at the Fluida contract from the jetton wallet
    const result = await fluida.sendInternalMessage(
      treasury.getSender(), // We use the treasury as sender but with a specific message
      forwardTonAmount,     // Forward amount from the transfer
      notificationBody
    );
    
    // Verify a swap was created
    const swapCounter = await fluida.get_swap_counter();
    expect(Number(swapCounter)).toEqual(1);
    
    // Get the swap data to verify it was stored correctly
    const swapData = await fluida.get_swap(0);
    expect(swapData[0].toString()).toEqual(senderAddress.toString());
    expect(swapData[1].toString()).toEqual(receiverAddress.toString());
    expect(swapData[2].toString()).toEqual(tokenAmount.toString());
    expect(swapData[3].toString()).toEqual(hashLock.toString());
    expect(swapData[4].toString()).toEqual(timeLock.toString());
    expect(Number(swapData[5])).toEqual(0); // Should be in pending state
    
    // Now complete the swap with the correct preimage
    const completeBody = beginCell()
      .storeUint(OP_COMPLETE_SWAP, 32)
      .storeUint(0, 256)        // swapId = 0
      .storeUint(preimage, 256) // correct preimage
      .endCell();
    
    // Send the complete message from the recipient
    await fluida.sendInternalMessage(
      recipient.getSender(), 
      toNano("0.2"), 
      completeBody
    );
    
    // Verify that the swap is marked as completed
    const updatedSwapData = await fluida.get_swap(0);
    expect(Number(updatedSwapData[5])).toEqual(1);
  });
});