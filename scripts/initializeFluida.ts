import { toNano, beginCell, Address, SendMode } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';

/**
 *  OP_INITIALIZE = 1 (from Fluida.fc)
 *
 *  initialize_storage(...) in FunC expects:
 *    1) OP code (32 bits)
 *    2) The new jettonWallet address (in_msg_body~load_msg_addr())
 *
 *  So our message body = [op(32 bits), newJettonWallet(address)]
 */

export async function run(provider: NetworkProvider) {
  // 1) The deployed Fluida contract address
  const fluidaAddress = Address.parse("EQBQJn8uJwDldWNSXbsCbtk8VAAcxBE_QN8p97u0ctSirhh0");
  
  // 2) The new Jetton Wallet address you want to store in Fluida
  const newJettonWalletAddress = Address.parse("EQDqVx54LcPErnxAoNeKO0JKx7ESgUKdPvTSrukOyMFA5fTC");

  // 3) Create the message body:
  //    - Store OP_INITIALIZE (which is 1 in your contract).
  //    - Store the new jetton wallet address right after.
  //    That is exactly how initialize_storage(...) will read it:
  //       int op = in_msg_body~load_uint(32);   // => 1
  //       slice jettonWallet = in_msg_body~load_msg_addr(); // => new address
  //
  const OP_INITIALIZE = 1;  // from your .fc constants

  const messageBody = beginCell()
    .storeUint(OP_INITIALIZE, 32)
    .storeAddress(newJettonWalletAddress)
    .endCell();

  // 4) Send an internal message to your Fluida contract
  //    Attach enough TON to pay for fees. Adjust as necessary.
  //    For testnets, ~0.02 - 0.05 is typically enough.  
  try {
    console.log("Sending OP_INITIALIZE message with the new jettonWallet...");

    const result = await provider.provider(fluidaAddress).internal(provider.sender(), {
      value: toNano("0.05"),        // Attach enough TON for fees
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      bounce: true,
      body: messageBody,
    });

    console.log("✅ Initialization message sent. Transaction result:", result);
  } catch (error) {
    console.error("❌ Error sending initialization message:", error);
  }
}
