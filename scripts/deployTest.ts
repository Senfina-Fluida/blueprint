import { SmartContract } from "ton-contract-executor";

const contract = await SmartContract.fromCell(codeCell, dataCell, {
  debug: true // enable debug
});

const send = await contract.sendInternalMessage(...);

console.log(send.logs); // print the logs