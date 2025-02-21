<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### Table of Contents

*   [getMarketAccounts][1]
    *   [Parameters][2]
    *   [Examples][3]
*   [uiStakeToInteger][4]
    *   [Parameters][5]
    *   [Examples][6]
*   [findEscrowPda][7]
    *   [Parameters][8]
    *   [Examples][9]
*   [getMintInfo][10]
    *   [Parameters][11]
    *   [Examples][12]
*   [findProductPda][13]
    *   [Parameters][14]
    *   [Examples][15]
*   [signAndSendInstructions][16]
    *   [Parameters][17]
    *   [Examples][18]
*   [signAndSendInstructionsBatch][19]
    *   [Parameters][20]
    *   [Examples][21]
*   [confirmTransaction][22]
    *   [Parameters][23]
    *   [Examples][24]

## getMarketAccounts

For the provided market, outcome, price and forOutcome condition - return all the necessary PDAs and account information required for order creation.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `marketPk` **PublicKey** {PublicKey} publicKey of a market
*   `forOutcome` **[boolean][25]** {boolean} bool representing for or against a market outcome
*   `marketOutcomeIndex` **[number][26]** {number} index representing the chosen outcome of a market
*   `price` **[number][26]** {number} price for order

### Examples

```javascript
const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
const forOutcome = true
const marketOutcomeIndex = 0
const price = 5.9
const marketAccounts = await getMarketAccounts(program, marketPK, forOutcome, marketOutcomeIndex, price)
```

Returns **[Promise][27]\<ClientResponse\<MarketAccountsForCreateOrder>>**&#x20;

## uiStakeToInteger

For the provided stake and market, get a BN representation of the stake adjusted for the decimals on that markets token.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `stake` **[number][26]** {number} ui stake amount, i.e. how many tokens a wallet wishes to stake on an outcome
*   `marketPk` **PublicKey** {PublicKey} publicKey of a market
*   `mintDecimals` **[number][26]?**&#x20;
*   `mintDecimal`  {number} Optional: the decimal number used on the mint for the market (for example USDT has 6 decimals)

### Examples

```javascript
const uiStake = await uiStakeToInteger(20, new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D'), program)
// returns 20_000_000_000 represented as a BN for a token with 9 decimals
```

Returns **BN** ui stake adjusted for the market token decimal places

## findEscrowPda

For the provided market publicKey, return the escrow account PDA (publicKey) for that market.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `marketPk` **PublicKey** {PublicKey} publicKey of a market

### Examples

```javascript
const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
const escrowPda = await findEscrowPda(program, marketPK)
```

Returns **FindPdaResponse** PDA of the escrow account

## getMintInfo

For the provided spl-token, get the mint info for that token.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `mintPK` **PublicKey** {PublicKey} publicKey of an spl-token

### Examples

```javascript
const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
const getMintInfo = await findEscrowPda(program, mintPk)
```

Returns **MintInfo** mint information including mint authority and decimals

## findProductPda

For the provided product title, get the pda for the Product account

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `productTitle` **[string][28]** title of product

### Examples

```javascript
const productPk = await findProductPda(program, "EXAMPLE_BETTING_EXCHANGE")
```

Returns **[Promise][27]\<PublicKey>**&#x20;

## signAndSendInstructions

Sign and send, as the provider authority, the given transaction instructions.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `instructions` **[Array][29]\<TransactionInstruction>** {TransactionInstruction\[]} list of instruction for the transaction
*   `computeUnitLimit` **[number][26]?** {number} optional limit on the number of compute units to be used by the transaction

### Examples

```javascript
const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const computeUnitLimit = 1400000
const transaction = await signAndSendInstruction(program, [orderInstruction.data.instruction], computeUnitLimit)
```

Returns **SignAndSendInstructionsResponse** containing the signature of the transaction

## signAndSendInstructionsBatch

Sign and send, as the provider authority, the given transaction instructions in the provided batch sizes.

Note: batches can be optimised for size by ensuring that instructions have commonality among accounts (same walletPk, same marketPk, same marketMatchingPoolPk, etc.)

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `instructions` **[Array][29]\<TransactionInstruction>** {TransactionInstruction\[]} list of instruction for the transaction
*   `batchSize` **[number][26]** {number} number of instructions to be included in each transaction
*   `computeUnitLimit` **[number][26]?** {number} optional limit on the number of compute units to be used by the transaction

### Examples

```javascript
const orderInstruction1 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
...
const orderInstruction20 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const batchSize = 5
const computeUnitLimit = 1400000
const transactions = await signAndSendInstructionsBatch(program, [orderInstruction1.data.instruction, ..., orderInstruction20.data.instruction], batchSize, computeUnitLimit)
```

Returns **SignAndSendInstructionsBatchResponse** containing the signature of the transaction

Returns **any**&#x20;

## confirmTransaction

For the provided transaction signature, confirm the transaction.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `signature` **([string][28] | void)** {string | void} signature of the transaction

### Examples

```javascript
const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const transaction = await signAndSendInstruction(program, orderInstruction.data.instruction)
const confirmation = await confirmTransaction(program, transaction.data.signature);
```

Returns **ClientResponse\<unknown>** empty client response containing no data, only success state and errors

[1]: #getmarketaccounts

[2]: #parameters

[3]: #examples

[4]: #uistaketointeger

[5]: #parameters-1

[6]: #examples-1

[7]: #findescrowpda

[8]: #parameters-2

[9]: #examples-2

[10]: #getmintinfo

[11]: #parameters-3

[12]: #examples-3

[13]: #findproductpda

[14]: #parameters-4

[15]: #examples-4

[16]: #signandsendinstructions

[17]: #parameters-5

[18]: #examples-5

[19]: #signandsendinstructionsbatch

[20]: #parameters-6

[21]: #examples-6

[22]: #confirmtransaction

[23]: #parameters-7

[24]: #examples-7

[25]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean

[26]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number

[27]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise

[28]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String

[29]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array
