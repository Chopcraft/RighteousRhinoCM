import { useEffect, useState } from "react";
import * as anchor from "@project-serum/anchor";
import {
    awaitTransactionSignatureConfirmation,
    CandyMachine,
    getCandyMachineState,
    mintMultipleToken,
    mintOneToken,
} from "../utils/candyMachine";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import useWalletBalance from "./useWalletBalance";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { sleep } from "../utils";



const treasury = new anchor.web3.PublicKey(
    "3CvojwmDB5BgrU2uKCzyn5we4g7zuHNcWwjyawy4g549"
);

const config = new anchor.web3.PublicKey(
    "3MKAv72pP6Y5G6BsKiuNbMHqCrRAVPK9H9NaPhNyhQZg"
);

const candyMachineAddress = new anchor.web3.PublicKey(
    "BeDaPLdxG2en2jy8qRF1p7Jene7PSDHZiLi61z9efukj"
);

const rpcHost = "https://still-solitary-paper.solana-mainnet.quiknode.pro/3556f36b7113ada207f0bc78ef72f446f1f3ecdf/";
const connection = new anchor.web3.Connection(rpcHost);

const txTimeout = 30000;

export default function useCandyMachine() {
    const [setBalance] = useWalletBalance();
    const [candyMachine, setCandyMachine] = useState<CandyMachine>();
    const wallet = useWallet();
    const [nftsData, setNftsData] = useState<any>(
        ({} = {
            itemsRemaining: 0,
            itemsRedeemed: 0,
            itemsAvailable: 0,
        } as any)
    );
    const [isMinting, setIsMinting] = useState(false);
    const [isSoldOut, setIsSoldOut] = useState(false);
    const [mintStartDate, setMintStartDate] = useState(
        new Date(parseInt('1639325100', 10))
    );

    useEffect(() => {
        (async () => {
            if (
                !wallet ||
                !wallet.publicKey ||
                !wallet.signAllTransactions ||
                !wallet.signTransaction
            ) {
                return;
            }

            const anchorWallet = {
                publicKey: wallet.publicKey,
                signAllTransactions: wallet.signAllTransactions,
                signTransaction: wallet.signTransaction,
            } as anchor.Wallet;

            const { candyMachine, goLiveDate, itemsRemaining } =
                await getCandyMachineState(
                    anchorWallet,
                    candyMachineAddress,
                    connection
                );

            setIsSoldOut(itemsRemaining === 0);
            setMintStartDate(goLiveDate);
            setCandyMachine(candyMachine);
        })();
    }, [wallet, candyMachineAddress, connection]);

    useEffect(() => {
        (async () => {
            if (!isMinting) {
                const anchorWallet = {
                    publicKey: wallet.publicKey,
                    signAllTransactions: wallet.signAllTransactions,
                    signTransaction: wallet.signTransaction,
                } as anchor.Wallet;

                const { itemsRemaining, itemsRedeemed, itemsAvailable } =
                    await getCandyMachineState(
                        anchorWallet,
                        candyMachineAddress,
                        connection
                    );

                setNftsData({ itemsRemaining, itemsRedeemed, itemsAvailable });
            }
        })();
    }, [wallet, candyMachineAddress, connection, isMinting]);

    const startMint = async () => {
        try {
            setIsMinting(true);
            if (wallet.connected && candyMachine?.program && wallet.publicKey) {
                const mintTxId = await mintOneToken(
                    candyMachine,
                    config,
                    wallet.publicKey,
                    treasury
                );

                const status = await awaitTransactionSignatureConfirmation(
                    mintTxId,
                    txTimeout,
                    connection,
                    "singleGossip",
                    false
                );

                if (!status?.err) {
                    toast.success(
                        "Congratulations! Mint succeeded! Check your wallet :)"
                    );
                } else {
                    toast.error("Mint failed! Please try again!");
                }
            }
        } catch (error: any) {
            let message = error.message || "Minting failed! Please try again!";
            if (!error.message) {
                if (error.message.indexOf("0x138")) {
                } else if (error.message.indexOf("0x137")) {
                    message = `SOLD OUT!`;
                } else if (error.message.indexOf("0x135")) {
                    message = `Insufficient funds to mint. Please fund your wallet.`;
                }
            } else {
                if (error.code === 311) {
                    message = `SOLD OUT!`;
                    setIsSoldOut(true);
                } else if (error.code === 312) {
                    message = `Minting period hasn't started yet.`;
                }
            }
            toast.error(message);
        } finally {
            if (wallet?.publicKey) {
                const balance = await connection.getBalance(wallet?.publicKey);
                setBalance(balance / LAMPORTS_PER_SOL);
            }
            setIsMinting(false);
        }
    };

    const startMintMultiple = async (quantity: number) => {
        try {
            setIsMinting(true);
            if (wallet.connected && candyMachine?.program && wallet.publicKey) {
                const oldBalance =
                    (await connection.getBalance(wallet?.publicKey)) /
                    LAMPORTS_PER_SOL;
                const futureBalance = oldBalance - 0.49 * quantity;

                const signedTransactions: any = await mintMultipleToken(
                    candyMachine,
                    config,
                    wallet.publicKey,
                    treasury,
                    quantity
                );

                const promiseArray = [];

                for (
                    let index = 0;
                    index < signedTransactions.length;
                    index++
                ) {
                    const tx = signedTransactions[index];
                    promiseArray.push(
                        awaitTransactionSignatureConfirmation(
                            tx,
                            txTimeout,
                            connection,
                            "singleGossip",
                            true
                        )
                    );
                }

                const allTransactionsResult = await Promise.all(promiseArray);
                let totalSuccess = 0;
                let totalFailure = 0;

                for (
                    let index = 0;
                    index < allTransactionsResult.length;
                    index++
                ) {
                    const transactionStatus = allTransactionsResult[index];
                    if (!transactionStatus?.err) {
                        totalSuccess += 1;
                    } else {
                        totalFailure += 1;
                    }
                }

                let newBalance =
                    (await connection.getBalance(wallet?.publicKey)) /
                    LAMPORTS_PER_SOL;

                while (newBalance > futureBalance) {
                    await sleep(1000);
                    newBalance =
                        (await connection.getBalance(wallet?.publicKey)) /
                        LAMPORTS_PER_SOL;
                }

                if (totalSuccess) {
                    toast.success(
                        `Congratulations! ${totalSuccess} mints succeeded! Your NFT's should appear in your wallet soon :)`,
                        { duration: 6000, position: "bottom-center" }
                    );
                }

                if (totalFailure) {
                    toast.error(
                        `Some mints failed! ${totalFailure} mints failed! Check your wallet :(`,
                        { duration: 6000, position: "bottom-center" }
                    );
                }
            }
        } catch (error: any) {
            let message = error.message || "Minting failed! Please try again!";
            if (!error.message) {
                if (error.message.indexOf("0x138")) {
                } else if (error.message.indexOf("0x137")) {
                    message = `SOLD OUT!`;
                } else if (error.message.indexOf("0x135")) {
                    message = `Insufficient funds to mint. Please fund your wallet.`;
                }
            } else {
                if (error.code === 311) {
                    message = `SOLD OUT!`;
                    setIsSoldOut(true);
                } else if (error.code === 312) {
                    message = `Minting period hasn't started yet.`;
                }
            }
            toast.error(message);
        } finally {
            if (wallet?.publicKey) {
                const balance = await connection.getBalance(wallet?.publicKey);
                setBalance(balance / LAMPORTS_PER_SOL);
            }
            setIsMinting(false);
        }
    };

    return {
        isSoldOut,
        mintStartDate,
        isMinting,
        nftsData,
        startMint,
        startMintMultiple,
    };
}
