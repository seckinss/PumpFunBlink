import { AnchorProvider } from "@coral-xyz/anchor";
import { clusterApiUrl, Commitment, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { CreateTokenMetadata, PumpFunSDK } from "pumpdotfun-sdk";
export async function getEmptyTransaction(account: PublicKey): Promise<Transaction> {
  const transferInstruction = new TransactionInstruction({
    keys: [
      { pubkey: account, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'),
    data: Buffer.from([2, 0, 0, 0, 232, 3, 0, 0, 0, 0, 0, 0]), //1000 lamport for abuse prevention
  });
  const transaction = new Transaction().add(transferInstruction);
  return transaction;
}
interface Wallet {
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]>;
  publicKey: PublicKey;
  /** Keypair of the configured payer (Node only) */
  payer?: Keypair;
}
const isVersionedTransaction = (
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction => {
  return "version" in tx;
};
class NodeWallet implements Wallet {
  constructor(readonly payer: Keypair) { }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> {
    if (isVersionedTransaction(tx)) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }

    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    return txs.map((t) => {
      if (isVersionedTransaction(t)) {
        t.sign([this.payer]);
      } else {
        t.partialSign(this.payer);
      }
      return t;
    });
  }

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}
function getMint(): Keypair {
  const keypair = Keypair.generate();
  return keypair;
}

const calculateWithSlippageBuy = (
  amount: bigint,
  basisPoints: bigint
) => {
  return amount + (amount * basisPoints) / BigInt(10000);
};

export const getProvider = () => {
  const connection = new Connection(clusterApiUrl('mainnet-beta'));
  const wallet = new NodeWallet(new Keypair());
  return new AnchorProvider(connection, wallet, { commitment: "finalized" });
};

const urlToBlob = async (url: string): Promise<Blob> => {
  try {
    const response = await fetch(url);
    return await response.blob();
  }
  catch (error) {
    throw new Error('Url is not valid.');
  }
};

export async function getInstructions(creator: PublicKey, name: string, symbol: string, description: string, iconUrl: string, buyAmountSol: number): Promise<{ mint: string, transaction: Transaction }> {
  const slippageBasisPoints: bigint = BigInt(500);
  const commitment: Commitment = 'finalized';
  const mint = getMint();
  const sdk = new PumpFunSDK(getProvider());
  const createTokenMetadata: CreateTokenMetadata = {
    name: name,
    symbol: symbol,
    description: description,
    file: await urlToBlob(iconUrl),
  };
  let tokenMetadata = await sdk.createTokenMetadata(createTokenMetadata);
  const createTx = await sdk.getCreateInstructions(
    creator,
    createTokenMetadata.name,
    createTokenMetadata.symbol,
    tokenMetadata.metadataUri,
    mint
  );
  let newTx = new Transaction().add(createTx);
  if (buyAmountSol > 0) {
    const globalAccount = await sdk.getGlobalAccount(commitment);
    const buyAmount = globalAccount.getInitialBuyPrice(BigInt(buyAmountSol * LAMPORTS_PER_SOL));
    const buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmount,
      slippageBasisPoints
    );
    const buyTx = await sdk.getBuyInstructions(
      creator,
      mint.publicKey,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage
    );
    newTx.add(buyTx);
  }
  newTx.feePayer = creator;
  newTx.recentBlockhash = (await getProvider().connection.getLatestBlockhash()).blockhash;
  newTx.partialSign(mint);
  return { mint: mint.publicKey.toBase58(), transaction: newTx };
}
