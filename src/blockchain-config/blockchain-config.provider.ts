import { ConfigService } from '@nestjs/config';

export const BlockchainConfigProvider = {
  provide: 'BLOCKCHAIN_CONFIG',
  useFactory: async (configService: ConfigService): Promise<any> => {
    return {
      ethereumEndpoint: configService.get('CARBON_ETHEREUM_ENDPOINT'),
    };
  },
  inject: [ConfigService],
};
