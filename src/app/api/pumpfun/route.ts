import {
  ActionPostResponse,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
  createActionHeaders,
} from '@solana/actions';
import {
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { getEmptyTransaction, getInstructions, getProvider } from './utils';
const headers = createActionHeaders();
export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const baseHref = new URL(
      `/api/pumpfun`,
      requestUrl.origin,
    ).toString();

    const payload: ActionGetResponse = {
      type: 'action',
      title: 'PumpFun Token Generator',
      icon: 'https://i.imgur.com/6ZzNFRi.png',
      description: 'Create a PumpFun token with blinks!',
      label: 'Pump Fun',
      links: {
        actions: [
          {
            label: 'Create PumpFun Token',
            href: `${baseHref}?name={name}&ticker={ticker}&description={description}&iconUrl={iconUrl}&buyAmount={buyAmount}`,
            parameters: [
              {
                name: 'name',
                label: 'Name of the token',
                required: true,
              },
              {
                name: 'ticker',
                label: 'Ticker of the token',
                required: true,
              },
              {
                name: 'description',
                label: 'Description of the token',
                required: true,
              },
              {
                name: 'iconUrl',
                label: 'URL of the token icon',
                pattern: 'https?://.*',
                required: true,
              },
              {
                name: 'buyAmount',
                label: 'Initial buy amount (Optional)',
                required: false,
              },
            ],
          },
        ],
      },
    };

    return Response.json(payload, {
      headers,
    });
  } catch (err) {
    console.log(err);
    let message = 'An unknown error occurred';
    if (typeof err == 'string') message = err;
    return new Response(message, {
      status: 400,
      headers,
    });
  }
};
export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const body: ActionPostRequest = await req.json();
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers,
      });
    }
    const name = requestUrl.searchParams.get('name');
    const ticker = requestUrl.searchParams.get('ticker');
    const description = requestUrl.searchParams.get('description');
    const iconUrl = requestUrl.searchParams.get('iconUrl');
    const buyAmount = isNaN(Number(requestUrl.searchParams.get('buyAmount'))) ? 0 : Number(requestUrl.searchParams.get('buyAmount'));
    if (!name || !ticker || !description || !iconUrl) {
      return new Response('Missing required query parameters', {
        status: 400,
        headers,
      });
    }
    let transaction = new Transaction();
    try {
      const {mint,transaction:tx} = await getInstructions(account, name, ticker, description, iconUrl, buyAmount);
      const payload: ActionPostResponse = await createPostResponse({
        fields: {
          transaction: tx,
          message: `https://pump.fun/${mint}`
        },
      });
      return Response.json(payload, {
        headers,
      });
    } catch (err) {
      transaction.add(await getEmptyTransaction(account));
      transaction.recentBlockhash = (
        await getProvider().connection.getLatestBlockhash()
      ).blockhash;
      transaction.feePayer = account;
      const payload: ActionPostResponse = await createPostResponse({
        fields: {
          transaction,
          message: `Cannot create token. Make sure your parameters are valid.`,
        },
      });
      return Response.json(payload, {
        headers,
      });
    }
  } catch (err) {
    console.log(err);
    let message = 'An unknown error occurred';
    if (typeof err == 'string') message = err;
    return new Response(message, {
      status: 400,
      headers,
    });
  }
};
