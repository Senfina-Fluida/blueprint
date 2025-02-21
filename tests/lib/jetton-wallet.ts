// TODO: possibly use this outside tests

import BN from "bn.js";
import { Address, beginCell, Cell, toNano } from "ton";
import { WrappedSmartContract } from "./wrapped-smart-contract";
import { OPS } from "./ops";

export class JettonWallet extends WrappedSmartContract {
  static transferBody(toOwnerAddress: Address, jettonValue: BN): Cell {
    return beginCell()
      .storeUint(OPS.Transfer, 32)
      .storeUint(0, 64) // queryid
      .storeCoins(jettonValue)
      .storeAddress(toOwnerAddress)
      .storeAddress(null) // TODO: response address?
      .storeDict(null) // custom payload
      .storeCoins(0) // forward TON amount TODO
      .storeRefMaybe(null) // forward payload - TODO?
      .endCell();
  }

  // New helper that adds a notification payload reference.
  static transferBodyWithNotification(
    toOwnerAddress: Address,
    jettonValue: BN,
    notificationPayload: Cell
  ): Cell {
    return beginCell()
      .storeUint(OPS.Transfer, 32)
      .storeUint(0, 64) // queryid
      .storeCoins(jettonValue)
      .storeAddress(toOwnerAddress)
      .storeAddress(null) // TODO: response address?
      // If your protocol expects a dictionary for custom payload, you can leave it empty or build one.
      .storeDict(null) // custom payload dictionary (not used in this case)
      .storeCoins(0) // forward TON amount
      // Instead of an empty forward payload, we attach our notificationPayload as a reference.
      .storeRef(notificationPayload)
      .endCell();
  }
}
