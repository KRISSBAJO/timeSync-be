import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoRequestStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '@timesync/database';

import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { ListDemoRequestsQueryDto } from './dto/list-demo-requests-query.dto';

@Injectable()
export class DemoRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDemoRequest(dto: CreateDemoRequestDto, request: Request) {
    const payload = this.normalizeCreatePayload(dto, request);

    return this.prisma.$transaction(async (tx) => {
      const demoRequest = await tx.demoRequest.create({ data: payload });

      await tx.outboxMessage.create({
        data: {
          eventType: 'demo.request.created',
          aggregateType: 'DemoRequest',
          aggregateId: demoRequest.id,
          payload: {
            id: demoRequest.id,
            workEmail: demoRequest.workEmail,
            companyName: demoRequest.companyName,
            source: demoRequest.source,
          },
          headers: {
            source: 'public-landing-page',
          },
        },
      });

      return demoRequest;
    });
  }

  async listDemoRequests(query: ListDemoRequestsQueryDto) {
    const limit = query.limit ?? 50;
    const where: Prisma.DemoRequestWhereInput = {
      status: query.status,
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { workEmail: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.demoRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.demoRequest.count({ where }),
    ]);

    return {
      data,
      page: {
        limit,
        total,
      },
    };
  }

  async getDemoRequest(id: string) {
    const demoRequest = await this.prisma.demoRequest.findUnique({ where: { id } });

    if (!demoRequest) {
      throw new NotFoundException('Demo request not found.');
    }

    return demoRequest;
  }

  async updateDemoRequestStatus(id: string, status: DemoRequestStatus) {
    await this.getDemoRequest(id);

    const now = new Date();
    return this.prisma.demoRequest.update({
      where: { id },
      data: {
        status,
        contactedAt: status === DemoRequestStatus.CONTACTED ? now : undefined,
        convertedAt: status === DemoRequestStatus.CONVERTED ? now : undefined,
      },
    });
  }

  private normalizeCreatePayload(
    dto: CreateDemoRequestDto,
    request: Request,
  ): Prisma.DemoRequestCreateInput {
    const metadata = {
      ...(dto.metadata ?? {}),
      website: dto.website?.trim(),
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
      referrer: request.header('referer') ?? request.header('referrer'),
    };

    return {
      fullName: dto.fullName.trim(),
      workEmail: dto.workEmail.trim().toLowerCase(),
      companyName: dto.companyName.trim(),
      jobTitle: this.optionalTrim(dto.jobTitle),
      phone: this.optionalTrim(dto.phone),
      companySize: this.optionalTrim(dto.companySize),
      industry: this.optionalTrim(dto.industry),
      country: this.optionalTrim(dto.country),
      message: this.optionalTrim(dto.message),
      source: this.optionalTrim(dto.source) ?? 'landing-page',
      metadata,
    };
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
