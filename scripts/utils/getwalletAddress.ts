import { Address } from '@ton/core';
import { TonClient, JettonMaster }  from '@ton/ton';

/**
 * Calculates the jetton wallet address for a given user.
 *
 * @param {string} jettonMasterAddressStr - The jetton master contract address (in friendly format).
 * @param {string} userAddressStr - The user address (in friendly format).
 * @returns {Promise<Address>} The jetton wallet address.
 */
export async function getJettonWalletAddress(userAddressStr: string) {
  // Create a TonClient instance using a TonCenter JSON-RPC endpoint.
  const client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  });

  // Parse addresses
  const jettonMasterAddress = Address.parse("kQDoy1cUAbGq253vwfoPcqSloODVAWkDBniR12PJFUHnK6Yf"); //TGBTC
  const userAddress = Address.parse(userAddressStr);

  // Open the JettonMaster contract instance.
  const jettonMaster = client.open(JettonMaster.create(jettonMasterAddress));

  try {
    const walletAddress = await jettonMaster.getWalletAddress(userAddress);
    return walletAddress;
  } catch (error) {
    console.error("\nError calculating jetton wallet address:");
    // console.error(error.message);
    console.error(error);
    console.error(
      "\nThis error (exit code -13) means the contract execution failed. Please verify that the contract storage (especially the jetton_wallet_code cell) is properly initialized."
    );
    throw error;
  }
}

module.exports = {
  getJettonWalletAddress,
};
