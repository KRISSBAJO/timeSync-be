import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { IamService } from './iam.service';

@ApiTags('iam')
@ApiCookieAuth('access_token')
@Controller('api/v1/iam')
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @Get('permissions')
  @RequirePermissions('iam.permissions.read')
  @ApiOperation({ summary: 'List permissions available to the current tenant or platform actor.' })
  @ApiOkResponse({ description: 'Permissions returned.' })
  async listPermissions(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.iamService.listPermissions(user);
  }

  @Get('permissions/bootstrap')
  @ApiOperation({
    summary: 'Preview platform permission catalog drift before applying bootstrap sync.',
  })
  @ApiOkResponse({ description: 'Permission catalog bootstrap status returned.' })
  async getPermissionBootstrapStatus(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.iamService.getPermissionBootstrapStatus(user);
  }

  @Post('permissions/bootstrap')
  @ApiOperation({
    summary: 'Bootstrap platform permissions from the backend catalog without reseeding tenant data.',
  })
  @ApiOkResponse({ description: 'Permission catalog synchronized.' })
  async bootstrapPermissionCatalog(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.iamService.bootstrapPermissionCatalog(user);
  }

  @Get('roles')
  @RequirePermissions('iam.roles.read')
  @ApiOperation({ summary: 'List roles.' })
  @ApiOkResponse({ description: 'Roles returned.' })
  async listRoles(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.iamService.listRoles(user);
  }

  @Get('permission-templates')
  @RequirePermissions('iam.permissions.read')
  @ApiOperation({ summary: 'List reusable role permission templates.' })
  @ApiOkResponse({ description: 'Permission templates returned.' })
  listPermissionTemplates(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.iamService.listPermissionTemplates(user);
  }

  @Post('roles')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Create a role.' })
  @ApiOkResponse({ description: 'Role created.' })
  async createRole(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateRoleDto) {
    return this.iamService.createRole(user, dto);
  }

  @Get('roles/:id')
  @RequirePermissions('iam.roles.read')
  @ApiOperation({ summary: 'Get a role.' })
  @ApiOkResponse({ description: 'Role returned.' })
  async getRole(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') roleId: string) {
    return this.iamService.getRole(user, roleId);
  }

  @Patch('roles/:id')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Update a role.' })
  @ApiOkResponse({ description: 'Role updated.' })
  async updateRole(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.iamService.updateRole(user, roleId, dto);
  }

  @Post('roles/:id/permissions')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Replace a role permission set.' })
  @ApiOkResponse({ description: 'Role permissions synchronized.' })
  async syncRolePermissions(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') roleId: string,
    @Body() dto: AssignRolePermissionsDto,
  ) {
    return this.iamService.syncRolePermissions(user, roleId, dto);
  }

  @Post('roles/:id/permission-template/:templateCode')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Apply a reusable permission template to a role.' })
  @ApiOkResponse({ description: 'Role permissions synchronized from template.' })
  async applyPermissionTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') roleId: string,
    @Param('templateCode') templateCode: string,
  ) {
    return this.iamService.applyPermissionTemplate(user, roleId, templateCode);
  }

  @Post('users/:id/roles')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Assign a role to a user.' })
  @ApiOkResponse({ description: 'User role assigned.' })
  async assignUserRole(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') targetUserId: string,
    @Body() dto: AssignUserRoleDto,
  ) {
    return this.iamService.assignUserRole(user, targetUserId, dto);
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('iam.roles.write')
  @ApiOperation({ summary: 'Remove a role from a user.' })
  @ApiOkResponse({ description: 'User role removed.' })
  async removeUserRole(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') targetUserId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.iamService.removeUserRole(user, targetUserId, roleId);
  }
}
