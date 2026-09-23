import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, CircleDot, Copy, Download, ExternalLink, Menu, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import {
  NETWORK, explorerUrl, fetchRecord, formatSol, mintExplorerUrl, prepareRecord,
  submitRecord, validateDraft,
  type PreparedRecord, type RecordDraft, type RecordReceipt,
} from './chain';
import { artSeed, contourPaths, downloadRecordSvg } from './record-art';

type Stage = 'draft' | 'preparing' | 'review' | 'signing' | 'confirming' | 'confirmed' | 'error';
const STORE = 'before-record-signatures-v1';
const BYTE_LIMIT = 180;
const draftInitial: RecordDraft = { statement: '', kind: 'prediction', theme: 'blue' };
const examples = {
  prediction: 'The next chapter will be written by the people who started today.',
  commitment: 'I will ship my first open-source project before the year ends.',
};

function readHistory(): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === 'string').slice(0, 30) : [];
  } catch { return []; }
}
function short(value: string, front = 6, back = 5) { return `${value.slice(0, front)}…${value.slice(-back)}`; }
function chainDate(blockTime: number | null) {
  return blockTime ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(blockTime * 1000)) + ' UTC' : 'Block time unavailable';
}
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    if (/reject|declin|cancel/i.test(error.message)) return 'Signature declined in your wallet. Nothing was sealed. Review the details and try again.';
    return error.message;
  }
  return 'The request could not be completed. Check your connection and try again.';
}
function playChime() {
  try {
    const Context = window.AudioContext;
    if (!Context) return;
    const ctx = new Context();
    for (const [i, hz] of [523.25, 783.99].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * .11);
      gain.gain.linearRampToValueAtTime(.045, ctx.currentTime + i * .11 + .025);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .11 + .38);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(ctx.currentTime + i * .11);
      oscillator.stop(ctx.currentTime + i * .11 + .4);
    }
    setTimeout(() => void ctx.close(), 1000);
  } catch { /* sound is optional */ }
}

function Contours({ value }: { value: string }) {
  const paths = useMemo(() => contourPaths(artSeed(value), 720, 720), [value]);
  return <svg className="contours" viewBox="0 0 720 720" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><g>{paths.map((path, i) => <path key={i} d={path} />)}</g></svg>;
}

function PreviewCard({ draft, receipt, stage }: { draft: RecordDraft; receipt: RecordReceipt | null; stage: Stage }) {
  const shown = receipt?.statement || draft.statement || examples[draft.kind];
  const kind = receipt?.kind || draft.kind;
  const theme = receipt?.theme || draft.theme;
  return <div className={`proof-card theme-${theme} ${receipt ? 'is-sealed' : ''} ${shown.length > 120 ? 'length-long' : shown.length > 75 ? 'length-medium' : ''}`}>
    <Contours value={`${kind}:${shown}:${receipt?.mint || ''}`} />
    <div className="card-top"><span className="card-wordmark">BEFORE</span><span className="card-index">{receipt ? 'ON-CHAIN RECORD' : 'LIVE PREVIEW'}</span></div>
    <div className="card-middle"><span className="card-category">{kind.toUpperCase()} <span className="category-line" /></span><p className={`card-statement ${!draft.statement && !receipt ? 'placeholder-statement' : ''}`}>{shown}</p></div>
    <div className="card-bottom"><div className="card-rule" /><div className="card-footer"><span>ONE STATEMENT.<br />ONE TOKEN.</span><span className="card-seal">{receipt ? <><Check size={14} strokeWidth={3} /> SEALED</> : stage === 'review' ? 'READY TO SIGN' : 'DRAFT · UNSIGNED'}</span></div></div>
  </div>;
}

function Detail({ label, value, href }: { label: string; value: string; href?: string }) {
  return <div className="detail-row"><span>{label}</span>{href ? <a href={href} target="_blank" rel="noreferrer">{value} <ArrowUpRight size={15} /></a> : <strong title={value}>{value}</strong>}</div>;
}

