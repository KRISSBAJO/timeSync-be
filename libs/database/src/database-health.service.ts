import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const startedAt = performance.now();

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);

      return {
        status: 'up',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }
}

