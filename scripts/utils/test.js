import { Address, TonClient, fromNano } from '@ton/ton';

// Contract-specific operation codes from your smart contract
const OP_CODES = {
  OP_COMPLETE_SWAP: 0x87654321,       // 2271560481
  OP_REFUND_SWAP: 0xabcdef12,         // 2882400018
  OP_INITIALIZE: 1,
  OP_DEPOSIT_NOTIFICATION: 0xDEADBEEF, // 3735928559
  JETTON_TRANSFER: 0x7362d09c,        // 1935855772
  JETTON_TRANSFER_NOTIFICATION: 0xd53276db // 3576854235
};

// Helper function to format timestamps correctly
function formatDate(timestamp) {
  if (timestamp && timestamp > 0) {
    try {
      const date = new Date(timestamp * 1000);
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid Date';
    }
  }
  return 'No timestamp';
}

async function main() {
  const client = new TonClient({
    endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    apiKey:
      '5c3049824bce702021d43edaf3839803946143c317b4284e83d8161cf02a9782'
  });

  const contractAddress = Address.parse('EQC0O95byCe3hiTI4UwhiAr7LXrWg3-OcffTV9wdexdk3wOS');
  const transactions = await client.getTransactions(contractAddress, { limit: 10 });

  if (!transactions.length) {
    console.log('No transactions found.');
    return;
  }

  // Loop over the last 10 transactions
  transactions.forEach((tx, idx) => {
    console.log('='.repeat(50));
    console.log(`Transaction ${idx + 1} Details:`);
    console.log(`Hash: ${tx.hash().toString('hex')}`);
    console.log(`Time: ${formatDate(tx.time)}`);
    console.log(`LT: ${tx.lt}`);

    const inMsg = tx.inMessage;
    if (!inMsg) {
      console.log('No incoming message in this transaction');
      return;
    }

    console.log('\nMessage Info:');

    console.log(inMsg)
    console.log(`Type: ${inMsg.info.type}`);
    if (inMsg.info.type === 'internal') {
      console.log(`From: ${inMsg.info.src}`);
      console.log(`Value: ${fromNano(inMsg.info.value.coins)} TON`);
    }

    if (inMsg.body.bits.length > 0) {
      try {
        const slice = inMsg.body.beginParse();
        if (slice.remainingBits >= 32) {
          const op = slice.loadUint(32);
          console.log('\nOperation Details:');
          console.log(`Operation Code: 0x${op.toString(16)} (${op})`);
          console.log('Raw message body:', dumpCell(inMsg.body));

          if (op === OP_CODES.JETTON_TRANSFER_NOTIFICATION) {
            console.log('Type: Jetton Transfer Internal Notification');
            try {
              const queryId = slice.loadUint(64);
              console.log('Query ID:', queryId);
              const amount = slice.loadCoins();
              console.log('Amount:', fromNano(amount), 'Jettons');
              const from = slice.loadAddress();
              console.log('From:', from.toString());
              console.log('Remaining bits:', slice.remainingBits);
              console.log('Remaining refs:', slice.remainingRefs);
              if (slice.remainingRefs > 0) {
                console.log('Forward payload found!');
                const forwardPayloadCell = slice.loadRef();
                const forwardPayloadSlice = forwardPayloadCell.beginParse();
                console.log('Forward payload bits:', forwardPayloadSlice.remainingBits);
                if (forwardPayloadSlice.remainingBits >= 32) {
                  const forwardOp = forwardPayloadSlice.loadUint(32);
                  console.log('Forward Operation:', `0x${forwardOp.toString(16)}`);
                  if (forwardOp === OP_CODES.OP_DEPOSIT_NOTIFICATION) {
                    try {
                      const depositAmount = forwardPayloadSlice.loadUint(128);
                      console.log('Deposit Amount:', fromNano(depositAmount), 'Jettons');
                    } catch (e) {
                      console.log("Error reading depositAmount:", e.message);
                    }
                    try {
                      const depositor = forwardPayloadSlice.loadAddress();
                      console.log('Depositor:', depositor.toString());
                    } catch (e) {
                      console.log("Error reading depositor:", e.message);
                    }
                    if (forwardPayloadSlice.remainingRefs > 0) {
                      try {
                        const recipientRef = forwardPayloadSlice.loadRef();
                        const recipient = recipientRef.beginParse().loadAddress();
                        console.log('Recipient:', recipient.toString());
                      } catch (e) {
                        console.log("Error reading recipient:", e.message);
                      }
                    } else {
                      console.log("No recipient ref found");
                    }
                    try {
                      const hashLock = forwardPayloadSlice.loadUint(256);
                      console.log('Hash Lock:', `0x${hashLock.toString(16)}`);
                    } catch (e) {
                      console.log("Error reading hashLock:", e.message);
                    }
                    try {
                      const timeLock = forwardPayloadSlice.loadUint(64);
                      console.log('Time Lock:', formatDate(Number(timeLock)));
                    } catch (e) {
                      console.log("Error reading timeLock:", e.message);
                    }
                  } else if (forwardOp === 0) {
                    const comment = forwardPayloadSlice.loadStringTail();
                    console.log('Comment:', comment);
                  } else {
                    console.log("Unknown forward operation, dumping raw forward payload:");
                    console.log(dumpCell(forwardPayloadCell));
                  }
                } else {
                  console.log("Forward payload cell does not have enough bits to read an op code");
                }
              } else {
                console.log('No forward payload found');
              }
              console.log('Raw remaining slice data:', slice.toString());
          } catch (e) {
              console.log('Error parsing transfer notification:', e.message);
              console.log('Raw slice at error:', slice.toString());
            }
          } else if (op === OP_CODES.JETTON_TRANSFER) {
            console.log('Type: Jetton Transfer');
            try {


              console.log("DEBUG------------- SLICE---------")

              console.log(slice)

              console.log("DEBUG------------- SLICE---------")


                // Parse the main message
                const queryId = slice.loadUint(64);
                console.log('Query ID:', queryId);
                
                const amount = slice.loadCoins();
                console.log('Amount:', fromNano(amount), 'Jettons');
                
                const destination = slice.loadAddress();
                console.log('Destination:', destination.toString());
        
                if (slice.remainingRefs > 0) {
                    console.log('\nParsing reference cells:');
                    
                    // First reference (Deposit Notification)
                    const ref1 = slice.loadRef();
                    const ref1Slice = ref1.beginParse();
                    const depositOp = ref1Slice.loadUint(32);
                    console.log('Deposit Notification Op:', `0x${depositOp.toString(16)}`);
                    
                    if (depositOp === OP_CODES.OP_DEPOSIT_NOTIFICATION) {
                        const depositAmount = ref1Slice.loadUint(128);
                        const depositor = ref1Slice.loadAddress();
                        console.log('Deposit Amount:', fromNano(depositAmount), 'TON');
                        console.log('Depositor:', depositor.toString());
                    }
        
                    // Second reference (Recipient Address)
                    if (ref1Slice.remainingRefs > 0) {
                        const ref2 = ref1Slice.loadRef();
                        const ref2Slice = ref2.beginParse();
                        const recipient = ref2Slice.loadAddress();
                        console.log('Recipient:', recipient.toString());
                    }
        
                    // Third reference (Hash Lock and Time Lock)
                    if (ref1Slice.remainingRefs > 0) {
                        const ref3 = ref1Slice.loadRef();
                        const ref3Slice = ref3.beginParse();
                        const hashLock = ref3Slice.loadUintBig(256); // Changed to loadUintBig
                        const timeLock = ref3Slice.loadUint(64);
                        console.log('Hash Lock:', `0x${hashLock.toString(16)}`);
                        console.log('Time Lock:', formatDate(Number(timeLock)));
                    }
                }
            } catch (e) {
                console.log('Error parsing jetton transfer:', e.message);
                console.log('Remaining slice data:', slice.toString());
            }
        }else if (op === OP_CODES.OP_DEPOSIT_NOTIFICATION) {
            console.log('Type: Deposit Notification');
            try {
              const depositAmount = slice.loadUint(128);
              const depositor = slice.loadAddress();
              const recipientRef = slice.loadRef();
              const recipient = recipientRef.beginParse().loadAddress();
              const hashLock = slice.loadUint(256);
              const timeLock = slice.loadUint(64);

              console.log(`Deposit Amount: ${fromNano(depositAmount)} TON`);
              console.log(`Depositor: ${depositor}`);
              console.log(`Recipient: ${recipient}`);
              console.log(`Hash Lock: 0x${hashLock.toString(16)}`);
              console.log(`Time Lock: ${formatDate(Number(timeLock))}`);
            } catch (e) {
              console.log('Error parsing deposit notification:', e.message);
            }
          } else {
            console.log('Unknown operation code');
            console.log('Raw payload:', slice.toString());
          }
        }
      } catch (e) {
        console.log('Error parsing message body:', e.message);
      }
    }
    console.log('\n');
  });
}

function dumpCell(cell) {
  return cell.beginParse().toString();
}

main()
  .then(() => console.log('Done'))
  .catch(console.error);
