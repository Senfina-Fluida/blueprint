import { Cell } from '@ton/core';

function debugLog(...args) {
  console.log("[DEBUG]", ...args);
}

/**
 * Wraps a raw cell hex string in a minimal BOC header.
 * 
 * The minimal header is built as:
 *   - Magic: B5EE9C72 (4 bytes)
 *   - Flags: 00 (1 byte)
 *   - Offset size: 01 (1 byte)
 *   - Cells count: 01 (1 byte)
 *   - Roots count: 01 (1 byte)
 *   - Absent cells count: 00 (1 byte)
 *   - Total cells size: raw cell length (1 byte, in hex, padded to 2 hex digits)
 *
 * Total header length = 10 bytes.
 */
function wrapRawCellInBoc(rawHex) {
  debugLog("Raw input hex:", rawHex);
  const rawBuffer = Buffer.from(rawHex, 'hex');
  debugLog("Raw input length (bytes):", rawBuffer.length);
  const rawHeader = rawBuffer.slice(0, 4).toString('hex');
  debugLog("Raw header bytes (from input):", rawHeader);
  
  // If the input already starts with a BOC magic, assume it is complete.
  if (rawHex.toLowerCase().startsWith("b5ee9c72")) {
    debugLog("Input already has BOC magic header.");
    return rawHex;
  }
  
  // Build minimal header.
  // Using offset size = 1 so cells count and total cell size are encoded in 1 byte.
  const cellCount = "01";
  const rootsCount = "01";
  const absentCount = "00";
  const totalSize = rawBuffer.length.toString(16).padStart(2, '0'); // e.g., "64" for 100 bytes
  
  // Header = magic + flags + offset_size + cell_count + roots_count + absent_count + total_size
  const headerHex = "B5EE9C72" + "00" + "01" + cellCount + rootsCount + absentCount + totalSize;
  debugLog("Minimal header hex:", headerHex);
  
  const wrappedHex = headerHex + rawHex;
  debugLog("Wrapped hex:", wrappedHex);
  return wrappedHex;
}

/**
 * Decodes a cell from a raw hex string.
 * It wraps the raw hex in a minimal BOC header and then attempts to decode.
 */
function decodeCellFromHex(rawHex) {
  try {
    const wrappedHex = wrapRawCellInBoc(rawHex);
    debugLog("Attempting to decode using wrapped hex...");
    const buffer = Buffer.from(wrappedHex, 'hex');
    debugLog("Total wrapped buffer length (bytes):", buffer.length);
    const cells = Cell.fromBoc(buffer, { check: false });
    debugLog("Number of cells decoded:", cells.length);
    if (cells.length === 0) {
      console.error("No cells decoded from provided data");
      return null;
    }
    const cell = cells[0];
    debugLog("Decoded Cell string representation:", cell.toString());
    debugLog("Decoded Cell is empty:", cell.isEmpty());
    return cell;
  } catch (e) {
    console.error("Error decoding cell:", e.message);
    return null;
  }
}

/**
 * Decodes a deposit notification payload.
 * Expected layout (in order):
 *   [ op code (32 bits),
 *     depositAmount (128 bits),
 *     depositor address,
 *     recipient address (in a ref cell),
 *     hashLock (256 bits),
 *     timeLock (64 bits) ]
 */
function decodeDepositNotification(rawHex) {
  const cell = decodeCellFromHex(rawHex);
  if (!cell) {
    console.error("Failed to decode cell.");
    return null;
  }
  const slice = cell.beginParse();
  
  const op = slice.loadUint(32);
  debugLog("Op Code:", op);
  
  const depositAmount = slice.loadUint(128);
  debugLog("Deposit Amount:", depositAmount);
  
  const depositor = slice.loadMsgAddr();
  debugLog("Depositor Address:", depositor.toString());
  
  const recipientRef = slice.loadRef();
  const recipientSlice = recipientRef.beginParse();
  const recipient = recipientSlice.loadMsgAddr();
  debugLog("Recipient Address:", recipient.toString());
  
  const hashLock = slice.loadUint(256);
  debugLog("HashLock:", hashLock);
  
  const timeLock = slice.loadUint(64);
  debugLog("TimeLock:", timeLock);
  
  return {
    op,
    depositAmount,
    depositor: depositor.toString(),
    recipient: recipient.toString(),
    hashLock,
    timeLock,
  };
}

const hexInput = "4801CE36BD682ABE8D9FC5AE9A06C8CE9D6078E4853E07E7AC0EA542A0FF9A091C6F0039718D761E08957BB9F458D47C35989D7C09AD937E1F5DADCE7D444B69666B15900B32B2740608235A00003970EC534306CF6EBF586A993B6D80000000000000004";
const decoded = decodeDepositNotification(hexInput);
console.log("Decoded Deposit Notification:", decoded);
