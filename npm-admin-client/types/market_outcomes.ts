import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./account";

export type GetPublicKeys = {
  publicKeys: PublicKey[];
};

export type MarketOutcomeAccount = {
  index: number;
  title: string;
  market: PublicKey;
  latestMatchedPrice: number;
  matchedTotal: BN;
  priceLadder: number[];
};

export type MarketOutcomeAccounts = {
  marketOutcomeAccounts: GetAccount<MarketOutcomeAccount>[];
};

export type MarketOutcomeTitlesResponse = {
  marketOutcomeTitles: string[];
};
