# Demo recording plan (maximum 3 minutes)

Record a real end-to-end transaction on Solana Devnet. Keep the wallet visible for the signature step and show the confirmed transaction afterward. Never show a seed phrase, private key, or unrelated wallet data. Do not substitute a mock receipt or pre-recorded success state.

## Before recording

1. Deploy the current build to its browser URL and open it in a clean browser session.
2. Connect a standard wallet set to **Devnet** and confirm it has test SOL.
3. Have the user choose a short statement they are comfortable publishing permanently. The statement must not contain private or identifying information.
4. Confirm the signing review is displaying the exact memo, the one-unit token result, account rent, the transaction fee estimate, and the public-record warning.
5. Verify that the app uses the Devnet endpoint. If using a custom RPC, disclose that endpoint in the README.

## Suggested 2:30–2:50 run of show

- **0:00–0:20 — What it does:** “BEFORE creates a public, wallet-signed Devnet receipt for this statement. It creates a zero-decimal token with one unit, sends it to my wallet, revokes its mint authority, and puts a structured Memo with the statement in the same transaction. This is a timestamped record, not proof the prediction is true.”
- **0:20–0:45 — Compose:** Choose the statement type and enter a short prediction or commitment. Show the interface and connected Devnet wallet.
- **0:45–1:10 — Explain before signing:** Pause on the app's review screen. Point to the exact statement, what accounts/tokens will be created, one token received, estimated network fee, rent paid for new accounts, and warning that the memo is public and permanent. State that the app charges no fee.
- **1:10–1:35 — Sign:** Click the sign action and show the wallet transaction. Review the actual transaction contents and approve it. Never imply wallet confirmation before approval.
- **1:35–2:05 — Confirm:** Return to the app and wait for real Devnet confirmation. Show the resulting mint address, signature, and confirmation status.
- **2:05–2:35 — Verify:** Open the signature on Solana Explorer with **Devnet** selected. Show the successful transaction, Memo instruction, mint/account instructions, token result, and signer. Explain that the receipt proves creation and recipient at that time, while later ownership can change. Call out that Devnet assets have no economic value.
- **2:35–2:45 — Design line:** “The design choice I'm proudest of is putting the public statement and its costs on the review screen before the wallet opens.”

If confirmation fails, show the failure honestly and do not present it as a successful demo. Record a new complete take after the cause is fixed. Keep the final uploaded video at or below three minutes.

