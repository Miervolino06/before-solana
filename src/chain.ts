import { Buffer } from 'buffer';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Message,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type VersionedTransactionResponse,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

export type RecordDraft = {
  statement: string;
  kind: 'prediction' | 'commitment';
  theme: 'blue' | 'green' | 'pink';
};

export type PreparedRecord = {
  transaction: Transaction;
  mint: string;
  owner: string;
  draft: RecordDraft;
  rentLamports: bigint;
  feeLamports: bigint;
  totalLamports: bigint;
  balanceLamports: bigint;
  blockhash: string;
  lastValidBlockHeight: number;
  preparedAt: number;
};

export type RecordReceipt = {
  signature: string;
  mint: string;
  owner: string;
  statement: string;
  kind: RecordDraft['kind'];
  theme: RecordDraft['theme'];
  slot: number;
  blockTime: number | null;
  networkFeeLamports: bigint;
};

export const NETWORK = 'devnet' as const;
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const connection = new Connection(RPC_URL, 'confirmed');

// Solana's published Devnet genesis hash, not the example response on the RPC docs page.
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const MAX_STATEMENT_BYTES = 180;
const MAX_PREPARED_AGE_MS = 60_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// Node and browser polyfills may supply different Buffer constructors.
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
const preparedGuards = new WeakMap<PreparedRecord, {
  message: Buffer;
  mint: string;
  owner: string;
  draft: RecordDraft;
  rentLamports: bigint;
  feeLamports: bigint;
  totalLamports: bigint;
  balanceLamports: bigint;
  blockhash: string;
  lastValidBlockHeight: number;
  preparedAt: number;
}>();

export class PendingRecordError extends Error {
  constructor(message: string, public readonly signature: string) {
    super(message);
    this.name = 'PendingRecordError';
  }
}

export class FailedRecordError extends Error {
  constructor(message: string, public readonly signature: string) {
    super(message);
    this.name = 'FailedRecordError';
  }
}

export function formatSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const value = negative ? -lamports : lamports;
  const whole = value / BigInt(LAMPORTS_PER_SOL);
  const fraction = (value % BigInt(LAMPORTS_PER_SOL)).toString().padStart(9, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function validateDraft(draft: RecordDraft): string | null {
  if (!draft || typeof draft.statement !== 'string') return 'Write a prediction or commitment.';
  if (!draft.statement.trim()) return 'Write a prediction or commitment.';
  if (draft.statement !== draft.statement.trim()) return 'Remove spaces at the start or end.';
  if (/[\u0000-\u001f\u007f]/u.test(draft.statement)) return 'Line breaks and control characters are not allowed.';
  if (encoder.encode(draft.statement).length > MAX_STATEMENT_BYTES) return `Statement must be at most ${MAX_STATEMENT_BYTES} UTF-8 bytes.`;
  if (draft.kind !== 'prediction' && draft.kind !== 'commitment') return 'Choose prediction or commitment.';
  if (draft.theme !== 'blue' && draft.theme !== 'green' && draft.theme !== 'pink') return 'Choose a valid color.';
  return null;
}

async function assertDevnet(): Promise<void> {
  const actual = await connection.getGenesisHash();
  if (actual !== DEVNET_GENESIS_HASH) throw new Error('RPC is connected to another network. Choose a Solana Devnet endpoint.');
}

function memoData(draft: RecordDraft, mint: PublicKey): Buffer {
  return Buffer.from(encoder.encode(JSON.stringify({ v: 1, statement: draft.statement, kind: draft.kind, theme: draft.theme, mint: mint.toBase58() })));
}

function recordInstructions(owner: PublicKey, mint: PublicKey, draft: RecordDraft, mintRent: number): TransactionInstruction[] {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  return [
    SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: mint, lamports: mintRent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(mint, 0, owner, null, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createMintToInstruction(mint, ata, owner, 1n, [], TOKEN_PROGRAM_ID),
    createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
      data: memoData(draft, mint),
    }),
  ];
}

