import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RequireTenantFeatures } from '../tenants/decorators/require-tenant-features.decorator';
import { AssignFormDto } from './dto/assign-form.dto';
import { CreateFormDto } from './dto/create-form.dto';
import {
  ListFormResponsesQueryDto,
  ListFormsQueryDto,
  ListMyFormAssignmentsQueryDto,
} from './dto/list-forms-query.dto';
import { SubmitFormResponseDto } from './dto/submit-form-response.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { FormsService } from './forms.service';

@ApiTags('forms')
@ApiCookieAuth('access_token')
@RequireTenantFeatures('FORMS')
@Controller('api/v1/forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get('my/assignments')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'List forms assigned to the current user or linked employee.' })
  @ApiOkResponse({ description: 'Current user form assignments returned.' })
  async listMyAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListMyFormAssignmentsQueryDto,
  ) {
    return this.formsService.listMyAssignments(user, query);
  }

  @Get('my/assignments/:id')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Get one current-user form assignment.' })
  @ApiOkResponse({ description: 'Current user form assignment returned.' })
  async getMyAssignment(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') assignmentId: string) {
    return this.formsService.getMyAssignment(user, assignmentId);
  }

  @Post('my/assignments/:id/responses')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Submit a response for an assigned form.' })
  @ApiOkResponse({ description: 'Form response submitted.' })
  async submitMyResponse(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: SubmitFormResponseDto,
  ) {
    return this.formsService.submitMyResponse(user, assignmentId, dto);
  }

  @Post()
  @RequirePermissions('forms.write')
  @ApiOperation({ summary: 'Create a tenant form definition with questions.' })
  @ApiOkResponse({ description: 'Form created.' })
  async createForm(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateFormDto) {
    return this.formsService.createForm(user, dto);
  }

  @Get()
  @RequirePermissions('forms.read')
  @ApiOperation({ summary: 'List tenant forms.' })
  @ApiOkResponse({ description: 'Forms returned.' })
  async listForms(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListFormsQueryDto,
  ) {
    return this.formsService.listForms(user, query);
  }

  @Get(':id')
  @RequirePermissions('forms.read')
  @ApiOperation({ summary: 'Get one tenant form.' })
  @ApiOkResponse({ description: 'Form returned.' })
  async getForm(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') formId: string) {
    return this.formsService.getForm(user, formId);
  }

  @Patch(':id')
  @RequirePermissions('forms.write')
  @ApiOperation({ summary: 'Update a tenant form definition.' })
  @ApiOkResponse({ description: 'Form updated.' })
  async updateForm(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') formId: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.formsService.updateForm(user, formId, dto);
  }

  @Post(':id/publish')
  @RequirePermissions('forms.write')
  @ApiOperation({ summary: 'Publish a tenant form.' })
  @ApiOkResponse({ description: 'Form published.' })
  async publishForm(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') formId: string) {
    return this.formsService.publishForm(user, formId);
  }

  @Post(':id/archive')
  @RequirePermissions('forms.write')
  @ApiOperation({ summary: 'Archive a tenant form.' })
  @ApiOkResponse({ description: 'Form archived.' })
  async archiveForm(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') formId: string) {
    return this.formsService.archiveForm(user, formId);
  }

  @Post(':id/assign')
  @RequirePermissions('forms.write')
  @ApiOperation({ summary: 'Assign a published form to employees or users.' })
  @ApiOkResponse({ description: 'Form assignments created.' })
  async assignForm(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') formId: string,
    @Body() dto: AssignFormDto,
  ) {
    return this.formsService.assignForm(user, formId, dto);
  }

  @Get(':id/responses')
  @RequirePermissions('forms.read')
  @ApiOperation({ summary: 'List responses for a tenant form.' })
  @ApiOkResponse({ description: 'Form responses returned.' })
  async listResponses(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') formId: string,
    @Query() query: ListFormResponsesQueryDto,
  ) {
    return this.formsService.listResponses(user, formId, query);
  }

  @Get(':id/summary')
  @RequirePermissions('forms.read')
  @ApiOperation({ summary: 'Return response analytics for a tenant form.' })
  @ApiOkResponse({ description: 'Form response summary returned.' })
  async responseSummary(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') formId: string) {
    return this.formsService.responseSummary(user, formId);
  }
}
