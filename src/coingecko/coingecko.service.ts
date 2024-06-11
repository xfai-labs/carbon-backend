// coinmarketcap.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { indexBy } from '../utilities';
import moment from 'moment';
import { CoinGeckoClient, CoinMarketChartResponse } from 'coingecko-api-v3';

export interface PriceObject {
  timestamp: number;
  price: number;
  address: string;
}
const INTERVAL_IN_MINUTES = 60;

type CoinGeckoCoin = {
  id: string;
  token_address: string;
};

@Injectable()
export class CoinGeckoService {
  private client: CoinGeckoClient;
  constructor(private readonly configService: ConfigService) {
    this.client = new CoinGeckoClient(
      {
        timeout: 10000,
        autoRetry: true,
      },
      this.configService.get<string>('COINGECKO_API_KEY'),
    );
  }

  private async getV1CryptocurrencyListingsLatest() {
    type DEFI = 'decentralized_finance_defi';
    const tokenMap = await this.getAllTokens();
    return (
      await this.client.coinMarket({
        category: 'linea-ecosystem' as DEFI,
        vs_currency: 'usd',
        order: 'market_cap_desc',
      })
    ).map((d) => ({
      tokenAddress: tokenMap.find((t) => t.id === d.id)?.token_address,
      usd: d.current_price,
      timestamp: d.last_updated,
      provider: 'coingecko',
    }));
  }

  async getAllTokens(): Promise<CoinGeckoCoin[]> {
    return (
      await this.client.coinList({
        include_platform: true,
      })
    )
      .filter((d) => d.platforms['linea'] !== undefined)
      .map((d) => ({
        id: d.id,
        token_address: d.platforms['linea'],
      }));
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
    const intervalInSeconds = moment.duration(89,'days').asSeconds();
    
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
              from: Math.max(start,current_time - intervalInSeconds),
              to: current_time,
            })
            .then((r) => [token.token_address, r] as const);
          requests.push(tokenChartData);
          current_time -= intervalInSeconds;
        }
      } catch (error) {}
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
    const eth = await this.getV2CryptocurrencyQuotesLatest(['ethereum']);
    return [...latestQuotes, ...eth];
  }
}