export async function prepareRecord(owner: PublicKey, draft: RecordDraft): Promise<PreparedRecord> {
  const validation = validateDraft(draft);
  if (validation) throw new Error(validation);
  await assertDevnet();

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const [mintRent, ataRent, balance, latest] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
    connection.getBalance(owner, 'confirmed'),
    connection.getLatestBlockhash('confirmed'),
  ]);
  const transaction = new Transaction({ feePayer: owner, recentBlockhash: latest.blockhash });
  transaction.add(...recordInstructions(owner, mint, draft, mintRent));
  transaction.partialSign(mintKeypair);

  const fee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  if (fee.value === null) throw new Error('Network fee is unavailable. Prepare again.');
  const rentLamports = BigInt(mintRent) + BigInt(ataRent);
  const feeLamports = BigInt(fee.value);
  const totalLamports = rentLamports + feeLamports;
  if (BigInt(balance) < totalLamports) {
    throw new Error(`Insufficient Devnet balance: ${formatSol(totalLamports)} SOL needed for account rent and fee; wallet has ${formatSol(BigInt(balance))} SOL. Add Devnet SOL and retry.`);
  }
  // The wallet has not signed yet. Simulation explicitly skips signature verification.
  const simulation = await connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), { sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' });
  if (simulation.value.err) throw new Error(`Devnet simulation failed: ${JSON.stringify(simulation.value.err)}.`);
  const prepared: PreparedRecord = {
    transaction,
    mint: mint.toBase58(),
    owner: owner.toBase58(),
    draft: { ...draft },
    rentLamports,
    feeLamports,
    totalLamports,
    balanceLamports: BigInt(balance),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    preparedAt: Date.now(),
  };
  preparedGuards.set(prepared, {
    message: Buffer.from(transaction.serializeMessage()),
    mint: prepared.mint, owner: prepared.owner, draft: { ...draft },
    rentLamports, feeLamports, totalLamports, balanceLamports: prepared.balanceLamports,
    blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight,
    preparedAt: prepared.preparedAt,
  });
  return prepared;
}

