import { toNano, Address, beginCell, SendMode } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';

// --- Throttling Helpers ---
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  retryCount = 0
): Promise<T> {
  try {
    if (retryCount > 0) {
      await sleep(1500 * retryCount);
    }
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

// --- Main Script ---
// This script sends a simple jetton transfer (without any forward payload)
// from the owner's jetton wallet (at the provided address) to the Fluida contract.
export async function run(provider: NetworkProvider) {
  console.log("Sending 10 jetton tokens as a simple transfer (no forward payload)...");

  // 1. Get the owner (sender) address.
  const owner = provider.sender().address!;
  console.log("Owner address:", owner.toString());

  // 2. Use the provided jetton wallet address.
  const jettonWalletAddress = Address.parse("EQBergMVZZS6uM85K0KZhsB5N1YKCrAw--l81nu9ZNrwhLRY");
  console.log("Jetton Wallet Address:", jettonWalletAddress.toString());

  // 3. Destination: the Fluida contract address.
  const fluidaAddress = Address.parse("EQCw_ATo8SuGZNEPffHbhUz0dlTCh1sWv1W3Foi5sOag90Lb");
  console.log("Fluida contract address:", fluidaAddress.toString());

  // 4. Define transfer parameters:
  //    - tokenAmount: 10 tokens (as a 128-bit integer)
  //    - forward TON amount: 0 (no notification, no payload)
  //    - total TON attached for fees.
  const tokenAmount = 10n;
  const forwardTonAmount = 0n; // no forward TON, no forward payload
  const totalTonAmount = toNano("0.1");

  // 5. Build the simple jetton transfer payload.
  // Standard structure (TEP-74):
  //   [ op code (32 bits): 0xf8a7ea5,
  //     query_id (64 bits): 0,
  //     tokenAmount (128 bits): 10 tokens,
  //     destination address: Fluida contract,
  //     response destination: owner's address,
  //     forward TON amount (coins): 0,
  //     forward payload flag: false,
  //     custom payload flag: false ]
  const jettonTransferPayload = beginCell()
    .storeUint(0xf8a7ea5, 32)   // jetton transfer op code
    .storeUint(0, 64)           // query_id = 0
    .storeCoins(10)// token amount: 10 tokens
    .storeAddress(fluidaAddress) // destination: Fluida contract
    .storeAddress(fluidaAddress)        // response destination: owner's address
    .storeBit(0)            // no forward payload presen
    .storeCoins(0)// forward TON amount (0)
    .storeBit(0)            // no forward payload presen
    // .storeBit(false)            // no custom payload
    .endCell();

  console.log("Jetton Transfer Payload (hex):", jettonTransferPayload.toBoc().toString('hex'));

  // 6. Send an internal message to the jetton wallet contract.
  // This instructs the jetton wallet to execute the transfer.
  try {
    const txResult = await withRetry(async () => {
      return await provider.provider(jettonWalletAddress).internal(provider.sender(), {
        value: totalTonAmount, // attached TON to cover fees/gas
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: jettonTransferPayload,
      });
    }, "sending simple jetton transfer");
    console.log("Simple jetton transfer transaction sent successfully:", txResult);
  } catch (error) {
    console.error("Error sending simple jetton transfer:", error);
  }
}
