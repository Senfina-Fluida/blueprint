import { toNano, Address, beginCell, SendMode } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { calculateHashLock } from './utils/hashHelper';

// --- Throttling Helper ---
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  retryCount = 0
): Promise<T> {
  try {
    if (retryCount > 0) await sleep(1500 * retryCount);
    const result = await operation();
    await sleep(1500);
    return result;
  } catch (error: any) {
    if (error.response?.status === 429 && retryCount < 5) {
      console.warn(`Rate limit hit for ${operationName}. Retrying...`);
    return withRetry(operation, operationName, retryCount + 1);
    }
    throw error;
  }
}

export async function run(provider: NetworkProvider) {
  console.log("Sending jetton transfer with custom deposit-notification forward payload...");

  // 1. Get the sender's (owner's) address.
  const owner = provider.sender().address!;
  console.log("Owner address:", owner.toString());

  // 2. Use a fixed jetton wallet address (for testing).
  const jettonWalletAddress = Address.parse("EQBergMVZZS6uM85K0KZhsB5N1YKCrAw--l81nu9ZNrwhLRY");
  console.log("Jetton Wallet Address:", jettonWalletAddress.toString());

  // 3. Set the destination as the Fluida contract address.
  const fluidaAddress = Address.parse("EQCvLVdb58Z5jjn_fC7GchRA-Z5iCatXuAbEUS--101d8ayO");
  console.log("Fluida Contract Address:", fluidaAddress.toString());

  // 4. Define parameters.
  const tokenAmount = toNano(0.05);         // token amount in minimal units
  const forwardTonAmount = toNano("0.02");    // forward TON amount (must be > 0 to trigger notification)
  const totalTonAmount = toNano("0.1");       // TON attached for fees

  // 5. Build the deposit-notification forward payload with an extra cell for hashLock/timeLock.
  const OP_DEPOSIT_NOTIFICATION = 0xDEADBEEFn; // 0xDEADBEEF = 3735928559
  const depositAmount = toNano("1");           // deposit amount in minimal units (modify as needed)

  // Use the jetton wallet as the minter (depositor). Modify if you have a separate minter contract.
  const minterContract = { address: jettonWalletAddress };

  // Replace with the actual participant2 address.
  const PARTICIPANT_ADDRESS_2 = Address.parse(owner.toString());

  // Define a dummy 256-bit hashLock.
  const preimage = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
  const hashLock = 123456789n;
  const timeLock = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Build an extra cell for hashLock and timeLock.
  const extraCell = beginCell()
    .storeUint(hashLock, 256)
    .storeUint(timeLock, 64)
    .endCell();

  // Build the deposit notification payload.
  const depositNotificationPayload = beginCell()
    .storeUint(OP_DEPOSIT_NOTIFICATION, 32)  // deposit notification op code (0xDEADBEEF)
    .storeUint(depositAmount, 128)
    .storeAddress(owner)
    .storeRef(
      beginCell()
        .storeAddress(PARTICIPANT_ADDRESS_2)
        .endCell()
    )
    // Instead of storing hashLock/timeLock inline, store a reference to the extra cell.
    .storeRef(extraCell)
    .endCell();

  // Use the deposit notification as the forward payload.
  const forwardPayload = depositNotificationPayload;

  // Then, create the transfer message.
  const messageBody = beginCell()
    .storeUint(0x0f8a7ea5, 32)           // transfer op code for jetton transfer
    .storeUint(0, 64)                    // query_id
    .storeCoins(tokenAmount)             // token amount for transfer
    .storeAddress(fluidaAddress)         // destination
    .storeAddress(fluidaAddress)         // response destination (ensure this is correct for your use case)
    .storeBit(0)                         // custom payload flag (0 = none)
    .storeCoins(forwardTonAmount)        // forward TON amount
    .storeBit(1)                         // forward payload flag (1 = referenced cell)
    .storeRef(forwardPayload)            // attach the forward payload
    .endCell();

  console.log("Jetton Transfer Payload (hex):", messageBody.toBoc().toString("hex"));

  // 7. Send the internal message to the jetton wallet contract.
  try {
    const txResult = await withRetry(async () => {
      return await provider.provider(jettonWalletAddress).internal(provider.sender(), {
        value: totalTonAmount, // TON attached to cover fees/gas
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        bounce: true,
        body: messageBody,     // messageBody is a Cell
      });
    }, "sending jetton transfer with custom payload");
    console.log("Transaction sent successfully:", txResult);
  } catch (error) {
    console.error("Error sending jetton transfer:", error);
  }
}
