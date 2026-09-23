import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, Transaction, type VersionedTransactionResponse } from '@solana/web3.js';
import { connection, formatSol, prepareRecord, submitRecord, validateDraft, verifyRecordTransaction, type RecordDraft } from './chain';

const draft: RecordDraft = { statement: 'I will ship the prototype tomorrow.', kind: 'commitment', theme: 'blue' };
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58(input: Uint8Array): string {
  let value = 0n;
  for (const byte of input) value = value * 256n + BigInt(byte);
  let text = '';
  while (value > 0n) { text = alphabet[Number(value % 58n)] + text; value /= 58n; }
  for (const byte of input) { if (byte !== 0) break; text = `1${text}`; }
  return text || '1';
}

afterEach(() => vi.restoreAllMocks());

describe('draft and display', () => {
  it('counts UTF-8 bytes rather than characters', () => {
    expect(validateDraft({ ...draft, statement: 'é'.repeat(90) })).toBeNull();
    expect(validateDraft({ ...draft, statement: 'é'.repeat(91) })).toMatch(/180/);
    expect(validateDraft({ ...draft, statement: ' hi ' })).toMatch(/spaces/);
  });

  it('formats integer lamports without floating-point loss', () => {
    expect(formatSol(1_234_567_890n)).toBe('1.23456789');
    expect(formatSol(5_000n)).toBe('0.000005');
  });
});

describe('atomic proof', () => {
  async function fixture() {
    const owner = Keypair.generate();
    vi.spyOn(connection, 'getGenesisHash').mockResolvedValue('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    vi.spyOn(connection, 'getMinimumBalanceForRentExemption')
      .mockResolvedValueOnce(1_461_600).mockResolvedValueOnce(2_039_280);
    vi.spyOn(connection, 'getBalance').mockResolvedValue(10_000_000);
    vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 });
    vi.spyOn(connection, 'getFeeForMessage').mockResolvedValue({ context: { slot: 1 }, value: 10_000 });
    vi.spyOn(connection, 'simulateTransaction').mockResolvedValue({ value: { err: null } } as never);
    const prepared = await prepareRecord(owner.publicKey, draft);
    const tx = prepared.transaction;
    tx.partialSign(owner);
    const message = tx.compileMessage();
    const signatures = tx.signatures.map(entry => base58(entry.signature!));
    const signature = signatures[0];
    const mintIndex = message.accountKeys.findIndex(key => key.toBase58() === prepared.mint);
    const ataIndex = message.accountKeys.findIndex(key => key.toBase58() === tx.instructions[2].keys[1].pubkey.toBase58());
    const preBalances = Array(message.accountKeys.length).fill(0);
    const postBalances = Array(message.accountKeys.length).fill(0);
    preBalances[0] = 10_000_000;
    postBalances[0] = 10_000_000 - 1_461_600 - 2_039_280 - 10_000;
    postBalances[mintIndex] = 1_461_600;
    postBalances[ataIndex] = 2_039_280;
    const response = {
      version: 'legacy', slot: 123, blockTime: 1_700_000_000,
      transaction: { message, signatures },
      meta: {
        err: null, fee: 10_000, preBalances, postBalances,
        postTokenBalances: [{ accountIndex: ataIndex, mint: prepared.mint, owner: owner.publicKey.toBase58(), uiTokenAmount: { amount: '1', decimals: 0, uiAmount: 1, uiAmountString: '1' } }],
      },
    } as VersionedTransactionResponse;
    return { owner, prepared, tx, signature, response };
  }

  it('assembles only the six expected instructions and exact funding disclosure', async () => {
    const { prepared, tx } = await fixture();
    expect(tx.instructions).toHaveLength(6);
    expect(prepared.rentLamports).toBe(3_500_880n);
    expect(prepared.feeLamports).toBe(10_000n);
    expect(prepared.totalLamports).toBe(3_510_880n);
    expect(tx.verifySignatures()).toBe(true);
  });

  it('accepts a complete signed issue and rejects a memo-only or edited issue', async () => {
    const { prepared, signature, response } = await fixture();
    expect(verifyRecordTransaction(signature, response)).toMatchObject({ mint: prepared.mint, statement: draft.statement, slot: 123 });
    const changedBalance = {
      ...response,
      meta: {
        ...response.meta!,
        postTokenBalances: response.meta!.postTokenBalances!.map(balance => ({
          ...balance,
          uiTokenAmount: { ...balance.uiTokenAmount, amount: '0' },
        })),
      },
    } as VersionedTransactionResponse;
    expect(() => verifyRecordTransaction(signature, changedBalance)).toThrow(/balance/i);
    const message = response.transaction.message as unknown as { instructions: unknown[] };
    message.instructions = [message.instructions[5]];
    expect(() => verifyRecordTransaction(signature, response)).toThrow(/structure/i);
  });

  it('refuses cost or transaction edits before asking the wallet to sign', async () => {
    const { prepared } = await fixture();
    const walletSign = vi.fn(async (tx: Transaction) => tx);
    prepared.feeLamports = 1n;
    await expect(submitRecord(prepared, walletSign)).rejects.toThrow(/changed/);
    expect(walletSign).not.toHaveBeenCalled();
    prepared.feeLamports = 10_000n;
    prepared.transaction.instructions[3].data[1] ^= 1;
    await expect(submitRecord(prepared, walletSign)).rejects.toThrow(/changed/);
    expect(walletSign).not.toHaveBeenCalled();
  });

  it('rejects a Memo bound to another mint and an invalid mint signature', async () => {
    const { signature, response } = await fixture();
    const wrongSignature = {
      ...response,
      transaction: { ...response.transaction, signatures: [signature, signature] },
    } as VersionedTransactionResponse;
    expect(() => verifyRecordTransaction(signature, wrongSignature)).toThrow(/signature/i);

    const otherMint = Keypair.generate().publicKey.toBase58();
    const altered = JSON.stringify({ v: 1, statement: draft.statement, kind: draft.kind, theme: draft.theme, mint: otherMint });
    (response.transaction.message as unknown as { instructions: { data: string }[] }).instructions[5].data = base58(new TextEncoder().encode(altered));
    expect(() => verifyRecordTransaction(signature, response)).toThrow(/Memo mint/i);
  });

  it('does not invent fee or block time when receipt metadata is invalid', async () => {
    const { signature, response } = await fixture();
    const noTime = { ...response, blockTime: null } as VersionedTransactionResponse;
    expect(verifyRecordTransaction(signature, noTime).blockTime).toBeNull();
    const noFee = { ...response, meta: { ...response.meta!, fee: null } } as unknown as VersionedTransactionResponse;
    expect(() => verifyRecordTransaction(signature, noFee)).toThrow(/metadata/);
  });
});
