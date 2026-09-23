import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { RPC_URL } from './chain';
export function Wallets({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter({ network: WalletAdapterNetwork.Devnet })], []);
  return <ConnectionProvider endpoint={RPC_URL}><WalletProvider wallets={wallets} autoConnect={false}><WalletModalProvider>{children}</WalletModalProvider></WalletProvider></ConnectionProvider>;
}
