import { toNano, Address } from '@ton/core';
import { TestToken } from '../wrappers/TestToken';
import { NetworkProvider } from '@ton/blueprint';
import readline from 'readline';

// Helper function: prompt for user input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function run(provider: NetworkProvider) {
  // --- STEP 1: Get the already deployed TestToken contract address ---
  const testTokenAddressInput = await prompt("Enter the deployed TestToken contract address: ");
  let testTokenAddr: Address;
  try {
    testTokenAddr = Address.parse(testTokenAddressInput.trim());
  } catch (err) {
    console.error("Invalid TestToken contract address.");
    process.exit(1);
  }
  // Attach to the already deployed TestToken contract
  const testToken = provider.open(new TestToken(testTokenAddr));

  // --- STEP 2: Prompt for the recipient address ---
  const recipientInput = await prompt("Enter the recipient address to mint tokens to: ");
  let recipient: Address;
  try {
    recipient = Address.parse(recipientInput.trim());
  } catch (err) {
    console.error("Invalid recipient address.");
    process.exit(1);
  }

  // --- STEP 3: Prompt for the mint amount ---
  const amountInput = await prompt("Enter the amount of tokens to mint (e.g., 1000): ");
  let mintAmount: bigint;
  try {
    // Here, we use toNano to convert the entered amount.
    // Adjust as needed if your TestToken works differently.
    mintAmount = toNano(amountInput.trim());
  } catch (err) {
    console.error("Invalid mint amount.");
    process.exit(1);
  }
  
  console.log(`Minting ${mintAmount.toString()} tokens to ${recipient.toString()} using TestToken at ${testTokenAddr.toString()}`);

  // --- STEP 4: Send the mint transaction ---
  try {
    await testToken.sendMint(provider.sender(), {
      to: recipient,
      amount: mintAmount,
      value: toNano('0.05'),
    });
    console.log("Mint transaction sent successfully.");
  } catch (err) {
    console.error("Error sending mint transaction:", err);
    process.exit(1);
  }
} 