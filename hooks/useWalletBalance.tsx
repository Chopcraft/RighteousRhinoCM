import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createContext, useContext, useEffect, useState } from "react";
import * as anchor from "@project-serum/anchor";

const BalanceContext = createContext(null);

const rpcHost = "https://still-solitary-paper.solana-mainnet.quiknode.pro/3556f36b7113ada207f0bc78ef72f446f1f3ecdf/";

console.log(rpcHost);
const connection = new anchor.web3.Connection(rpcHost);

export default function useWalletBalance() {
  const [balance, setBalance]: any = useContext(BalanceContext);
  return [balance, setBalance];
}

export const WalletBalanceProvider: React.FC<{}> = ({ children }) => {
  const wallet = useWallet();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        const balance = await connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, connection]);

  return (
    <BalanceContext.Provider value={[balance, setBalance] as any}>
      {children}
    </BalanceContext.Provider>
  );
};
