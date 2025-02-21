const { Address } = require("@ton/core");
const { TonClient, JettonMaster } = require("@ton/ton");

(async () => {
  // Create a TonClient instance using a TonCenter JSON-RPC endpoint.
  const client = new TonClient({
    endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
  });

  // Parse the jetton master contract and user addresses.
  const jettonMasterAddress = Address.parse('kQBWqA0Zb6TmFlMUIoDlyAscUAcMQ3-1tae2POQ4Xl4xrw_V');
  const userAddress = Address.parse('EQCw-TMDSxfgF3Pkzu59ZCNh5cTonlSwNMk2hyI9znwUQ7V0');

  // Log the EQ-format (user-friendly) address of the jetton master.
  console.log("Jetton Master EQ-address:", jettonMasterAddress.toString());

  // Open the JettonMaster contract instance.
  const jettonMaster = client.open(JettonMaster.create(jettonMasterAddress));

  try{
    const jettonMaster = client.open(JettonMaster.create(jettonMasterAddress))
    
    console.log(await jettonMaster.getWalletAddress(userAddress))



  } catch (error) {
    console.error("\nError calculating jetton wallet address:");
    console.error(error.message);
    console.error(error);
    console.error("\nThis error (exit code -13) means the contract execution failed. Please verify that the contract storage (especially the jetton_wallet_code cell) is properly initialized.");
  }
})();
