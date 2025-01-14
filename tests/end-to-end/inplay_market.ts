import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import assert from "assert";
import { Program } from "@coral-xyz/anchor";
import {
  MarketMatchingPools,
  MarketOutcomes,
  MarketPositions,
  Orders,
  Trades,
} from "../../npm-client/src/";

describe("End to end test of", () => {
  it("basic lifecycle of inplay market", async () => {
    const inplayDelay = 10;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = now + 1000;

    const market = await monaco.create3WayMarket(
      [2.0, 3.0],
      true,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
    );
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    // Liquidity, prior match & No liquidity, prior match
    const prePlayOrder01 = await market.forOrder(0, 1, 2.0, purchaser);
    const prePlayOrder02 = await market.againstOrder(0, 1, 2.0, purchaser);
    await market.match(prePlayOrder01, prePlayOrder02);
    const prePlayOrder03 = await market.forOrder(0, 1, 2.0, purchaser);

    // No liquidity, no matches
    const prePlayOrder10 = await market.forOrder(1, 1, 2.0, purchaser);

    // Additional order to be placed after event start time but before market is moved to inplay
    const prePlayOrder11 = await market.forOrder(1, 1, 3.0, purchaser);

    try {
      await market.moveMarketToInplay();
      assert.fail("Should have thrown error");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "MarketEventNotStarted");
    }

    // Move start time up to now
    await market.updateMarketEventStartTimeToNow();

    // Create an inplay order before the market inplay flag has been updated
    let matchingPool;
    try {
      matchingPool = await market.getForMatchingPool(1, 3.0);
      assert.deepEqual(matchingPool, { len: 1, liquidity: 1, matched: 0 });
      await market.forOrder(1, 4.2, 3.0, purchaser);
      matchingPool = await market.getForMatchingPool(1, 3.0);
      assert.deepEqual(matchingPool, { len: 1, liquidity: 0, matched: 0 });
    } catch (e) {
      console.log(e);
      throw e;
    }

    await market.moveMarketToInplay();

    // 1. Inplay order into existing non-zero'd preplay matching pool
    // With existing liquidity
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    await market.forOrder(0, 1, 2.0, purchaser);
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // Without existing liquidity
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    await market.againstOrder(0, 1, 2.0, purchaser);
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // 2. Inplay order into existing zero'd preplay matching pool
    // With existing liquidity
    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    await market.moveMarketMatchingPoolToInplay(1, 2.0, true);

    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    await market.forOrder(1, 1, 2.0, purchaser);
    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // 3. Inplay order creates new inplay matching pool
    try {
      await market.getForMatchingPool(2, 2.0);
    } catch (e) {
      expect(e.message).toMatch(/^Account does not exist or has no data/);
    }

    const inPlayOrder21 = await market.forOrder(2, 1, 2.0, purchaser);
    matchingPool = await market.getForMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 0);
    const inPlayOrder22 = await market.againstOrder(2, 1, 2.0, purchaser);
    matchingPool = await market.getAgainstMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // 4. Inplay order creates a new matching pool but is never used
    await market.forOrder(2, 1, 3.0, purchaser);
    matchingPool = await market.getForMatchingPool(2, 3.0);
    assert.equal(matchingPool.liquidity, 0);

    // Wait for delay to expire and process orders
    await new Promise((resolve) => setTimeout(resolve, inplayDelay * 1000));

    await market.processDelayExpiredOrders(0, 2.0, true);
    await market.processDelayExpiredOrders(0, 2.0, false);
    await market.processDelayExpiredOrders(1, 2.0, true);
    await market.processDelayExpiredOrders(1, 3.0, true);
    await market.processDelayExpiredOrders(2, 2.0, true);
    // Skip processing this matching pool and allow matching to use the delay expired order
    // await market.processDelayExpiredOrders(2, 2.0, false);

    // Check liquidity that should be visible is visible
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    matchingPool = await market.getForMatchingPool(1, 3.0);
    assert.equal(matchingPool.liquidity, 4.2);

    matchingPool = await market.getForMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 1);
    matchingPool = await market.getAgainstMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // Match order with liquidity that is not yet visible (but should be)
    await market.match(inPlayOrder21, inPlayOrder22);

    matchingPool = await market.getForMatchingPool(2, 2.0);
    let order = await monaco.getOrder(inPlayOrder21);
    assert.deepEqual(matchingPool.liquidity, 0);
    assert.equal(order.stakeUnmatched, 0);
    matchingPool = await market.getAgainstMatchingPool(2, 2.0);
    order = await monaco.getOrder(inPlayOrder22);
    assert.deepEqual(matchingPool.liquidity, 0);
    assert.equal(order.stakeUnmatched, 0);

    // Close orders due to event start
    await market.cancelPreplayOrderPostEventStart(prePlayOrder03);
    await market.cancelPreplayOrderPostEventStart(prePlayOrder10);
    await market.cancelPreplayOrderPostEventStart(prePlayOrder11);

    order = await monaco.getOrder(prePlayOrder01);
    assert.equal(order.stakeUnmatched, 0);
    order = await monaco.getOrder(prePlayOrder02);
    assert.equal(order.stakeUnmatched, 0);
    order = await monaco.getOrder(prePlayOrder03);
    assert.equal(order.stakeUnmatched, 0);
    order = await monaco.getOrder(prePlayOrder10);
    assert.equal(order.stakeUnmatched, 0);

    // Settle market and market positions and orders
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await Orders.orderQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const order of response.data.publicKeys) {
          await market.settleOrder(order);
        }
      });
    await market.completeSettlement();

    // Close accounts
    await market.readyToClose();

    await Trades.tradeQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const trade of response.data.publicKeys) {
          await monaco.program.methods
            .closeTrade()
            .accounts({
              market: market.pk,
              trade: trade,
              payer: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await Orders.orderQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const order of response.data.publicKeys) {
          await monaco.program.methods
            .closeOrder()
            .accounts({
              market: market.pk,
              order: order,
              purchaser: purchaser.publicKey,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketPositions.marketPositionQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketPosition of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketPosition()
            .accounts({
              market: market.pk,
              marketPosition: marketPosition,
              purchaser: purchaser.publicKey,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketMatchingPools.marketMatchingPoolQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketMatchingPool of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketMatchingPool()
            .accounts({
              market: market.pk,
              marketMatchingPool: marketMatchingPool,
              payer: purchaser.publicKey,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketOutcomes.marketOutcomeQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketOutcome of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketOutcome()
            .accounts({
              market: market.pk,
              marketOutcome: marketOutcome,
              authority: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: market.pk,
        authority: monaco.operatorPk,
        marketEscrow: market.escrowPk,
        commissionPaymentQueue: market.paymentsQueuePk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  });

  it("market is not enabled for inplay", async () => {
    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = eventStartTimestamp;

    const market = await monaco.create3WayMarket(
      [2.0, 3.0],
      false,
      0,
      eventStartTimestamp,
      marketLockTimestamp,
    );

    try {
      await market.moveMarketToInplay();
      assert.fail("Should have thrown error");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "MarketInplayNotEnabled");
    }
  });
});
