// coinmarketcap.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { indexBy } from '../utilities';
import moment from 'moment';
import { CoinGeckoClient, CoinMarketChartResponse } from 'coingecko-api-v3';
import { get } from 'axios';

export interface PriceObject {
  timestamp: number;
  price: number;
  address: string;
}

type CoinGeckoCoin = {
  id: string;
  token_address: string;
};

const ETH_ID = 'ethereum';
@Injectable()
export class CoinGeckoService {
  private client: CoinGeckoClient;
  private readonly ethereumTokenAddress: string;
  constructor(private readonly configService: ConfigService) {
    this.ethereumTokenAddress = this.configService.get<string>('ETH');
    this.client = new CoinGeckoClient(
      {
        timeout: 10000,
        autoRetry: true,
      },
      this.configService.get<string>('COINGECKO_API_KEY'),
    );
  }

  private async getV1CryptocurrencyListingsLatest() {
    const tokenMap = await this.getAllTokens();
    return (
      await this.client.coinMarket({
        ids: tokenMap.map((t) => t.id).join(','),
        vs_currency: 'usd',
        order: 'market_cap_desc',
      })
    ).filter(d => {
      if (!d.last_updated) {
        console.log(`Last updated not found for ${d.id}`);
        return false;
      }

      if (!d.current_price) {
        console.log(`Current price not found for ${d.id}`);
        return false;
      }
      return true;
    }
    ).map((d) => ({
      id: d.id,
      tokenAddress: tokenMap.find((t) => t.id === d.id)?.token_address,
      usd: d.current_price!,
      timestamp: moment(d.last_updated!).utc().toISOString(),
      provider: 'coingecko',
    })).filter(l => {
      if (!l.tokenAddress) {
        console.log(`Token address not found for ${l.id}`);
        return false;
      }
      return true;
    }).map(l => {
      delete l.id;
      return l;
    });
  }

  async getAllTokens(): Promise<CoinGeckoCoin[]> {
    let linea_shortlist = (await get<{
      tokens: Array<{
        address: string;
        symbol: string;
        name: string;
        extension?: {
          rootChainId: number;
          rootAddress: string;
        }
      }>
    }
    >('https://raw.githubusercontent.com/Consensys/linea-token-list/main/json/linea-mainnet-token-shortlist.json').then((r) => r.data.tokens)).filter((t) => t.extension?.rootChainId === 1);

    return (
      await this.client.coinList({
        include_platform: true,
      })
    ).map((d) => {
      if( d.platforms['linea'] !== undefined){
        return d;
      }

      if (!d.platforms['ethereum']) {
        return d;
      }

      // check if rootAddress matches any of the tokens in the linea shortlist
      const tokenAddress = linea_shortlist.find((t) => t.extension.rootAddress.toLowerCase() === d.platforms['ethereum'].toLowerCase())?.address;
      if (tokenAddress) {
        d.platforms['linea'] = tokenAddress.toLowerCase();
      }
      return d;

    })
      .filter((d) => d.platforms['linea'] !== undefined)
      .map((d) => ({
        id: d.id,
        token_address: d.platforms['linea'],
      })).concat([{
        id: ETH_ID,
        token_address: this.ethereumTokenAddress.toLowerCase()
      }]);
  }

  private async getV2CryptocurrencyQuotesLatest(ids: string[]) {
    const tokenAddressById = indexBy(await this.getAllTokens(), 'id');
    return Object.entries(
      (await this.client.simplePrice({
        ids: ids.join(','),
        vs_currencies: 'usd',
        include_last_updated_at: true,
      })) as unknown as { [token_id: string]: { usd: string; last_updated_at: number } },
    ).map(([token_id, { usd, last_updated_at }]) => ({
      tokenAddress: tokenAddressById[token_id],
      usd: usd,
      timestamp: moment.unix(last_updated_at).utc().toISOString(),
      provider: 'coingecko',
    }));
  }

  async getHistoricalQuotes(tokens: CoinGeckoCoin[], start: number, end: number) {
    const intervalInSeconds = moment.duration(89, 'days').asSeconds();

    const result: { [key: string]: PriceObject[] } = {};
    const requests: Promise<readonly [string, CoinMarketChartResponse]>[] = [];

    for (const token of tokens) {
      try {
        let current_time = end;
        while (current_time > start) {
          const tokenChartData = this.client
            .coinIdMarketChartRange({
              id: token.id,
              vs_currency: 'usd',
              from: Math.max(start, current_time - intervalInSeconds),
              to: current_time,
            })
            .then((r) => [token.token_address, r] as const);
          requests.push(tokenChartData);
          current_time -= intervalInSeconds;
        }
      } catch (error) { }
    }

    const responses = await Promise.all(requests);

    responses.forEach(([token_address, token_prices]) => {
      const prices = token_prices.prices.map(([timestampInMs, price]) => {
        return { price, timestamp: timestampInMs / 1000, address: token_address };
      });

      result[token_address] = (result[token_address] || []).concat(prices);
    });

    return result;
  }

  async getLatestQuotes(): Promise<any> {
    const latestQuotes = await this.getV1CryptocurrencyListingsLatest();
    const eth = await this.getV2CryptocurrencyQuotesLatest([ETH_ID]);
    return [...latestQuotes, ...eth];
  }
}
