import { ConfigService } from '@nestjs/config';

export const DuneProvider = {
  provide: 'DUNE_API_KEY',
  useFactory: async (configService: ConfigService): Promise<any> => {
    return configService.get('DUNE_API_KEY');
  },
  inject: [ConfigService],
};
