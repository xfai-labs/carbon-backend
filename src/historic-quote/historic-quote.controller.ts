import { CacheTTL } from '@nestjs/cache-manager';
import { BadRequestException, Controller, Get, Header, Headers, Query, UseGuards } from '@nestjs/common';
import { HistoricQuoteDto } from './historic-quote.dto';
import moment from 'moment';
import { HistoricQuoteService } from './historic-quote.service';
import { ConfigService } from '@nestjs/config';

@Controller({ version: '1', path: 'history' })
export class HistoricQuoteController {
  constructor(private historicQuoteService: HistoricQuoteService, private configService: ConfigService) {}

  @Get('/prices')
  @CacheTTL(1 * 60 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  async prices(@Query() params: HistoricQuoteDto) {
    if (!isValidStart(params.start)) {
      throw new BadRequestException({
        message: ['start must be within the last 12 months'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (params.end <= params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    params.baseToken = params.baseToken.toLowerCase();
    params.quoteToken = params.quoteToken.toLowerCase();

    const data = await this.historicQuoteService.getUsdBuckets(
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const result = [];
    data.forEach((p) => {
      result.push({
        timestamp: p.timestamp,
        low: p.low.toString(),
        high: p.high.toString(),
        open: p.open.toString(),
        close: p.close.toString(),
      });
    });

    return result;
  }


  @Get('/seed')
  seedHistoricQuotes(@Headers() headers: Record<string,string>) {
    const authSecret = headers['auth-secret'];
    if (this.configService.get<string>('AUTH_SECRET') !== authSecret) {
      throw new BadRequestException({
        message: ['Invalid auth secret'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
    this.historicQuoteService.seed();
  }
}
const isValidStart = (start: number): boolean => {
  const twelveMonthsAgo = moment().subtract(12, 'months').startOf('day').unix();
  return start >= twelveMonthsAgo;
};
