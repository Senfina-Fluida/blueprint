import { Address } from "ton";

// First, check the raw hex string length
let rawHex = "00538013f7bf025b5b97e6f748afb9eb61c6dedf8176b7fc92c3d951a0cee7d20ea9f3200000000000000008";
console.log("Original hex length:", rawHex.length);

// Trim to exactly 64 characters if needed
if (rawHex.length > 64) {
  rawHex = rawHex.substring(0, 64);
} else if (rawHex.length < 64) {
  // Pad with zeros if too short (though this is unlikely your issue)
  rawHex = rawHex.padEnd(64, '0');
}

console.log("Adjusted hex:", rawHex);
console.log("Adjusted length:", rawHex.length);

try {
    // Convert hex to Buffer
    const rawAddressBuffer = Buffer.from(rawHex, "hex");
    
    // Create Address object
    const workchain = 0; // Usually 0 for mainnet, -1 for testnet
    const address = new Address(workchain, rawAddressBuffer);
    
    // Convert to friendly format
    console.log("Friendly Address:", address.toFriendly());
} catch (error) {
    console.error("Error converting address:", error.message);
}