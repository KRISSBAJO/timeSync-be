import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { ListNotificationTemplatesQueryDto } from './dto/list-notification-templates-query.dto';
import {
  ListNotificationsQueryDto,
  ListOutboundNotificationsQueryDto,
} from './dto/list-notifications-query.dto';
import { NotificationActionDto } from './dto/notification-action.dto';
import {
  ListNotificationPreferencesQueryDto,
  UpdateNotificationPreferencesDto,
} from './dto/update-notification-preferences.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiCookieAuth('access_token')
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('templates')
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Create a tenant-owned notification template.' })
  @ApiOkResponse({ description: 'Notification template created.' })
  async createTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateNotificationTemplateDto,
  ) {
    return this.notificationsService.createTemplate(user, dto);
  }

  @Get('templates')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'List tenant and global notification templates.' })
  @ApiOkResponse({ description: 'Notification templates returned.' })
  async listTemplates(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListNotificationTemplatesQueryDto,
  ) {
    return this.notificationsService.listTemplates(user, query);
  }

  @Get('templates/:id')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Get a notification template.' })
  @ApiOkResponse({ description: 'Notification template returned.' })
  async getTemplate(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') templateId: string) {
    return this.notificationsService.getTemplate(user, templateId);
  }

  @Patch('templates/:id')
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Update a tenant-owned notification template.' })
  @ApiOkResponse({ description: 'Notification template updated.' })
  async updateTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') templateId: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.notificationsService.updateTemplate(user, templateId, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Disable a tenant-owned notification template.' })
  @ApiOkResponse({ description: 'Notification template disabled.' })
  async disableTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') templateId: string,
  ) {
    return this.notificationsService.disableTemplate(user, templateId);
  }

  @Get('summary')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Return notification inbox and delivery metrics.' })
  @ApiOkResponse({ description: 'Notification summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.notificationsService.getSummary(user);
  }

  @Get('outbound')
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'List tenant outbound notification records.' })
  @ApiOkResponse({ description: 'Outbound notifications returned.' })
  async listOutbound(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListOutboundNotificationsQueryDto,
  ) {
    return this.notificationsService.listOutbound(user, query);
  }

  @Get('preferences')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'List notification preferences for the current user or an admin-selected user.' })
  @ApiOkResponse({ description: 'Notification preferences returned.' })
  async listPreferences(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListNotificationPreferencesQueryDto,
  ) {
    return this.notificationsService.listPreferences(user, query);
  }

  @Patch('preferences')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Update notification preferences.' })
  @ApiOkResponse({ description: 'Notification preferences updated.' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user, dto);
  }

  @Post()
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Create a notification and recipient records.' })
  @ApiOkResponse({ description: 'Notification created.' })
  async createNotification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.createNotification(user, dto);
  }

  @Get()
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'List the current user in-app notification inbox.' })
  @ApiOkResponse({ description: 'Notification inbox returned.' })
  async listInbox(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listInbox(user, query);
  }

  @Post('read-all')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Mark all current user notifications as read.' })
  @ApiOkResponse({ description: 'Notifications marked read.' })
  async markAllRead(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.markAllRead(user, query);
  }

  @Get(':id')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Get a notification visible to the current user.' })
  @ApiOkResponse({ description: 'Notification returned.' })
  async getNotification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.getNotification(user, notificationId);
  }

  @Post(':id/read')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Mark one current user notification as read.' })
  @ApiOkResponse({ description: 'Notification marked read.' })
  async markRead(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') notificationId: string,
    @Body() dto: NotificationActionDto,
  ) {
    return this.notificationsService.markRead(user, notificationId, dto);
  }

  @Post(':id/deliver')
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Deliver or retry pending notification recipients.' })
  @ApiOkResponse({ description: 'Notification delivery attempted.' })
  async deliverNotification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.deliverNotification(user, notificationId);
  }
}
