# BEFORE on Devnet

BEFORE records a prediction or commitment in one **legacy Solana transaction** on **Devnet only**. The wallet pays the network fee and rent for two accounts. The app does not request an airdrop, hold wallet keys, or send SOL to another user.

## Transaction and evidence

The six top-level instructions are fixed and ordered:

1. System Program creates a new mint account, funded by the wallet with the RPC rent-exempt minimum for `MINT_SIZE`, owned by the standard SPL Token Program.
2. SPL Token initializes the mint with `decimals = 0`, wallet as initial mint authority, and **no freeze authority**.
3. Associated Token Program creates the wallet's ATA for that mint.
4. SPL Token mints **exactly 1** unit to that ATA.
5. SPL Token sets mint authority to `null`, preventing further issuance.
6. Memo Program records UTF-8 JSON: `{"v":1,"statement":"...","kind":"prediction|commitment","theme":"blue|green|pink","mint":"<base58 address>"}`. The wallet signs this Memo instruction; the original statement is limited to 180 UTF-8 bytes.

All six instructions succeed or fail atomically. The newly generated mint keypair exists in browser memory only while preparing the transaction. Its secret is neither persisted nor included in the Memo. The wallet signs the exact transaction already partially signed by the mint.

This is a standard SPL Token mint with one unit. There is no metadata protocol, image, or NFT standard attached to the token. The visual card is rendered by the app from the Memo fields. A later transfer or burn can change present ownership or supply, so the receipt proves the **creation event and recipient at that time**, not permanent wallet ownership.

## Network and cost guardrails

The app checks the RPC `getGenesisHash` against Devnet's known hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before preparation, submission, and receipt lookup. The default RPC is `https://api.devnet.solana.com`; `VITE_SOLANA_RPC_URL` can point to another public Devnet endpoint. A wrong-cluster endpoint fails closed. The wallet should also be set to Devnet.

Before asking the wallet to sign, the app reads current rent for `MINT_SIZE` and `ACCOUNT_SIZE`, obtains the exact fee for the compiled message, checks wallet balance, and simulates without signature verification. The displayed total is `mint account rent + ATA rent + network fee`. Actual charged fee is available in the receipt. Preparation expires after 60 seconds or when its blockhash expires.

No live faucet or transaction is part of the automated tests. A manual Devnet test needs a wallet with enough Devnet SOL.

## Receipt verification

`fetchRecord(signature)` reads the transaction from the checked Devnet RPC. It rejects failed transactions, non-legacy messages, missing signatures, or any deviation from the six-instruction compiled message. It verifies both signatures cryptographically, parses the strict Memo schema and matching mint, and checks the transaction's post-token balance: one unit with zero decimals in the wallet's derived ATA. A free-standing Memo or a different token issue cannot pass this verifier. Public Explorer links include `?cluster=devnet`.

If broadcast or confirmation becomes inconclusive, `PendingRecordError.signature` keeps the signature available for Explorer lookup before the user retries. Network congestion or RPC history retention can delay or prevent receipt lookup; a missing RPC response is not proof that the transaction failed.

## Primary references

- [Solana clusters and public endpoints](https://solana.com/docs/references/clusters)
- [Solana `getGenesisHash` RPC](https://solana.com/docs/rpc/http/getgenesishash)
- [Solana `getTransaction` RPC](https://solana.com/docs/rpc/http/gettransaction)
- [Solana transaction JSON structures](https://solana.com/docs/rpc/json-structures)
- [Solana core Devnet genesis constant](https://github.com/solana-labs/solana/blob/master/sdk/src/genesis_config.rs)
- [SPL Token JavaScript API](https://solana-labs.github.io/solana-program-library/token/js/modules.html)
