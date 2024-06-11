import { Module } from '@nestjs/common';
import { HistoricQuoteService } from './historic-quote.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricQuote } from './historic-quote.entity';
import { HistoricQuoteController } from './historic-quote.controller';
import { CoinGeckoModule } from 'src/coingecko/coingecko.module';

@Module({
  imports: [TypeOrmModule.forFeature([HistoricQuote]), CoinGeckoModule],
  providers: [HistoricQuoteService],
  exports: [HistoricQuoteService],
  controllers: [HistoricQuoteController],
})
export class HistoricQuoteModule {}
