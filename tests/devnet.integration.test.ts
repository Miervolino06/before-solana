import { describe, it, expect } from 'vitest';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getMint, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { connection, prepareRecord, submitRecord, fetchRecord } from '../src/chain';

// Opt-in live test only. The ephemeral signer never leaves memory and only uses faucet SOL.
describe.skipIf(process.env.RUN_DEVNET_TEST !== '1')('live Devnet integration', () => {
  it('creates exactly one token, removes mint authority, and reads its signed statement from chain', async () => {
    const owner = Keypair.generate();
    const airdrop = await connection.requestAirdrop(owner.publicKey, LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    const funding = await connection.confirmTransaction({ signature: airdrop, ...latest }, 'confirmed');
    expect(funding.value.err).toBeNull();
    const prepared = await prepareRecord(owner.publicKey, {
      statement: 'BEFORE live integration check: this statement was sealed on Solana devnet.',
      kind: 'commitment', theme: 'blue',
    });
    const receipt = await submitRecord(prepared, async transaction => { transaction.partialSign(owner); return transaction; });
    const mint = await getMint(connection, prepared.transaction.instructions[0].keys[1].pubkey, 'confirmed');
    expect(mint.decimals).toBe(0);
    expect(mint.supply).toBe(1n);
    expect(mint.mintAuthority).toBeNull();
    expect(mint.freezeAuthority).toBeNull();
    const account = await getAccount(connection, getAssociatedTokenAddressSync(mint.address, owner.publicKey), 'confirmed');
    expect(account.amount).toBe(1n);
    const loaded = await fetchRecord(receipt.signature);
    expect(loaded.statement).toBe(prepared.draft.statement);
    expect(loaded.owner).toBe(owner.publicKey.toBase58());
    console.log(JSON.stringify({ liveDevnet: true, signature: receipt.signature, mint: receipt.mint, owner: receipt.owner, slot: receipt.slot, blockTime: receipt.blockTime, feeLamports: receipt.networkFeeLamports.toString(), rentLamports: prepared.rentLamports.toString() }));
  }, 150_000);
});
