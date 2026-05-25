import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  TimelineEventType,
  type Notification,
  type NotificationRecipient,
  type NotificationTemplate,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateNotificationDto, CreateNotificationRecipientDto } from './dto/create-notification.dto';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import {
  ListNotificationsQueryDto,
  ListOutboundNotificationsQueryDto,
} from './dto/list-notifications-query.dto';
import { ListNotificationTemplatesQueryDto } from './dto/list-notification-templates-query.dto';
import { NotificationActionDto } from './dto/notification-action.dto';
import {
  ListNotificationPreferencesQueryDto,
  UpdateNotificationPreferencesDto,
} from './dto/update-notification-preferences.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { NotificationDeliveryService } from './delivery/notification-delivery.service';

type ResolvedRecipient = {
  userId: string | null;
  employeeId: string | null;
  destination: string | null;
  status: NotificationStatus;
  variables: Record<string, unknown>;
  preferenceDisabled: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async createTemplate(actor: AuthenticatedPrincipal, dto: CreateNotificationTemplateDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.notificationTemplate.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: dto.name.trim(),
          channel: dto.channel,
          subject: dto.subject,
          body: dto.body,
          variables: this.toJson(dto.variables),
          isActive: dto.isActive ?? true,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'NotificationTemplate', template.id, null, {
        code: template.code,
        channel: template.channel,
        name: template.name,
      });

      await this.enqueueOutbox(tx, tenantId, 'notification.template.created', 'NotificationTemplate', template.id, {
        notificationTemplateId: template.id,
        code: template.code,
        channel: template.channel,
      });

      return template;
    });
  }

  async listTemplates(actor: AuthenticatedPrincipal, query: ListNotificationTemplatesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const templates = await this.prisma.notificationTemplate.findMany({
      where: {
        AND: [
          {
            OR: query.includeGlobal === false ? [{ tenantId }] : [{ tenantId: null }, { tenantId }],
          },
          {
            channel: query.channel,
            isActive: query.activeOnly ? true : undefined,
          },
          query.search
            ? {
                OR: [
                  { code: { contains: query.search, mode: 'insensitive' } },
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { subject: { contains: query.search, mode: 'insensitive' } },
                  { body: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }, { channel: 'asc' }, { id: 'asc' }],
    });

    return this.paginate(templates, limit);
  }

  async getTemplate(actor: AuthenticatedPrincipal, templateId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findTemplateForReadOrThrow(this.prisma, tenantId, templateId);
  }

  async updateTemplate(
    actor: AuthenticatedPrincipal,
    templateId: string,
    dto: UpdateNotificationTemplateDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTenantTemplateOrThrow(tx, tenantId, templateId);
      const updated = await tx.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          name: dto.name?.trim(),
          channel: dto.channel,
          subject: dto.subject,
          body: dto.body,
          variables: this.toJson(dto.variables),
          isActive: dto.isActive,
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'NotificationTemplate',
        updated.id,
        this.templateState(existing),
        this.templateState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'notification.template.updated', 'NotificationTemplate', updated.id, {
        notificationTemplateId: updated.id,
        code: updated.code,
        channel: updated.channel,
      });

      return updated;
    });
  }

  async disableTemplate(actor: AuthenticatedPrincipal, templateId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTenantTemplateOrThrow(tx, tenantId, templateId);
      const updated = await tx.notificationTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DISABLE,
        'NotificationTemplate',
        updated.id,
        this.templateState(existing),
        this.templateState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'notification.template.disabled', 'NotificationTemplate', updated.id, {
        notificationTemplateId: updated.id,
        code: updated.code,
      });

      return updated;
    });
  }

  async createNotification(actor: AuthenticatedPrincipal, dto: CreateNotificationDto) {
    const tenantId = this.requireTenant(actor);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const module = dto.module?.trim() || 'system';

    const created = await this.prisma.$transaction(async (tx) => {
      const template = dto.templateCode
        ? await this.findTemplateByCodeOrThrow(tx, tenantId, dto.templateCode, dto.channel)
        : null;
      const baseVariables = this.baseVariables(actor, dto.data, module);
      const resolvedRecipients = await Promise.all(
        dto.recipients.map((recipient) =>
          this.resolveRecipient(tx, tenantId, dto.channel, module, recipient),
        ),
      );

      const firstRecipientVariables = resolvedRecipients[0]?.variables ?? {};
      const title =
        dto.title?.trim() ??
        this.renderTemplate(template?.subject ?? dto.subject ?? 'Notification', {
          ...baseVariables,
          ...firstRecipientVariables,
        });
      const body =
        dto.body?.trim() ??
        (template
          ? this.renderTemplate(template.body, { ...baseVariables, ...firstRecipientVariables })
          : undefined);

      if (!body) {
        throw new BadRequestException('A notification body or templateCode is required.');
      }

      const notification = await tx.notification.create({
        data: {
          tenantId,
          channel: dto.channel,
          title,
          body,
          status: this.initialNotificationStatus(resolvedRecipients, scheduledAt),
          templateCode: template?.code ?? dto.templateCode?.trim().toUpperCase(),
          scheduledAt,
          data: this.toJson({
            ...dto.data,
            module,
            subject: dto.subject,
            templateId: template?.id,
            recipientCount: resolvedRecipients.length,
          }),
          recipients: {
            create: resolvedRecipients.map((recipient) => ({
              userId: recipient.userId,
              employeeId: recipient.employeeId,
              destination: recipient.destination,
              status: recipient.status,
              failureReason: recipient.preferenceDisabled
                ? `Notification preference disabled for ${dto.channel}:${module}.`
                : undefined,
            })),
          },
        },
        include: this.notificationInclude,
      });

      await Promise.all(
        notification.recipients.map((recipient) =>
          this.createRecipientTimeline(tx, actor, tenantId, notification, recipient),
        ),
      );

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Notification', notification.id, null, {
        notificationId: notification.id,
        channel: notification.channel,
        recipientCount: notification.recipients.length,
      });

      await this.enqueueOutbox(tx, tenantId, 'notification.created', 'Notification', notification.id, {
        notificationId: notification.id,
        channel: notification.channel,
        scheduledAt: notification.scheduledAt?.toISOString() ?? null,
      });

      await this.enqueueOutbox(tx, tenantId, 'notification.delivery.requested', 'Notification', notification.id, {
        notificationId: notification.id,
        channel: notification.channel,
        deliverAfter: notification.scheduledAt?.toISOString() ?? new Date().toISOString(),
      });

      return notification;
    });

    if (dto.deliverNow && (!created.scheduledAt || created.scheduledAt <= new Date())) {
      return this.deliverNotification(actor, created.id);
    }

    return created;
  }

  async listInbox(actor: AuthenticatedPrincipal, query: ListNotificationsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const recipients = await this.prisma.notificationRecipient.findMany({
      where: {
        userId: actor.id,
        status: query.status,
        readAt: query.unreadOnly ? null : undefined,
        notification: {
          tenantId,
          channel: query.channel,
          OR: query.search
            ? [
                { title: { contains: query.search, mode: 'insensitive' } },
                { body: { contains: query.search, mode: 'insensitive' } },
                { templateCode: { contains: query.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.recipientInclude,
    });

    return this.paginate(recipients, limit);
  }

  async listOutbound(actor: AuthenticatedPrincipal, query: ListOutboundNotificationsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const notifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        channel: query.channel,
        status: query.status,
        templateCode: query.templateCode?.trim().toUpperCase(),
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
              { templateCode: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.notificationInclude,
    });

    return this.paginate(notifications, limit);
  }

  async getNotification(actor: AuthenticatedPrincipal, notificationId: string) {
    const tenantId = this.requireTenant(actor);
    const canReadTenantNotifications = actor.permissions.includes('notifications.write');
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        recipients: canReadTenantNotifications ? undefined : { some: { userId: actor.id } },
      },
      include: this.notificationInclude,
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    return notification;
  }

  async markRead(actor: AuthenticatedPrincipal, notificationId: string, dto: NotificationActionDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.notificationRecipient.findFirst({
        where: {
          userId: actor.id,
          notification: {
            id: notificationId,
            tenantId,
          },
        },
        include: {
          notification: true,
        },
      });

      if (!recipient) {
        throw new NotFoundException('Notification recipient not found.');
      }

      const readAt = new Date();
      const updatedRecipient = await tx.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: NotificationStatus.READ,
          readAt,
          deliveredAt: recipient.deliveredAt ?? readAt,
        },
        include: this.recipientInclude,
      });

      await this.maybeMarkNotificationRead(tx, recipient.notificationId);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'NotificationRecipient', recipient.id, null, {
        notificationId,
        readAt: readAt.toISOString(),
        note: dto.note,
        metadata: this.toJson(dto.metadata),
      });

      await this.enqueueOutbox(tx, tenantId, 'notification.read', 'Notification', notificationId, {
        notificationId,
        recipientId: recipient.id,
        userId: actor.id,
      });

      return updatedRecipient;
    });
  }

  async markAllRead(actor: AuthenticatedPrincipal, query: ListNotificationsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const readAt = new Date();

    const updated = await this.prisma.notificationRecipient.updateMany({
      where: {
        userId: actor.id,
        readAt: null,
        notification: {
          tenantId,
          channel: query.channel,
        },
      },
      data: {
        status: NotificationStatus.READ,
        readAt,
        deliveredAt: readAt,
      },
    });

    await this.prisma.outboxMessage.create({
      data: {
        tenantId,
        eventType: 'notification.read_all',
        aggregateType: 'User',
        aggregateId: actor.id,
        payload: {
          userId: actor.id,
          count: updated.count,
          readAt: readAt.toISOString(),
        },
      },
    });

    return {
      updated: updated.count,
      readAt: readAt.toISOString(),
    };
  }

  async deliverNotification(actor: AuthenticatedPrincipal, notificationId: string) {
    const tenantId = this.requireTenant(actor);
    const notification = await this.findNotificationForWriteOrThrow(this.prisma, tenantId, notificationId);

    if (notification.scheduledAt && notification.scheduledAt > new Date()) {
      throw new BadRequestException('Notification is scheduled for future delivery.');
    }

    const retryableStatuses: NotificationStatus[] = [
      NotificationStatus.PENDING,
      NotificationStatus.FAILED,
    ];
    const candidates = notification.recipients.filter((recipient) =>
      retryableStatuses.includes(recipient.status),
    );

    if (candidates.length === 0) {
      return notification;
    }

    const results = await Promise.all(
      candidates.map(async (recipient) => ({
        recipient,
        result: await this.delivery.deliver({ notification, recipient }),
      })),
    );

    return this.prisma.$transaction(async (tx) => {
      for (const item of results) {
        await tx.notificationRecipient.update({
          where: { id: item.recipient.id },
          data: {
            status: item.result.status,
            deliveredAt: this.isSuccessfulDelivery(item.result.status) ? new Date() : undefined,
            failureReason: item.result.failureReason,
          },
        });
      }

      const refreshed = await this.findNotificationForWriteOrThrow(tx, tenantId, notificationId);
      const status = this.aggregateNotificationStatus(refreshed.channel, refreshed.recipients);
      const updated = await tx.notification.update({
        where: { id: refreshed.id },
        data: {
          status,
          sentAt: new Date(),
          data: this.mergeJsonObject(refreshed.data, {
            lastDeliveryAttemptAt: new Date().toISOString(),
            lastDeliveryActorId: actor.id,
            deliveryResults: results.map((item) => ({
              recipientId: item.recipient.id,
              status: item.result.status,
              failureReason: item.result.failureReason,
              providerMessageId: item.result.providerMessageId,
            })),
          }),
        },
        include: this.notificationInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        status === NotificationStatus.FAILED ? AuditAction.UPDATE : AuditAction.ENABLE,
        'Notification',
        updated.id,
        this.notificationState(notification),
        this.notificationState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'notification.delivery.completed', 'Notification', updated.id, {
        notificationId: updated.id,
        status: updated.status,
        failedRecipients: updated.recipients.filter((recipient) => recipient.status === NotificationStatus.FAILED)
          .length,
      });

      return updated;
    });
  }

  async listPreferences(actor: AuthenticatedPrincipal, query: ListNotificationPreferencesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const userId = await this.resolvePreferenceUserId(this.prisma, actor, tenantId, query.userId);

    return this.prisma.notificationPreference.findMany({
      where: {
        userId,
        channel: query.channel,
        module: query.module,
      },
      orderBy: [{ module: 'asc' }, { channel: 'asc' }],
    });
  }

  async updatePreferences(actor: AuthenticatedPrincipal, dto: UpdateNotificationPreferencesDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const userId = await this.resolvePreferenceUserId(tx, actor, tenantId, dto.userId);
      const preferences = await Promise.all(
        dto.preferences.map((preference) =>
          tx.notificationPreference.upsert({
            where: {
              userId_channel_module: {
                userId,
                channel: preference.channel,
                module: preference.module.trim(),
              },
            },
            create: {
              userId,
              channel: preference.channel,
              module: preference.module.trim(),
              enabled: preference.enabled,
            },
            update: {
              enabled: preference.enabled,
            },
          }),
        ),
      );

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'NotificationPreference', userId, null, {
        userId,
        preferences: preferences.map((preference) => ({
          channel: preference.channel,
          module: preference.module,
          enabled: preference.enabled,
        })),
      });

      await this.enqueueOutbox(tx, tenantId, 'notification.preferences.updated', 'User', userId, {
        userId,
        preferences: preferences.length,
      });

      return preferences;
    });
  }

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);

    const [
      unreadInbox,
      pendingDelivery,
      failedDelivery,
      channelGroups,
      statusGroups,
    ] = await Promise.all([
      this.prisma.notificationRecipient.count({
        where: {
          userId: actor.id,
          readAt: null,
          notification: { tenantId },
        },
      }),
      this.prisma.notification.count({
        where: {
          tenantId,
          status: NotificationStatus.PENDING,
        },
      }),
      this.prisma.notificationRecipient.count({
        where: {
          status: NotificationStatus.FAILED,
          notification: { tenantId },
        },
      }),
      this.prisma.notification.groupBy({
        by: ['channel'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);

    return {
      unreadInbox,
      pendingDelivery,
      failedDelivery,
      byChannel: Object.fromEntries(channelGroups.map((item) => [item.channel, item._count._all])),
      byStatus: Object.fromEntries(statusGroups.map((item) => [item.status, item._count._all])),
    };
  }

  private async resolveRecipient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    channel: NotificationChannel,
    module: string,
    dto: CreateNotificationRecipientDto,
  ): Promise<ResolvedRecipient> {
    if (!dto.userId && !dto.employeeId && !dto.destination) {
      throw new BadRequestException('Each notification recipient needs a userId, employeeId, or destination.');
    }

    const user = dto.userId
      ? await tx.user.findFirst({
          where: { id: dto.userId, tenantId, deletedAt: null },
          select: { id: true, email: true, username: true },
        })
      : null;

    if (dto.userId && !user) {
      throw new BadRequestException('Notification user recipient is invalid for this tenant.');
    }

    const employee = dto.employeeId
      ? await tx.employee.findFirst({
          where: { id: dto.employeeId, tenantId, deletedAt: null },
          include: {
            user: {
              select: { id: true, email: true, username: true },
            },
            person: {
              include: {
                contacts: true,
              },
            },
          },
        })
      : null;

    if (dto.employeeId && !employee) {
      throw new BadRequestException('Notification employee recipient is invalid for this tenant.');
    }

    const resolvedUser = user ?? employee?.user ?? null;
    const destination = dto.destination ?? this.resolveDestination(channel, resolvedUser, employee);

    if (channel === NotificationChannel.IN_APP && !resolvedUser) {
      throw new BadRequestException('In-app notifications require a user recipient.');
    }

    const preferenceDisabled = resolvedUser
      ? !(await this.isPreferenceEnabled(tx, resolvedUser.id, channel, module))
      : false;

    return {
      userId: resolvedUser?.id ?? null,
      employeeId: employee?.id ?? null,
      destination: destination ?? null,
      status: preferenceDisabled ? NotificationStatus.CANCELLED : NotificationStatus.PENDING,
      variables: {
        ...dto.variables,
        userId: resolvedUser?.id,
        employeeId: employee?.id,
        email: resolvedUser?.email,
        username: resolvedUser?.username,
        name: employee
          ? [employee.person.firstName, employee.person.lastName].filter(Boolean).join(' ')
          : resolvedUser?.username ?? resolvedUser?.email,
      },
      preferenceDisabled,
    };
  }

  private resolveDestination(
    channel: NotificationChannel,
    user: { email: string } | null,
    employee: EmployeeWithContacts | null,
  ) {
    if (channel === NotificationChannel.EMAIL) {
      return user?.email ?? this.findContactValue(employee, 'email');
    }

    if (channel === NotificationChannel.SMS) {
      return this.findContactValue(employee, 'phone') ?? this.findContactValue(employee, 'mobile');
    }

    if (channel === NotificationChannel.PUSH) {
      return user?.email ?? null;
    }

    return null;
  }

  private findContactValue(employee: EmployeeWithContacts | null, type: string) {
    const contacts = employee?.person.contacts ?? [];
    const normalizedType = type.toLowerCase();
    return (
      contacts.find((contact) => contact.type.toLowerCase() === normalizedType && contact.isPrimary)
        ?.value ??
      contacts.find((contact) => contact.type.toLowerCase() === normalizedType)?.value ??
      null
    );
  }

  private async isPreferenceEnabled(
    tx: Prisma.TransactionClient,
    userId: string,
    channel: NotificationChannel,
    module: string,
  ) {
    const preference = await tx.notificationPreference.findUnique({
      where: {
        userId_channel_module: {
          userId,
          channel,
          module,
        },
      },
    });

    return preference?.enabled ?? true;
  }

  private async resolvePreferenceUserId(
    client: Prisma.TransactionClient | PrismaService,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    requestedUserId?: string,
  ) {
    const userId = requestedUserId ?? actor.id;

    if (userId !== actor.id && !actor.permissions.includes('notifications.write')) {
      throw new ForbiddenException('Only notification administrators can manage another user preferences.');
    }

    const user = await client.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Notification preference user is invalid for this tenant.');
    }

    return user.id;
  }

  private async findTemplateByCodeOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string,
    channel: NotificationChannel,
  ) {
    const template = await tx.notificationTemplate.findFirst({
      where: {
        code: this.normalizeCode(code),
        channel,
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }],
    });

    if (!template) {
      throw new BadRequestException('Notification template reference is invalid.');
    }

    return template;
  }

  private async findTemplateForReadOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    templateId: string,
  ) {
    const template = await client.notificationTemplate.findFirst({
      where: {
        id: templateId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!template) {
      throw new NotFoundException('Notification template not found.');
    }

    return template;
  }

  private async findTenantTemplateOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    templateId: string,
  ) {
    const template = await client.notificationTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Tenant-owned notification template not found.');
    }

    return template;
  }

  private async findNotificationForWriteOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    notificationId: string,
  ): Promise<NotificationWithRecipients> {
    const notification = await client.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
      },
      include: this.notificationInclude,
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    return notification;
  }

  private async maybeMarkNotificationRead(tx: Prisma.TransactionClient, notificationId: string) {
    const unread = await tx.notificationRecipient.count({
      where: {
        notificationId,
        readAt: null,
        status: {
          not: NotificationStatus.CANCELLED,
        },
      },
    });

    if (unread === 0) {
      await tx.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.READ },
      });
    }
  }

  private initialNotificationStatus(recipients: ResolvedRecipient[], scheduledAt: Date | null) {
    if (recipients.every((recipient) => recipient.status === NotificationStatus.CANCELLED)) {
      return NotificationStatus.CANCELLED;
    }

    if (scheduledAt && scheduledAt > new Date()) {
      return NotificationStatus.PENDING;
    }

    return NotificationStatus.PENDING;
  }

  private aggregateNotificationStatus(channel: NotificationChannel, recipients: NotificationRecipient[]) {
    const statuses = recipients.map((recipient) => recipient.status);

    if (statuses.every((status) => status === NotificationStatus.CANCELLED)) {
      return NotificationStatus.CANCELLED;
    }

    if (statuses.every((status) => status === NotificationStatus.READ)) {
      return NotificationStatus.READ;
    }

    const successful = statuses.filter((status) => this.isSuccessfulDelivery(status));

    if (successful.length === statuses.length) {
      return channel === NotificationChannel.IN_APP ? NotificationStatus.DELIVERED : NotificationStatus.SENT;
    }

    if (successful.length > 0) {
      return channel === NotificationChannel.IN_APP ? NotificationStatus.DELIVERED : NotificationStatus.SENT;
    }

    if (statuses.some((status) => status === NotificationStatus.FAILED)) {
      return NotificationStatus.FAILED;
    }

    return NotificationStatus.PENDING;
  }

  private isSuccessfulDelivery(status: NotificationStatus) {
    const successfulStatuses: NotificationStatus[] = [
      NotificationStatus.SENT,
      NotificationStatus.DELIVERED,
      NotificationStatus.READ,
    ];

    return successfulStatuses.includes(status);
  }

  private baseVariables(
    actor: AuthenticatedPrincipal,
    data: Record<string, unknown> | undefined,
    module: string,
  ) {
    return {
      ...data,
      module,
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorName: actor.username ?? actor.email,
    };
  }

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => {
      const value = this.valueAtPath(variables, key);
      if (value === undefined || value === null) {
        return '';
      }

      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        return value.toString();
      }

      return '';
    });
  }

  private valueAtPath(value: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, value);
  }

  private async createRecipientTimeline(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    notification: Pick<Notification, 'id' | 'title' | 'body' | 'channel'>,
    recipient: Pick<NotificationRecipient, 'employeeId' | 'status'>,
  ) {
    if (!recipient.employeeId || recipient.status === NotificationStatus.CANCELLED) {
      return;
    }

    await tx.timelineEvent.create({
      data: {
        tenantId,
        employeeId: recipient.employeeId,
        actorUserId: actor.id,
        type: TimelineEventType.SYSTEM,
        title: `Notification queued: ${notification.title}`,
        description: notification.body,
        entityType: 'Notification',
        entityId: notification.id,
        data: {
          notificationId: notification.id,
          channel: notification.channel,
        },
      },
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'notifications',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
      },
    });
  }

  private templateState(template: NotificationTemplate): Prisma.InputJsonObject {
    return {
      id: template.id,
      tenantId: template.tenantId,
      code: template.code,
      name: template.name,
      channel: template.channel,
      isActive: template.isActive,
    };
  }

  private notificationState(notification: Notification): Prisma.InputJsonObject {
    return {
      id: notification.id,
      channel: notification.channel,
      title: notification.title,
      status: notification.status,
      templateCode: notification.templateCode,
      scheduledAt: notification.scheduledAt?.toISOString() ?? null,
      sentAt: notification.sentAt?.toISOString() ?? null,
    };
  }

  private mergeJsonObject(value: Prisma.JsonValue | null, patch: Record<string, unknown>) {
    const base =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return this.toJson({
      ...base,
      ...patch,
    });
  }

  private paginate<TItem>(items: TItem[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? (data.at(-1) as { id?: string } | undefined)?.id : null,
      },
    };
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get notificationInclude() {
    return {
      recipients: {
        orderBy: [{ createdAt: 'asc' }],
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
          employee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.NotificationInclude;
  }

  private get recipientInclude() {
    return {
      notification: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      employee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
    } satisfies Prisma.NotificationRecipientInclude;
  }
}

type NotificationWithRecipients = Notification & {
  recipients: NotificationRecipient[];
};

type EmployeeWithContacts = {
  id: string;
  user: {
    id: string;
    email: string;
    username: string | null;
  } | null;
  person: {
    firstName: string;
    lastName: string;
    contacts: Array<{
      type: string;
      value: string;
      isPrimary: boolean;
    }>;
  };
};
