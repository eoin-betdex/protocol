use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use protocol_product::state::product::Product;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::instructions::math::stake_precision_is_within_range;
use crate::instructions::{current_timestamp, market, market_position, matching, transfer};
use crate::state::market_account::*;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_outcome_account::MarketOutcome;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;
use crate::state::price_ladder::{PriceLadder, DEFAULT_PRICES};

#[allow(clippy::too_many_arguments)]
pub fn create_order<'info>(
    order: &mut Account<Order>,
    market: &mut Account<Market>,
    purchaser: &Signer<'info>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    product: &Option<Account<Product>>,
    matching_pool: &mut Account<MarketMatchingPool>,
    market_position: &mut Account<MarketPosition>,
    market_escrow: &Account<'info, TokenAccount>,
    market_outcome: &Account<MarketOutcome>,
    price_ladder: &Option<Account<PriceLadder>>,
    data: OrderData,
) -> Result<()> {
    initialize_order(
        order,
        market,
        purchaser,
        market_outcome,
        price_ladder,
        product,
        data,
    )?;

    // initialize market position if needed
    if market_position.purchaser == Pubkey::default() {
        market_position::create_market_position(purchaser, market, market_position)?;
        market.increment_account_counts()?;
    }

    // pools are always initialized with default items, so if this pool is new, initialize it
    if matching_pool.orders.size() == 0 {
        market::initialize_market_matching_pool(matching_pool, market, order)?;
        market.increment_unclosed_accounts_count()?;
    }

    matching::update_matching_pool_with_new_order(market, matching_pool, order)?;

    // calculate payment
    let payment = market_position::update_on_order_creation(market_position, order)?;
    transfer::order_creation_payment(
        market_escrow,
        purchaser,
        purchaser_token_account,
        token_program,
        payment,
    )?;

    market.increment_account_counts()?;

    Ok(())
}

fn initialize_order(
    order: &mut Account<Order>,
    market: &Account<Market>,
    purchaser: &Signer,
    market_outcome: &Account<MarketOutcome>,
    price_ladder: &Option<Account<PriceLadder>>,
    product: &Option<Account<Product>>,
    data: OrderData,
) -> Result<()> {
    let now: UnixTimestamp = current_timestamp();
    validate_market_for_order(market, now)?;

    // validate
    msg!(
        "{} {}: {} @ {} ",
        if data.for_outcome { "for" } else { "against" },
        data.market_outcome_index,
        data.stake,
        data.price,
    );
    require!(data.stake > 0_u64, CoreError::CreationStakeZeroOrLess);
    require!(data.price > 1_f64, CoreError::CreationPriceOneOrLess);
    let stake_precision_check_result =
        stake_precision_is_within_range(data.stake, market.decimal_limit)?;
    require!(
        stake_precision_check_result,
        CoreError::CreationStakePrecisionIsTooHigh
    );

    // TODO only check against price ladder account once backwards compat. is removed
    if market_outcome.price_ladder.is_empty() {
        // No prices included on the outcome, use a PriceLadder or default prices
        match price_ladder {
            Some(price_ladder_account) => require!(
                price_ladder_account.prices.is_empty()
                    || price_ladder_account.prices.contains(&data.price),
                CoreError::CreationInvalidPrice
            ),
            None => require!(
                DEFAULT_PRICES.contains(&data.price),
                CoreError::CreationInvalidPrice
            ),
        }
    } else {
        // Prices are included on the outcome, use those
        require!(
            market_outcome.price_ladder.contains(&data.price),
            CoreError::CreationInvalidPrice
        );
    }

    // update the order account with data we have received from the caller
    order.market = market.key();
    order.market_outcome_index = data.market_outcome_index;
    order.for_outcome = data.for_outcome;

    order.purchaser = purchaser.key();
    order.payer = purchaser.key();

    order.order_status = OrderStatus::Open;
    order.stake = data.stake;
    order.expected_price = data.price;
    order.creation_timestamp = now;
    order.delay_expiration_timestamp = match market.is_inplay() {
        true => now
            .checked_add(market.inplay_order_delay as i64)
            .ok_or(CoreError::ArithmeticError),
        false => Ok(0),
    }?;

    order.stake_unmatched = data.stake;
    order.payout = 0_u64;

    match product {
        Some(product_account) => {
            order.product = Some(product_account.key());
            order.product_commission_rate = product_account.commission_rate;
        }
        None => {
            order.product = None;
            order.product_commission_rate = 0_f64;
        }
    };

    Ok(())
}

fn validate_market_for_order(market: &Market, now: UnixTimestamp) -> Result<()> {
    let market_lock_timestamp = &market.market_lock_timestamp;
    let status = &market.market_status;

    require!(
        status == &MarketStatus::Open,
        CoreError::CreationMarketNotOpen
    );

    require!(
        market.market_winning_outcome_index.is_none(),
        CoreError::CreationMarketHasWinningOutcome
    );

    require!(!market.suspended, CoreError::CreationMarketSuspended);

    require!(
        *market_lock_timestamp > now,
        CoreError::CreationMarketLocked
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_market_valid() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, now);
        assert!(result.is_ok());
    }

    #[test]
    fn market_lock_time_in_past() {
        let time_in_past: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_past, false, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, time_in_future);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketLocked"));
    }

    #[test]
    fn market_not_open() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Settled, None);

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketNotOpen"));
    }

    #[test]
    fn market_suspended() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, true, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketSuspended"));
    }

    #[test]
    fn winning_outcome_set() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, Some(1));

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketHasWinningOutcome"));
    }

    fn create_test_market(
        market_lock_timestamp: UnixTimestamp,
        suspended: bool,
        market_status: MarketStatus,
        market_winning_outcome_index: Option<u16>,
    ) -> Market {
        Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index,
            market_type: Default::default(),
            market_type_discriminator: "".to_string(),
            market_type_value: "".to_string(),
            version: 0,
            market_lock_timestamp,
            market_settle_timestamp: None,
            title: String::from("META"),
            market_status,
            escrow_account_bump: 0,
            published: true,
            suspended,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            unsettled_accounts_count: 0,
        }
    }
}
