# Hackathon submission card

**Project:** BEFORE  
**Network:** Solana Devnet  
**Public repository:** NOT YET PUBLISHED — add the verified public GitHub URL before submitting.  
**Live browser app:** NOT YET DEPLOYED — add and open-test the URL before submitting.  
**Demo video (3 minutes maximum):** NOT YET RECORDED — follow [DEMO.md](DEMO.md) and link the uploaded video before submitting.

## Short description

BEFORE turns a prediction or commitment (up to 180 UTF-8 bytes) into a public Solana Devnet receipt. The connected wallet creates a zero-decimal SPL token with one unit, receives that unit, and signs a structured Memo containing the statement, type, visual theme, and mint address in the same atomic transaction. Mint authority is revoked and freeze authority is absent. The app validates the confirmed transaction and shows the mint and receipt only after it verifies on chain.

## Why

A wallet signature can make a statement's publication date inspectable without asking the user to trust an app database. BEFORE makes that moment legible: the signer sees what becomes public, what SOL goes to network fees and account rent, and what the receipt does and does not prove.

## Design choice we're proudest of

The signing review treats the statement and its on-chain cost as the main event, so the user can read the exact public record before the wallet opens.

## On-chain footprint

- Cluster: Solana Devnet (`https://api.devnet.solana.com` by default).
- Programs: System Program (`11111111111111111111111111111111`); SPL Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`); Associated Token Account Program (`ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`); SPL Memo Program v3 (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`).
- Mint: created dynamically for each receipt; copy the actual address from the confirmed receipt. No static mint address exists before a user submits a transaction.
- External protocol: none. Solana's public RPC submits and reads transactions; Solana Explorer is used to inspect a confirmed signature.
- Fees: network transaction fee and rent-exempt balances for accounts created by the transaction are paid by the connected wallet. The app has no platform fee and receives no SOL.

## Submission checklist

- [ ] Publish the repository and add its URL above.
- [ ] Deploy the app and confirm it loads in a browser with a standard Devnet wallet; add its live URL above.
- [ ] Complete a fresh, real Devnet transaction from the app, verify its signature and all instructions on Devnet Explorer, and save the evidence.
- [ ] Record and link a video of no more than three minutes. It must show the review/signing screen, wallet approval, chain confirmation, and the resulting receipt.
- [ ] Keep `.env.example` in the repository and ensure it contains only the public Devnet RPC setting.
- [ ] If any work predates the hackathon opening, identify that work and clearly describe the new work before submission. Current project notes say this app was started for the current build; confirm this is accurate.
- [ ] Confirm team size (maximum four), one submission per person, and the event's current submission window.

## Limits to state honestly

This is a Devnet proof of publication, not proof that a prediction came true. The statement is public and durable. A token can be transferred or burned after minting, so the receipt proves creation and the recipient at that time, not permanent ownership. The app does not attach token metadata or artwork, and does not claim a wallet-rendered NFT. Devnet assets have no economic value and Devnet may reset. Do not describe the app as deployed, live, or demoed until those steps are complete.
