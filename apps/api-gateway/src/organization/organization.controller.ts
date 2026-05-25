import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { CreateOrganizationNodeDto } from './dto/create-organization-node.dto';
import { ListCostCentersQueryDto } from './dto/list-cost-centers-query.dto';
import { ListOrganizationNodesQueryDto } from './dto/list-organization-nodes-query.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { UpdateOrganizationNodeDto } from './dto/update-organization-node.dto';
import { OrganizationService } from './organization.service';

@ApiTags('organization')
@ApiCookieAuth('access_token')
@Controller('api/v1/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('nodes')
  @RequirePermissions('organization.write')
  @ApiOperation({ summary: 'Create an organization node.' })
  @ApiOkResponse({ description: 'Organization node created.' })
  async createNode(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateOrganizationNodeDto,
  ) {
    return this.organizationService.createNode(user, dto);
  }

  @Get('nodes')
  @RequirePermissions('organization.read')
  @ApiOperation({ summary: 'List organization nodes.' })
  @ApiOkResponse({ description: 'Organization nodes returned.' })
  async listNodes(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListOrganizationNodesQueryDto,
  ) {
    return this.organizationService.listNodes(user, query);
  }

  @Get('tree')
  @RequirePermissions('organization.read')
  @ApiOperation({ summary: 'Return the organization hierarchy as a tree.' })
  @ApiOkResponse({ description: 'Organization tree returned.' })
  async tree(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.organizationService.getTree(user);
  }

  @Get('nodes/:id')
  @RequirePermissions('organization.read')
  @ApiOperation({ summary: 'Get an organization node.' })
  @ApiOkResponse({ description: 'Organization node returned.' })
  async getNode(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') nodeId: string) {
    return this.organizationService.getNode(user, nodeId);
  }

  @Patch('nodes/:id')
  @RequirePermissions('organization.write')
  @ApiOperation({ summary: 'Update an organization node.' })
  @ApiOkResponse({ description: 'Organization node updated.' })
  async updateNode(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') nodeId: string,
    @Body() dto: UpdateOrganizationNodeDto,
  ) {
    return this.organizationService.updateNode(user, nodeId, dto);
  }

  @Delete('nodes/:id')
  @RequirePermissions('organization.write')
  @ApiOperation({ summary: 'Soft-delete an organization node.' })
  @ApiOkResponse({ description: 'Organization node deleted.' })
  async deleteNode(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') nodeId: string) {
    return this.organizationService.deleteNode(user, nodeId);
  }

  @Post('cost-centers')
  @RequirePermissions('cost-centers.write')
  @ApiOperation({ summary: 'Create a cost center.' })
  @ApiOkResponse({ description: 'Cost center created.' })
  async createCostCenter(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateCostCenterDto,
  ) {
    return this.organizationService.createCostCenter(user, dto);
  }

  @Get('cost-centers')
  @RequirePermissions('cost-centers.read')
  @ApiOperation({ summary: 'List cost centers.' })
  @ApiOkResponse({ description: 'Cost centers returned.' })
  async listCostCenters(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListCostCentersQueryDto,
  ) {
    return this.organizationService.listCostCenters(user, query);
  }

  @Get('cost-centers/:id')
  @RequirePermissions('cost-centers.read')
  @ApiOperation({ summary: 'Get a cost center.' })
  @ApiOkResponse({ description: 'Cost center returned.' })
  async getCostCenter(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') costCenterId: string,
  ) {
    return this.organizationService.getCostCenter(user, costCenterId);
  }

  @Patch('cost-centers/:id')
  @RequirePermissions('cost-centers.write')
  @ApiOperation({ summary: 'Update a cost center.' })
  @ApiOkResponse({ description: 'Cost center updated.' })
  async updateCostCenter(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') costCenterId: string,
    @Body() dto: UpdateCostCenterDto,
  ) {
    return this.organizationService.updateCostCenter(user, costCenterId, dto);
  }

  @Delete('cost-centers/:id')
  @RequirePermissions('cost-centers.write')
  @ApiOperation({ summary: 'Soft-delete a cost center.' })
  @ApiOkResponse({ description: 'Cost center deleted.' })
  async deleteCostCenter(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') costCenterId: string,
  ) {
    return this.organizationService.deleteCostCenter(user, costCenterId);
  }
}
