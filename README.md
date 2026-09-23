# BEFORE

BEFORE turns a short prediction or commitment into a public Devnet receipt: one zero-decimal SPL token is minted to the connected wallet, its mint authority is revoked, and the signed statement is recorded by the Memo Program in the same transaction. The app shows the transaction only after it confirms on chain. The statement is limited to 180 UTF-8 bytes.

## Run locally

Requirements: Node.js 20 or newer and npm. Copy `.env.example` to `.env.local` if you want to override the public RPC endpoint, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`; `npm run preview` serves that build locally. `npm test` runs the project tests. The app uses a standard browser wallet (Phantom is currently wired in) configured for Solana Devnet. Fund a Devnet wallet with test SOL from the [Devnet faucet](https://faucet.solana.com/) before creating a receipt.

`VITE_SOLANA_RPC_URL` is a browser-visible RPC endpoint, not a secret. Vite exposes variables prefixed with `VITE_` in the client bundle. Never put a seed phrase, private key, authenticated RPC credential, or other secret in a `VITE_` variable or this repository. The default endpoint is `https://api.devnet.solana.com`.

## Network and on-chain addresses

Network: **Solana Devnet**. The token mint is created per receipt, so there is no fixed mint address. The confirmed receipt displays its generated mint address and transaction signature; use those values to inspect that specific record in Solana Explorer with the cluster set to Devnet.

The app uses these existing programs:

| Program | Address | Use |
| --- | --- | --- |
| System Program | `11111111111111111111111111111111` | Create and fund the mint account |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | Initialize mint, mint one unit, revoke mint authority |
| Associated Token Account Program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | Create the wallet's token account |
| SPL Memo Program v3 | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | Include the user's statement in the signed transaction |

The token has zero decimals and a supply of one. The app revokes its mint authority and does not enable a freeze authority. The app does not deploy its own program, create token metadata, or claim the token is a standards-based NFT. No external trading, indexing, or fee protocol is used. The public Solana RPC and Explorer are infrastructure used to submit/read the transaction and inspect its result.

## What a signature does

Before asking the wallet to sign, the review screen should show the statement that will be public, the token and account creation, the one token the wallet receives, the rent-exempt SOL needed for new accounts, the network fee estimate, and the permanent-publication risk. Rent and fees are paid by the wallet to the network; the app charges no fee and receives no SOL. Verify the final transaction and its costs in the wallet before approving. A transaction fee may still be charged if a submitted transaction fails.

The statement is public and cannot be retracted from the ledger. A timestamp proves that the statement was published; it does not prove that a prediction is correct or establish the truth of an identity or claim. The token may later be transferred or burned; the receipt proves its creation and recipient at that time, not permanent ownership. Devnet tokens have no economic value and Devnet state can be reset.

## Design and implementation notes

Product scope, network, constraints, and known evidence gaps are recorded in [PRODUCT.md](PRODUCT.md). The transaction flow and signing disclosure are described in [docs/CHAIN.md](docs/CHAIN.md). Submission status and the short description/design statement are in [docs/SUBMISSION.md](docs/SUBMISSION.md); the <=3 minute real-transaction recording guide is in [docs/DEMO.md](docs/DEMO.md).

The interface uses Manrope and Archivo variable fonts, distributed under SIL Open Font License 1.1, and Lucide icons from `lucide-react` under ISC. React and React DOM are MIT-licensed. The project license is MIT; see [LICENSE](LICENSE). No third-party wallet branding or artwork is presented as BEFORE's identity.