export async function submitRecord(
  prepared: PreparedRecord,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<RecordReceipt> {
  await assertDevnet();
  const guard = preparedGuards.get(prepared);
  if (!guard || !bytesEqual(guard.message, prepared.transaction.serializeMessage()) ||
      guard.mint !== prepared.mint || guard.owner !== prepared.owner ||
      guard.draft.statement !== prepared.draft.statement || guard.draft.kind !== prepared.draft.kind || guard.draft.theme !== prepared.draft.theme ||
      guard.rentLamports !== prepared.rentLamports || guard.feeLamports !== prepared.feeLamports || guard.totalLamports !== prepared.totalLamports ||
      guard.balanceLamports !== prepared.balanceLamports || guard.blockhash !== prepared.blockhash ||
      guard.lastValidBlockHeight !== prepared.lastValidBlockHeight || guard.preparedAt !== prepared.preparedAt) {
    throw new Error('Prepared record changed. Review costs and prepare again.');
  }
  if (Date.now() - prepared.preparedAt > MAX_PREPARED_AGE_MS) throw new Error('Preparation expired. Review costs and prepare again.');
  if (await connection.getBlockHeight('confirmed') > prepared.lastValidBlockHeight) throw new Error('Blockhash expired. Prepare again.');
  const owner = new PublicKey(prepared.owner);
  const mint = new PublicKey(prepared.mint);
  const original = prepared.transaction;
  if (!original.feePayer?.equals(owner) || original.recentBlockhash !== prepared.blockhash) throw new Error('Prepared transaction changed. Prepare again.');
  const invalidDraft = validateDraft(prepared.draft);
  if (invalidDraft) throw new Error(invalidDraft);
  const systemData = original.instructions[0]?.data;
  if (!systemData || systemData.length !== 52) throw new Error('Prepared mint creation is invalid.');
  const mintRent = Number(systemData.readBigUInt64LE(4));
  if (!Number.isSafeInteger(mintRent) || mintRent <= 0 || prepared.rentLamports < BigInt(mintRent)) throw new Error('Prepared rent is invalid.');
  if (prepared.feeLamports < 0n || prepared.totalLamports !== prepared.rentLamports + prepared.feeLamports || prepared.balanceLamports < prepared.totalLamports) {
    throw new Error('Prepared cost disclosure is invalid. Prepare again.');
  }
  const expectedInstructions = recordInstructions(owner, mint, prepared.draft, mintRent);
  if (original.instructions.length !== expectedInstructions.length ||
      !original.instructions.every((instruction, index) =>
        instruction.programId.equals(expectedInstructions[index].programId) &&
        bytesEqual(instruction.data, expectedInstructions[index].data) &&
        instruction.keys.length === expectedInstructions[index].keys.length &&
        instruction.keys.every((key, keyIndex) =>
          key.pubkey.equals(expectedInstructions[index].keys[keyIndex].pubkey) &&
          key.isSigner === expectedInstructions[index].keys[keyIndex].isSigner &&
          key.isWritable === expectedInstructions[index].keys[keyIndex].isWritable))) {
    throw new Error('Prepared instructions changed. Prepare again.');
  }
  const expectedMessage = original.serializeMessage();
  const originalMintSignature = original.signatures.find(item => item.publicKey.equals(mint))?.signature;
  if (!originalMintSignature) throw new Error('Temporary mint signature is missing. Prepare again.');
  if (!original.verifySignatures(false)) throw new Error('Temporary mint signature is invalid. Prepare again.');
  const signed = await signTransaction(original);
  if (!bytesEqual(signed.serializeMessage(), expectedMessage)) throw new Error('Wallet changed the transaction. Request canceled.');
  const signedMintSignature = signed.signatures.find(item => item.publicKey.equals(mint))?.signature;
  if (!signedMintSignature || !bytesEqual(signedMintSignature, originalMintSignature) || !signed.verifySignatures()) throw new Error('Wallet did not preserve the required signatures. Request canceled.');
  const raw = signed.serialize();
  const ownerSignature = signed.signatures.find(item => item.publicKey.equals(owner))?.signature;
  if (!ownerSignature) throw new Error('Wallet signature is missing.');
  const knownSignature = base58Encode(ownerSignature);
  let signature = knownSignature;
  try {
    signature = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed' });
  } catch (error) {
    throw new PendingRecordError(`Submission is inconclusive. Check this signature in Explorer before retrying: ${String(error)}`, knownSignature);
  }
  try {
    const confirmation = await connection.confirmTransaction({ signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, 'confirmed');
    if (confirmation.value.err) throw new FailedRecordError(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`, signature);
    return await fetchRecord(signature);
  } catch (error) {
    if (error instanceof FailedRecordError) throw error;
    throw new PendingRecordError(`Confirmation or receipt lookup is inconclusive. Check this signature in Explorer: ${String(error)}`, signature);
  }
}

function base58Decode(input: string): Uint8Array {
  if (!input) return new Uint8Array();
  let number = 0n;
  for (const character of input) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) throw new Error('Invalid base58 data.');
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number % 256n)); number /= 256n; }
  for (const character of input) { if (character !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

function base58Encode(input: Uint8Array): string {
  let number = 0n;
  for (const byte of input) number = number * 256n + BigInt(byte);
  let result = '';
  while (number > 0n) { result = BASE58[Number(number % 58n)] + result; number /= 58n; }
  for (const byte of input) { if (byte !== 0) break; result = `1${result}`; }
  return result || '1';
}

function parseMemo(input: Uint8Array): { draft: RecordDraft; mint: PublicKey } {
  if (input.length > 512) throw new Error('Memo exceeds protocol limit.');
  const value: unknown = JSON.parse(decoder.decode(input));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Memo.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'kind,mint,statement,theme,v' || data.v !== 1 || typeof data.mint !== 'string') throw new Error('Unrecognized Memo format.');
  const draft = { statement: data.statement, kind: data.kind, theme: data.theme } as RecordDraft;
  if (validateDraft(draft)) throw new Error('Invalid Memo statement or options.');
  return { draft, mint: new PublicKey(data.mint) };
}

/** Pure verifier, exported so structurally altered RPC fixtures can be tested offline. */
export function verifyRecordTransaction(signature: string, response: VersionedTransactionResponse): RecordReceipt {
  if (response.version !== undefined && response.version !== 'legacy') throw new Error('This protocol requires a legacy transaction.');
  if (!response.meta || response.meta.err) throw new Error('Transaction did not succeed.');
  if (!Number.isSafeInteger(response.slot) || response.slot < 0 ||
      !Number.isSafeInteger(response.meta.fee) || response.meta.fee < 0 ||
      (response.blockTime != null && (!Number.isSafeInteger(response.blockTime) || response.blockTime < 0))) {
    throw new Error('Receipt metadata is invalid.');
  }
  const message = response.transaction.message as Message;
  const instructions = message.instructions;
  if (instructions.length !== 6 || !message.accountKeys.length || message.header.numRequiredSignatures !== 2) throw new Error('Invalid record structure.');
  const owner = message.accountKeys[0];
  const first = instructions[0];
  if (first.accounts.length !== 2) throw new Error('Invalid mint creation.');
  const mint = message.accountKeys[first.accounts[1]];
  if (!mint || !message.isAccountSigner(first.accounts[1])) throw new Error('Mint did not sign this transaction.');
  const memo = instructions[5];
  if (!message.accountKeys[memo.programIdIndex]?.equals(MEMO_PROGRAM_ID)) throw new Error('Memo is missing.');
  const parsed = parseMemo(base58Decode(memo.data));
  if (!parsed.mint.equals(mint)) throw new Error('Memo mint does not match the created mint.');
  const systemData = base58Decode(first.data);
  if (systemData.length !== 52) throw new Error('Invalid mint creation instruction.');
  const rent = Number(Buffer.from(systemData).readBigUInt64LE(4));
  if (!Number.isSafeInteger(rent) || rent <= 0) throw new Error('Invalid mint rent.');
  if (response.meta.preBalances[first.accounts[1]] !== 0 || response.meta.postBalances[first.accounts[1]] !== rent) throw new Error('Mint was not created with the declared rent.');
  const expectedMessage = new Transaction({ feePayer: owner, recentBlockhash: message.recentBlockhash })
    .add(...recordInstructions(owner, mint, parsed.draft, rent)).compileMessage();
  if (!bytesEqual(message.serialize(), expectedMessage.serialize())) throw new Error('Instructions do not match the BEFORE protocol.');
  const signatures = response.transaction.signatures;
  if (signatures.length !== 2 || signatures[0] !== signature) throw new Error('Invalid record signatures.');
  const legacy = Transaction.populate(message, signatures);
  if (!legacy.verifySignatures()) throw new Error('Cryptographic signature verification failed.');
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ataIndex = message.accountKeys.findIndex(key => key.equals(ata));
  const post = response.meta.postTokenBalances?.filter(balance => balance.accountIndex === ataIndex && balance.mint === mint.toBase58());
  if (ataIndex < 0 || post?.length !== 1 || post[0].uiTokenAmount.amount !== '1' || post[0].uiTokenAmount.decimals !== 0 || post[0].owner !== owner.toBase58()) {
    throw new Error('Post-transaction balance does not prove one unit in the wallet.');
  }
  return {
    signature,
    mint: mint.toBase58(),
    owner: owner.toBase58(),
    statement: parsed.draft.statement,
    kind: parsed.draft.kind,
    theme: parsed.draft.theme,
    slot: response.slot,
    blockTime: response.blockTime ?? null,
    networkFeeLamports: BigInt(response.meta.fee),
  };
}

export async function fetchRecord(signature: string): Promise<RecordReceipt> {
  await assertDevnet();
  const response = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!response) throw new Error('Transaction is not yet available from the Devnet RPC. Retry this signature shortly.');
  return verifyRecordTransaction(signature, response);
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function mintExplorerUrl(mint: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(mint)}?cluster=devnet`;
}
