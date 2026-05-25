import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('database.url');
    const maxWait = config.get<number>('database.transactionMaxWaitMs') ?? 15000;
    const timeout = config.get<number>('database.transactionTimeoutMs') ?? 60000;
    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
      transactionOptions: {
        maxWait,
        timeout,
      },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