function App() {
  const wallet = useWallet();
  const [draft, setDraft] = useState<RecordDraft>(draftInitial);
  const [stage, setStage] = useState<Stage>('draft');
  const [prepared, setPrepared] = useState<PreparedRecord | null>(null);
  const [receipt, setReceipt] = useState<RecordReceipt | null>(null);
  const [error, setError] = useState('');
  const [pendingSig, setPendingSig] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [history, setHistory] = useState<string[]>(readHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [recordSource, setRecordSource] = useState<'created' | 'link' | 'history'>('created');
  const requestId = useRef(0);
  const utf8Bytes = new TextEncoder().encode(draft.statement).length;
  const formError = validateDraft(draft);
  const busy = loadingRecord || ['preparing', 'signing', 'confirming'].includes(stage);

  const saveReceipt = useCallback((found: RecordReceipt) => {
    setReceipt(found); setPrepared(null); setPendingSig(null); setStage('confirmed'); setError('');
    setDraft({ statement: found.statement, kind: found.kind, theme: found.theme });
    setHistory(current => {
      const next = [found.signature, ...current.filter(sig => sig !== found.signature)].slice(0, 30);
      try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* receipt remains valid even when local storage is unavailable */ }
      return next;
    });
    if (soundOn) playChime();
  }, [soundOn]);

  const openRecord = useCallback(async (signature: string, source: 'link' | 'history') => {
    const currentRequest = ++requestId.current;
    setLoadingRecord(true); setError(''); setReceipt(null); setHistoryOpen(false); setRecordSource(source);
    try {
      const found = await fetchRecord(signature);
      if (requestId.current !== currentRequest) return;
      if (!found) throw new Error('No confirmed BEFORE record was found for this transaction on devnet. It may still be confirming, or this link may be invalid.');
      setReceipt(found); setPendingSig(null); setDraft({ statement: found.statement, kind: found.kind, theme: found.theme }); setStage('confirmed');
    } catch (cause) { if (requestId.current === currentRequest) { setStage('error'); setError(messageOf(cause)); } }
    finally { if (requestId.current === currentRequest) setLoadingRecord(false); }
  }, []);

  useEffect(() => {
    const signature = new URLSearchParams(location.search).get('tx');
    if (signature) void openRecord(signature, 'link');
  }, [openRecord]);
  useEffect(() => { if (wallet.wallet?.adapter) wallet.wallet.adapter.on('error', onWalletError); function onWalletError(cause: Error) { setError(messageOf(cause)); } return () => { wallet.wallet?.adapter.off('error', onWalletError); }; }, [wallet.wallet]);
  useEffect(() => {
    if (!howOpen && !historyOpen) return;
    const dialog = document.querySelector<HTMLElement>('.drawer');
    const close = dialog?.querySelector<HTMLButtonElement>('.drawer-close');
    close?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setHowOpen(false); setHistoryOpen(false); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [howOpen, historyOpen]);

  function updateDraft(patch: Partial<RecordDraft>) {
    if (busy || pendingSig) return;
    requestId.current += 1;
    setDraft(current => ({ ...current, ...patch }));
    if (stage !== 'draft') { setStage('draft'); setPrepared(null); setReceipt(null); setPendingSig(null); setAcknowledged(false); }
    setError('');
  }
  function updateStatement(value: string) {
    if (new TextEncoder().encode(value).length > BYTE_LIMIT) return;
    updateDraft({ statement: value });
  }
  async function review() {
    if (pendingSig) return;
    if (!wallet.publicKey) { setError('Connect a Solana wallet to seal a record on devnet.'); return; }
    if (formError) { setError(formError); return; }
    const currentRequest = ++requestId.current;
    setStage('preparing'); setError(''); setAcknowledged(false);
    try {
      const result = await prepareRecord(wallet.publicKey, draft);
      if (requestId.current !== currentRequest) return;
      setPrepared(result); setStage('review');
    } catch (cause) { if (requestId.current === currentRequest) { setStage('error'); setError(messageOf(cause)); } }
  }
  async function seal() {
    if (!prepared || !acknowledged || !wallet.signTransaction) return;
    if (!wallet.publicKey || wallet.publicKey.toBase58() !== prepared.owner) { setError('The connected wallet changed. Rebuild the review with the current wallet.'); setStage('draft'); setPrepared(null); return; }
    if (Date.now() - prepared.preparedAt > 60_000) { setError('The network quote expired. Refresh it before signing.'); setStage('draft'); setPrepared(null); return; }
    setStage('signing'); setError('');
    try {
      const result = await submitRecord(prepared, async transaction => {
        const signed = await wallet.signTransaction!(transaction);
        setStage('confirming');
        return signed;
      });
      setRecordSource('created'); saveReceipt(result);
    } catch (cause) {
      const maybeSig = cause && typeof cause === 'object' && 'signature' in cause && typeof cause.signature === 'string' ? cause.signature : null;
      if (maybeSig) { setPendingSig(maybeSig); setError('The transaction was sent, but confirmation is still uncertain. Check its status before trying another seal.'); }
      else { setError(messageOf(cause)); }
      setStage('error');
    }
  }
  async function checkPending() { if (pendingSig) await openRecord(pendingSig, 'link'); }
  function reset(force = false) { if (!force && (busy || pendingSig)) return; requestId.current += 1; setLoadingRecord(false); setDraft(draftInitial); setPrepared(null); setReceipt(null); setPendingSig(null); setError(''); setStage('draft'); setAcknowledged(false); window.history.replaceState(null, '', location.pathname); }
  function abandonPending() { if (window.confirm('This transaction may still confirm. Starting over could create a second public record. Continue?')) reset(true); }
  async function copyLink() {
    if (!receipt) return;
    const link = `${location.origin}${location.pathname}?tx=${encodeURIComponent(receipt.signature)}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setError('The browser could not copy the link. Use the transaction link below to share it.'); }
  }

  return <div className="site-shell">
    <div className="aurora aurora-a" aria-hidden="true" /><div className="aurora aurora-b" aria-hidden="true" />
    <header className="site-header"><button className="brand" onClick={() => reset()} disabled={busy || Boolean(pendingSig)} aria-label="BEFORE home"><span className="brand-icon" aria-hidden="true"><span /></span><span>BEFORE<span className="brand-period">.</span></span></button><nav className="nav-actions" aria-label="Primary"><button className="plain-nav" onClick={() => setHowOpen(true)}>How it works <ArrowUpRight size={15} /></button><button className="plain-nav" onClick={() => setHistoryOpen(true)}>My records <span className="nav-count">{history.length}</span></button><span className="nav-divider" /><span className="network-pill"><span /> DEVNET</span><WalletMultiButton /></nav><button className="mobile-menu" onClick={() => setHistoryOpen(true)} aria-label="Open my records"><Menu size={21} /></button></header><div className="mobile-subnav"><button onClick={() => setHowOpen(true)}>HOW IT WORKS <ArrowUpRight size={13} /></button><button onClick={() => setHistoryOpen(true)}>MY RECORDS <span>{history.length}</span></button><strong><i /> DEVNET</strong></div>

    <main className="main-grid"><section className="editorial" aria-labelledby="main-heading"><div className="editorial-head"><h1 id="main-heading">Say it.<br /><em>Before</em> it happens<span className="heading-period">.</span></h1><p className="hero-description">A moment of conviction, made public. Write a prediction or promise. Seal it with your wallet on Solana devnet.</p></div>
      {stage === 'confirmed' && receipt ? <div className="composer-state confirmed-panel"><div className="state-heading"><span className="success-mark"><Check size={24} strokeWidth={2.7} /></span><div><h2>It’s on record.</h2><p>Your statement was confirmed on Solana devnet.</p></div></div><div className="receipt-summary"><Detail label="Published" value={chainDate(receipt.blockTime)} /><Detail label="Creator" value={short(receipt.owner)} href={mintExplorerUrl(receipt.owner)} /><Detail label="Transaction" value={short(receipt.signature, 8, 7)} href={explorerUrl(receipt.signature)} /><Detail label="Unique token" value={short(receipt.mint, 8, 7)} href={mintExplorerUrl(receipt.mint)} /><Detail label="Slot" value={String(receipt.slot)} /><Detail label="Network fee" value={`${formatSol(receipt.networkFeeLamports)} SOL`} /></div><div className="receipt-actions"><button className="primary-button" onClick={copyLink}>{copied ? <><Check size={18} /> Link copied</> : <><Copy size={18} /> Copy proof link</>}</button><button className="secondary-button" onClick={() => downloadRecordSvg({ statement: receipt.statement, kind: receipt.kind, theme: receipt.theme }, receipt.mint)}><Download size={18} /> Save card</button></div><button className="text-button" onClick={() => reset()}>Make another record <ArrowRight size={16} /></button><p className="receipt-note">{recordSource === 'created' ? 'Confirmed on-chain.' : 'Fetched from Solana devnet.'} The timestamp shows publication, not whether a prediction came true. Devnet data may be reset.</p></div>
      : stage === 'review' && prepared ? <div className="composer-state review-panel"><button className="back-button" onClick={() => { setStage('draft'); setPrepared(null); setAcknowledged(false); }}><ChevronLeft size={17} /> Edit statement</button><h2>Review the seal.</h2><p className="panel-intro">Your wallet will sign one transaction containing the exact statement below.</p><div className="review-statement"><span>{draft.kind.toUpperCase()}</span><p>“{prepared.draft.statement}”</p></div><div className="review-details"><Detail label="Network" value={NETWORK} /><Detail label="Wallet / creator" value={prepared.owner} /><Detail label="Unique token mint" value={prepared.mint} /><Detail label="You receive" value="1 token in this wallet" /><Detail label="Token supply" value="1 token · 0 decimals" /><Detail label="Mint authority" value="Revoked after minting" /><Detail label="Freeze authority" value="None" /><Detail label="Network fee" value={`${formatSol(prepared.feeLamports)} SOL`} /><Detail label="Account rent" value={`${formatSol(prepared.rentLamports)} SOL`} /><Detail label="App fee" value="0 SOL" /><Detail label="Total estimated" value={`${formatSol(prepared.totalLamports)} SOL`} /><Detail label="Wallet balance" value={`${formatSol(prepared.balanceLamports)} SOL`} /></div><p className="review-warning">The statement, category and color enter a public transaction memo and cannot be removed from an active network. The token can later be transferred or burned; this receipt proves creation, not current ownership. Devnet data may be reset and tokens have no monetary value. A network fee may be charged even if the transaction fails. This token has no NFT metadata; wallet display varies. No SOL or tokens go to BEFORE.</p><label className="ack-line"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I understand this text becomes public.</span></label><button className="primary-button full-width" disabled={!acknowledged || !wallet.signTransaction} onClick={seal}>Sign & seal record <ArrowRight size={18} /></button><p className="fine-print">Your wallet will ask you to approve the transaction.</p></div>
      : <div className="composer-state"><div className="form-topline"><span>CREATE YOUR RECORD</span><span className="form-line" /></div><div className="kind-switch" role="group" aria-label="Statement type"><button disabled={busy || Boolean(pendingSig)} aria-pressed={draft.kind === 'prediction'} className={draft.kind === 'prediction' ? 'active' : ''} onClick={() => updateDraft({ kind: 'prediction' })}>Prediction</button><button disabled={busy || Boolean(pendingSig)} aria-pressed={draft.kind === 'commitment'} className={draft.kind === 'commitment' ? 'active' : ''} onClick={() => updateDraft({ kind: 'commitment' })}>Commitment</button></div><label className="field-label" htmlFor="statement">Your {draft.kind}</label><textarea id="statement" value={draft.statement} onChange={event => updateStatement(event.target.value)} placeholder={examples[draft.kind]} rows={3} disabled={busy || Boolean(pendingSig)} spellCheck={true} /><div className="textarea-footer"><span>Make it specific. Make it yours.</span><span className={utf8Bytes > BYTE_LIMIT - 20 ? 'near-limit' : ''}>{utf8Bytes} / {BYTE_LIMIT} bytes</span></div><div className="theme-picker"><span>COLOR</span><div role="group" aria-label="Card color"><button disabled={busy || Boolean(pendingSig)} aria-label="Blue card" aria-pressed={draft.theme === 'blue'} className={`swatch swatch-blue ${draft.theme === 'blue' ? 'selected' : ''}`} onClick={() => updateDraft({ theme: 'blue' })} /><button disabled={busy || Boolean(pendingSig)} aria-label="Green card" aria-pressed={draft.theme === 'green'} className={`swatch swatch-green ${draft.theme === 'green' ? 'selected' : ''}`} onClick={() => updateDraft({ theme: 'green' })} /><button disabled={busy || Boolean(pendingSig)} aria-label="Pink card" aria-pressed={draft.theme === 'pink'} className={`swatch swatch-pink ${draft.theme === 'pink' ? 'selected' : ''}`} onClick={() => updateDraft({ theme: 'pink' })} /></div></div><button className="primary-button full-width" onClick={review} disabled={busy || Boolean(pendingSig) || Boolean(formError) || !wallet.publicKey}>{stage === 'preparing' ? <><span className="spinner" /> Checking network quote…</> : <>Review & seal <ArrowRight size={19} /></>}</button>{!wallet.publicKey && <p className="button-hint">Connect your wallet above to continue. Need devnet SOL? <a target="_blank" rel="noreferrer" href="https://faucet.solana.com/">Use the Solana faucet <ExternalLink size={12} /></a></p>}{stage === 'error' && pendingSig ? <div className="pending-box" role="alert"><p>{error}</p><div><button onClick={checkPending} disabled={loadingRecord}>Check confirmation <RotateCcw size={15} /></button><a href={explorerUrl(pendingSig)} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={15} /></a></div><button className="abandon-link" onClick={abandonPending}>Start over anyway</button></div> : stage === 'error' && <div className="form-error" role="alert"><p>{error}</p><button className="retry-link" onClick={review}>Try again <RotateCcw size={15} /></button><button className="retry-link" onClick={() => reset()}>New record <ArrowRight size={15} /></button></div>}{loadingRecord && <p className="button-hint">Fetching on-chain record…</p>}{busy && !loadingRecord && stage !== 'preparing' && <p className="button-hint">{stage === 'signing' ? 'Waiting for your wallet signature…' : 'Confirming on Solana devnet…'}</p>}</div>}
      <div className="hero-foot"><div className="foot-stamp"><span className="stamp-dot" /> PUBLIC BY DESIGN</div><p>One wallet signature. One unique token. A moment you can point back to.</p></div></section>
      <section className="preview-zone" aria-label="Live record card"><div className="preview-heading"><div><span className="preview-dash" /> THE OBJECT</div><span>01 / 01</span></div><div className="preview-wrap"><PreviewCard draft={draft} receipt={receipt} stage={stage} /><div className="preview-caption"><span>{receipt ? 'SEALED ON SOLANA DEVNET' : 'A GLIMPSE OF WHAT YOU’LL SEAL'}</span><span className="caption-arrow">↗</span></div></div><div className="preview-bottom"><button onClick={() => setSoundOn(current => !current)} aria-label={soundOn ? 'Turn confirmation sound off' : 'Turn confirmation sound on'} title="Sound plays only after confirmed record">{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />} <span>SOUND {soundOn ? 'ON' : 'OFF'}</span></button><span>MADE TO BE REMEMBERED.</span></div></section></main>

    <footer className="site-footer"><span>BEFORE © {new Date().getFullYear()}</span><span>WORDS BECOME RECORDS.</span><span>BUILT ON SOLANA DEVNET <span className="footer-star">✳</span></span></footer>
    <div className="sr-only" role="status" aria-live="polite">{loadingRecord ? 'Loading on-chain record.' : error || (stage === 'confirmed' ? 'Record confirmed on Solana devnet.' : stage === 'preparing' ? 'Preparing network quote.' : stage === 'signing' ? 'Waiting for wallet signature.' : stage === 'confirming' ? 'Checking confirmation.' : '')}</div>
    {error && stage !== 'error' && <div className="toast-error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={17} /></button></div>}
    {howOpen && <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) setHowOpen(false); }}><section className="drawer" role="dialog" aria-modal="true" aria-labelledby="how-title"><button className="drawer-close" onClick={() => setHowOpen(false)} aria-label="Close"><X size={24} /></button><span className="drawer-label">THE IDEA</span><h2 id="how-title">A receipt for<br />your conviction.</h2><div className="how-steps"><div><span>01</span><h3>Write it.</h3><p>Make a prediction or commitment in your own words, up to 180 UTF-8 bytes.</p></div><div><span>02</span><h3>Sign it.</h3><p>Review the exact text and live network cost. Your wallet signs a public Solana devnet transaction.</p></div><div><span>03</span><h3>Keep the proof.</h3><p>One token is minted to your wallet and its supply is fixed. The transaction stores your statement and can be inspected by anyone.</p></div></div><p className="drawer-caveat">A record proves when a statement was published. It does not prove the statement is true. Devnet tokens have no monetary value and devnet data may be reset.</p><button className="drawer-action" onClick={() => setHowOpen(false)}>Start writing <ArrowRight size={18} /></button></section></div>}
    {historyOpen && <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><section className="drawer" role="dialog" aria-modal="true" aria-labelledby="history-title"><button className="drawer-close" onClick={() => setHistoryOpen(false)} aria-label="Close"><X size={24} /></button><span className="drawer-label">THIS DEVICE</span><h2 id="history-title">My records<span className="heading-period">.</span></h2><p className="drawer-intro">Saved transaction links on this browser. Each record is fetched from Solana devnet when opened.</p>{history.length ? <ul className="history-list">{history.map((sig, index) => <li key={sig}><button onClick={() => void openRecord(sig, 'history')}><span className="history-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{short(sig, 11, 9)}</strong><small>OPEN ON-CHAIN RECORD</small></span><ArrowUpRight size={18} /></button></li>)}</ul> : <div className="history-empty"><div className="empty-symbol"><CircleDot size={56} strokeWidth={1} /></div><h3>Nothing sealed here yet.</h3><p>Create your first record and its link will appear on this device.</p></div>}<button className="drawer-action" onClick={() => setHistoryOpen(false)}>Back to the studio <ArrowRight size={18} /></button></section></div>}
  </div>;
}
export default App;
