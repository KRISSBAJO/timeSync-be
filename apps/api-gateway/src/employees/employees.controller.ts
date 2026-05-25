import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateDocumentVersionUploadIntentDto } from '../documents/dto/create-document-version-upload-intent.dto';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import {
  EmployeeLifecycleDto,
  HireEmployeeDto,
  RehireEmployeeDto,
  ReinstateEmployeeDto,
  SeparateEmployeeDto,
} from './dto/employee-lifecycle.dto';
import {
  CreateEmployeeClearanceItemDto,
  CreateEmployeeRehireRecordDto,
  StartEmployeeOffboardingDto,
  UpdateEmployeeClearanceItemDto,
  UpdateEmployeeExitRecordDto,
} from './dto/employee-exit-governance.dto';
import {
  BlockEmployeeLifecycleTaskDto,
  CompleteEmployeeLifecycleTaskDto,
  CreateEmployeeLifecyclePlanDto,
  CreateEmployeeLifecycleTemplateDto,
  CreateEmployeeLifecycleTemplateTaskDto,
  CreateEmployeeLifecycleTaskDto,
  CreateMyEmployeeDocumentDto,
  InstantiateEmployeeLifecycleTemplateDto,
  RemindEmployeeLifecycleTaskDto,
  UpdateEmployeeLifecyclePlanDto,
  UpdateEmployeeLifecycleTemplateDto,
  UpdateEmployeeLifecycleTemplateTaskDto,
  UpdateEmployeeLifecycleTaskDto,
  WaiveEmployeeLifecycleTaskDto,
} from './dto/employee-lifecycle-plan.dto';
import {
  CreateEmployeeCompensationChangeDto,
  CreateEmployeeReportingRelationshipDto,
  UpdateEmployeeReportingRelationshipDto,
  UpsertEmployeeCompensationComponentDto,
  UpsertEmployeeEmploymentTermDto,
} from './dto/employee-employment-terms.dto';
import {
  UpdateEmployeeExtendedProfileDto,
  UpdateEmployeeMasterDataDto,
  UpdateEmployeeSelfServiceMasterDataDto,
} from './dto/employee-master-data.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import {
  CreateLeadershipDesignationDto,
  ListLeadershipPoolQueryDto,
  UpdateLeadershipDesignationDto,
} from './dto/leadership-designation.dto';
import { LinkEmployeeAccountDto } from './dto/link-employee-account.dto';
import {
  CommitEmployeeImportDto,
  PreviewEmployeeImportDto,
} from './dto/preview-employee-import.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiCookieAuth('access_token')
@Controller('api/v1/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('number-preview')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Preview the next tenant employee number.' })
  @ApiOkResponse({ description: 'Next employee number preview returned.' })
  async previewEmployeeNumber(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.previewEmployeeNumber(user);
  }

  @Get('summary')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Return employee lifecycle and headcount summary metrics.' })
  @ApiOkResponse({ description: 'Employee summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.getSummary(user);
  }

  @Get('export.csv')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Export tenant employees as CSV using current filters.' })
  @ApiOkResponse({ description: 'Employee CSV returned.' })
  async exportEmployeesCsv(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListEmployeesQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.employeesService.exportEmployeesCsv(user, query);
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', 'attachment; filename="timesync-employees.csv"');
    response.send(csv);
  }

  @Post('import-preview')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Validate employee CSV content before a governed import.' })
  @ApiOkResponse({ description: 'Employee import preview returned.' })
  async previewEmployeeImport(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: PreviewEmployeeImportDto,
  ) {
    return this.employeesService.previewEmployeeImport(user, dto);
  }

  @Post('import-commit')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Commit a validated employee CSV import as governed person and employee records.' })
  @ApiOkResponse({ description: 'Employee import committed.' })
  async commitEmployeeImport(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CommitEmployeeImportDto,
  ) {
    return this.employeesService.commitEmployeeImport(user, dto);
  }

  @Get('import-batches')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'List governed employee import batches with batch IDs and commit metadata.' })
  @ApiOkResponse({ description: 'Employee import batches returned.' })
  async listEmployeeImportBatches(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.listEmployeeImportBatches(user);
  }

  @Get('import-batches/:batchId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Get a governed employee import batch and its created records.' })
  @ApiOkResponse({ description: 'Employee import batch returned.' })
  async getEmployeeImportBatch(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('batchId') batchId: string,
  ) {
    return this.employeesService.getEmployeeImportBatch(user, batchId);
  }

  @Post('import-batches/:batchId/rollback')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Safely soft-rollback employee records created by an import batch.' })
  @ApiOkResponse({ description: 'Employee import batch rollback completed.' })
  async rollbackEmployeeImportBatch(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('batchId') batchId: string,
  ) {
    return this.employeesService.rollbackEmployeeImportBatch(user, batchId);
  }

  @Post()
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create an employee employment relationship for a person.' })
  @ApiOkResponse({ description: 'Employee created.' })
  async createEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(user, dto);
  }

  @Get()
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List employees.' })
  @ApiOkResponse({ description: 'Employees returned.' })
  async listEmployees(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.employeesService.listEmployees(user, query);
  }

  @Get('me')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return the signed-in user employee self-service profile.' })
  @ApiOkResponse({ description: 'Employee self-service profile returned.' })
  async getMyEmployment(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.getMyEmployment(user);
  }

  @Patch('me/master-data')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Update the signed-in employee self-service master data.' })
  @ApiOkResponse({ description: 'Employee self-service master data updated.' })
  async updateMyMasterData(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateEmployeeSelfServiceMasterDataDto,
  ) {
    return this.employeesService.updateMyMasterData(user, dto);
  }

  @Patch('me/extended-profile')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Update the signed-in employee dependents, references, payout, and eligibility records.' })
  @ApiOkResponse({ description: 'Employee self-service extended profile updated.' })
  async updateMyExtendedProfile(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateEmployeeExtendedProfileDto,
  ) {
    return this.employeesService.updateMyExtendedProfile(user, dto);
  }

  @Get('me/lifecycle-tasks')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'List lifecycle tasks assigned to the signed-in employee.' })
  @ApiOkResponse({ description: 'Employee self-service lifecycle tasks returned.' })
  async listMyLifecycleTasks(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.listMyLifecycleTasks(user);
  }

  @Post('me/lifecycle-tasks/:taskId/complete')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Complete a lifecycle task assigned to the signed-in employee.' })
  @ApiOkResponse({ description: 'Employee self-service lifecycle task completed.' })
  async completeMyLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.completeMyLifecycleTask(user, taskId, dto);
  }

  @Post('me/documents/upload-intent')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Create an employee self-service document upload intent.' })
  @ApiOkResponse({ description: 'Employee self-service document upload intent created.' })
  async createMyEmployeeDocumentUploadIntent(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateDocumentVersionUploadIntentDto,
  ) {
    return this.employeesService.createMyEmployeeDocumentUploadIntent(user, dto);
  }

  @Put('me/documents/uploads/local/:token')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Upload a self-service document object using an upload intent token.' })
  @ApiOkResponse({ description: 'Employee self-service document object uploaded.' })
  async uploadMyEmployeeDocumentLocalObject(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('token') token: string,
    @Req() request: Request,
  ) {
    return this.employeesService.saveMyEmployeeDocumentLocalUpload(user, token, request);
  }

  @Post('me/documents')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Submit an employee self-service document for HR review.' })
  @ApiOkResponse({ description: 'Employee self-service document submitted.' })
  async createMyEmployeeDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateMyEmployeeDocumentDto,
  ) {
    return this.employeesService.createMyEmployeeDocument(user, dto);
  }

  @Get('leadership-pool')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List employees designated for manager, supervisor, unit-head, or approver assignment.' })
  @ApiOkResponse({ description: 'Leadership eligibility pool returned.' })
  async leadershipPool(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListLeadershipPoolQueryDto,
  ) {
    return this.employeesService.listLeadershipPool(user, query);
  }

  @Get('lifecycle-templates')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List reusable preboarding, onboarding, crossboarding, and offboarding templates.' })
  @ApiOkResponse({ description: 'Employee lifecycle templates returned.' })
  async listEmployeeLifecycleTemplates(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.employeesService.listEmployeeLifecycleTemplates(user);
  }

  @Post('lifecycle-templates')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create a reusable lifecycle checklist template.' })
  @ApiOkResponse({ description: 'Employee lifecycle template created.' })
  async createEmployeeLifecycleTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateEmployeeLifecycleTemplateDto,
  ) {
    return this.employeesService.createEmployeeLifecycleTemplate(user, dto);
  }

  @Get('lifecycle-templates/:templateId')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Get a reusable lifecycle checklist template.' })
  @ApiOkResponse({ description: 'Employee lifecycle template returned.' })
  async getEmployeeLifecycleTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('templateId') templateId: string,
  ) {
    return this.employeesService.getEmployeeLifecycleTemplate(user, templateId);
  }

  @Patch('lifecycle-templates/:templateId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update a reusable lifecycle checklist template.' })
  @ApiOkResponse({ description: 'Employee lifecycle template updated.' })
  async updateEmployeeLifecycleTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateEmployeeLifecycleTemplateDto,
  ) {
    return this.employeesService.updateEmployeeLifecycleTemplate(user, templateId, dto);
  }

  @Post('lifecycle-templates/:templateId/tasks')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Add a task definition to a reusable lifecycle template.' })
  @ApiOkResponse({ description: 'Employee lifecycle template task created.' })
  async createEmployeeLifecycleTemplateTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('templateId') templateId: string,
    @Body() dto: CreateEmployeeLifecycleTemplateTaskDto,
  ) {
    return this.employeesService.createEmployeeLifecycleTemplateTask(user, templateId, dto);
  }

  @Patch('lifecycle-template-tasks/:taskId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update a reusable lifecycle template task.' })
  @ApiOkResponse({ description: 'Employee lifecycle template task updated.' })
  async updateEmployeeLifecycleTemplateTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateEmployeeLifecycleTemplateTaskDto,
  ) {
    return this.employeesService.updateEmployeeLifecycleTemplateTask(user, taskId, dto);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Get an employee profile with current workforce context.' })
  @ApiOkResponse({ description: 'Employee returned.' })
  async getEmployee(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') employeeId: string) {
    return this.employeesService.getEmployee(user, employeeId);
  }

  @Get(':id/master-data')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Get governed employee master data readiness and profile details.' })
  @ApiOkResponse({ description: 'Employee master data returned.' })
  async getEmployeeMasterData(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.getEmployeeMasterData(user, employeeId);
  }

  @Get(':id/extended-profile')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Get employee dependents, references, payout, and work eligibility records.' })
  @ApiOkResponse({ description: 'Employee extended profile returned.' })
  async getEmployeeExtendedProfile(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.getEmployeeExtendedProfile(user, employeeId);
  }

  @Patch(':id')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update non-lifecycle employee profile fields.' })
  @ApiOkResponse({ description: 'Employee updated.' })
  async updateEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(user, employeeId, dto);
  }

  @Patch(':id/master-data')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update governed HR employee master data.' })
  @ApiOkResponse({ description: 'Employee master data updated.' })
  async updateEmployeeMasterData(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: UpdateEmployeeMasterDataDto,
  ) {
    return this.employeesService.updateEmployeeMasterData(user, employeeId, dto);
  }

  @Patch(':id/extended-profile')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update governed HR employee extended profile records.' })
  @ApiOkResponse({ description: 'Employee extended profile updated.' })
  async updateEmployeeExtendedProfile(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: UpdateEmployeeExtendedProfileDto,
  ) {
    return this.employeesService.updateEmployeeExtendedProfile(user, employeeId, dto);
  }

  @Get(':id/employment-terms')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List employee employment terms, grade alignment, and compensation-ready contract records.' })
  @ApiOkResponse({ description: 'Employee employment terms returned.' })
  async listEmployeeEmploymentTerms(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.listEmployeeEmploymentTerms(user, employeeId);
  }

  @Post(':id/employment-terms')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create controlled employment terms for an employee.' })
  @ApiOkResponse({ description: 'Employee employment terms created.' })
  async createEmployeeEmploymentTerm(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: UpsertEmployeeEmploymentTermDto,
  ) {
    return this.employeesService.createEmployeeEmploymentTerm(user, employeeId, dto);
  }

  @Patch(':id/employment-terms/:termId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update controlled employment terms for an employee.' })
  @ApiOkResponse({ description: 'Employee employment terms updated.' })
  async updateEmployeeEmploymentTerm(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('termId') termId: string,
    @Body() dto: UpsertEmployeeEmploymentTermDto,
  ) {
    return this.employeesService.updateEmployeeEmploymentTerm(user, employeeId, termId, dto);
  }

  @Post(':id/compensation-components')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create an employee compensation component such as an allowance or base-pay placeholder.' })
  @ApiOkResponse({ description: 'Employee compensation component created.' })
  async createEmployeeCompensationComponent(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: UpsertEmployeeCompensationComponentDto,
  ) {
    return this.employeesService.createEmployeeCompensationComponent(user, employeeId, dto);
  }

  @Patch(':id/compensation-components/:componentId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update an employee compensation component.' })
  @ApiOkResponse({ description: 'Employee compensation component updated.' })
  async updateEmployeeCompensationComponent(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpsertEmployeeCompensationComponentDto,
  ) {
    return this.employeesService.updateEmployeeCompensationComponent(user, employeeId, componentId, dto);
  }

  @Post(':id/compensation-changes')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create a workflow-ready employee compensation change proposal.' })
  @ApiOkResponse({ description: 'Employee compensation change created.' })
  async createEmployeeCompensationChange(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: CreateEmployeeCompensationChangeDto,
  ) {
    return this.employeesService.createEmployeeCompensationChange(user, employeeId, dto);
  }

  @Post(':id/compensation-changes/:changeId/approve')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Approve an employee compensation change proposal.' })
  @ApiOkResponse({ description: 'Employee compensation change approved.' })
  async approveEmployeeCompensationChange(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('changeId') changeId: string,
  ) {
    return this.employeesService.approveEmployeeCompensationChange(user, employeeId, changeId);
  }

  @Post(':id/compensation-changes/:changeId/apply')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Apply an approved employee compensation change.' })
  @ApiOkResponse({ description: 'Employee compensation change applied.' })
  async applyEmployeeCompensationChange(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('changeId') changeId: string,
  ) {
    return this.employeesService.applyEmployeeCompensationChange(user, employeeId, changeId);
  }

  @Post(':id/reporting-relationships')
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'Create an effective-dated employee reporting relationship.' })
  @ApiOkResponse({ description: 'Employee reporting relationship created.' })
  async createEmployeeReportingRelationship(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: CreateEmployeeReportingRelationshipDto,
  ) {
    return this.employeesService.createEmployeeReportingRelationship(user, employeeId, dto);
  }

  @Patch(':id/reporting-relationships/:relationshipId')
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'Update an effective-dated employee reporting relationship.' })
  @ApiOkResponse({ description: 'Employee reporting relationship updated.' })
  async updateEmployeeReportingRelationship(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('relationshipId') relationshipId: string,
    @Body() dto: UpdateEmployeeReportingRelationshipDto,
  ) {
    return this.employeesService.updateEmployeeReportingRelationship(user, employeeId, relationshipId, dto);
  }

  @Get(':id/lifecycle-plans')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List employee lifecycle plans and task checklists.' })
  @ApiOkResponse({ description: 'Employee lifecycle plans returned.' })
  async listEmployeeLifecyclePlans(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.listEmployeeLifecyclePlans(user, employeeId);
  }

  @Post(':id/lifecycle-plans')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create a governed employee lifecycle plan.' })
  @ApiOkResponse({ description: 'Employee lifecycle plan created.' })
  async createEmployeeLifecyclePlan(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: CreateEmployeeLifecyclePlanDto,
  ) {
    return this.employeesService.createEmployeeLifecyclePlan(user, employeeId, dto);
  }

  @Post(':id/lifecycle-plans/from-template')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create an employee lifecycle plan from a reusable checklist template.' })
  @ApiOkResponse({ description: 'Employee lifecycle plan created from template.' })
  async createEmployeeLifecyclePlanFromTemplate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: InstantiateEmployeeLifecycleTemplateDto,
  ) {
    return this.employeesService.createEmployeeLifecyclePlanFromTemplate(user, employeeId, dto);
  }

  @Patch(':id/lifecycle-plans/:planId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update a governed employee lifecycle plan.' })
  @ApiOkResponse({ description: 'Employee lifecycle plan updated.' })
  async updateEmployeeLifecyclePlan(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('planId') planId: string,
    @Body() dto: UpdateEmployeeLifecyclePlanDto,
  ) {
    return this.employeesService.updateEmployeeLifecyclePlan(user, employeeId, planId, dto);
  }

  @Post(':id/lifecycle-plans/:planId/tasks')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create a lifecycle checklist task for an employee.' })
  @ApiOkResponse({ description: 'Employee lifecycle task created.' })
  async createEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('planId') planId: string,
    @Body() dto: CreateEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.createEmployeeLifecycleTask(user, employeeId, planId, dto);
  }

  @Patch(':id/lifecycle-tasks/:taskId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update a lifecycle checklist task for an employee.' })
  @ApiOkResponse({ description: 'Employee lifecycle task updated.' })
  async updateEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.updateEmployeeLifecycleTask(user, employeeId, taskId, dto);
  }

  @Post(':id/lifecycle-tasks/:taskId/complete')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Complete a lifecycle checklist task for an employee.' })
  @ApiOkResponse({ description: 'Employee lifecycle task completed.' })
  async completeEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.completeEmployeeLifecycleTask(user, employeeId, taskId, dto);
  }

  @Post(':id/lifecycle-tasks/:taskId/block')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Block a lifecycle checklist task that needs dependency resolution.' })
  @ApiOkResponse({ description: 'Employee lifecycle task blocked.' })
  async blockEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: BlockEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.blockEmployeeLifecycleTask(user, employeeId, taskId, dto);
  }

  @Post(':id/lifecycle-tasks/:taskId/waive')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Waive a lifecycle checklist task with an audit reason.' })
  @ApiOkResponse({ description: 'Employee lifecycle task waived.' })
  async waiveEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: WaiveEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.waiveEmployeeLifecycleTask(user, employeeId, taskId, dto);
  }

  @Post(':id/lifecycle-tasks/:taskId/remind')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Send an onboarding reminder for a lifecycle checklist task.' })
  @ApiOkResponse({ description: 'Employee lifecycle task reminder recorded.' })
  async remindEmployeeLifecycleTask(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: RemindEmployeeLifecycleTaskDto,
  ) {
    return this.employeesService.remindEmployeeLifecycleTask(user, employeeId, taskId, dto);
  }

  @Delete(':id')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Archive an employee after terminal lifecycle state.' })
  @ApiOkResponse({ description: 'Employee archived.' })
  async deleteEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.deleteEmployee(user, employeeId);
  }

  @Post(':id/hire')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Move a preboarding employee into active/probation employment.' })
  @ApiOkResponse({ description: 'Employee hired.' })
  async hireEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: HireEmployeeDto,
  ) {
    return this.employeesService.hireEmployee(user, employeeId, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Confirm an employee and set confirmation date.' })
  @ApiOkResponse({ description: 'Employee confirmed.' })
  async confirmEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.employeesService.confirmEmployee(user, employeeId, dto);
  }

  @Post(':id/suspend')
  @RequirePermissions('employees.suspend')
  @ApiOperation({ summary: 'Suspend an active/probation employee.' })
  @ApiOkResponse({ description: 'Employee suspended.' })
  async suspendEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.employeesService.suspendEmployee(user, employeeId, dto);
  }

  @Post(':id/reinstate')
  @RequirePermissions('employees.suspend')
  @ApiOperation({ summary: 'Reinstate a suspended employee.' })
  @ApiOkResponse({ description: 'Employee reinstated.' })
  async reinstateEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: ReinstateEmployeeDto,
  ) {
    return this.employeesService.reinstateEmployee(user, employeeId, dto);
  }

  @Post(':id/separate')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Separate an employee and preserve lifecycle history.' })
  @ApiOkResponse({ description: 'Employee separated.' })
  async separateEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: SeparateEmployeeDto,
  ) {
    return this.employeesService.separateEmployee(user, employeeId, dto);
  }

  @Post(':id/retire')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Retire an employee.' })
  @ApiOkResponse({ description: 'Employee retired.' })
  async retireEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.employeesService.retireEmployee(user, employeeId, dto);
  }

  @Post(':id/alumni')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Move a separated or retired employee to alumni state.' })
  @ApiOkResponse({ description: 'Employee moved to alumni.' })
  async markAlumni(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.employeesService.markAlumni(user, employeeId, dto);
  }

  @Post(':id/rehire')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Rehire a terminal-state employee.' })
  @ApiOkResponse({ description: 'Employee rehired.' })
  async rehireEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: RehireEmployeeDto,
  ) {
    return this.employeesService.rehireEmployee(user, employeeId, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Archive a terminal-state employee.' })
  @ApiOkResponse({ description: 'Employee archived.' })
  async archiveEmployee(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.employeesService.archiveEmployee(user, employeeId, dto);
  }

  @Post(':id/account')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Create or link a user account for an employee self-service profile.' })
  @ApiOkResponse({ description: 'Employee account linked.' })
  async linkEmployeeAccount(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: LinkEmployeeAccountDto,
  ) {
    return this.employeesService.linkEmployeeAccount(user, employeeId, dto);
  }

  @Post(':id/account/resend-invitation')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Resend a secure employee self-service setup invitation.' })
  @ApiOkResponse({ description: 'Employee account invitation resent.' })
  async resendEmployeeAccountInvitation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.resendEmployeeAccountInvitation(user, employeeId);
  }

  @Get(':id/exit-records')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'List employee offboarding cases, clearance items, and rehire history.' })
  @ApiOkResponse({ description: 'Employee offboarding cases returned.' })
  async listEmployeeExitRecords(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.listEmployeeExitRecords(user, employeeId);
  }

  @Post(':id/offboarding/start')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Open a managed offboarding case with exit clearances and optional template tasks.' })
  @ApiOkResponse({ description: 'Employee offboarding case opened.' })
  async startEmployeeOffboarding(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: StartEmployeeOffboardingDto,
  ) {
    return this.employeesService.startEmployeeOffboarding(user, employeeId, dto);
  }

  @Patch(':id/exit-records/:exitRecordId')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Update an employee offboarding case.' })
  @ApiOkResponse({ description: 'Employee offboarding case updated.' })
  async updateEmployeeExitRecord(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('exitRecordId') exitRecordId: string,
    @Body() dto: UpdateEmployeeExitRecordDto,
  ) {
    return this.employeesService.updateEmployeeExitRecord(user, employeeId, exitRecordId, dto);
  }

  @Post(':id/exit-records/:exitRecordId/complete')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Complete an offboarding case once all clearances are terminal.' })
  @ApiOkResponse({ description: 'Employee offboarding case completed.' })
  async completeEmployeeExitRecord(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('exitRecordId') exitRecordId: string,
  ) {
    return this.employeesService.completeEmployeeExitRecord(user, employeeId, exitRecordId);
  }

  @Post(':id/exit-records/:exitRecordId/clearance-items')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Create an asset, access, document, finance, or knowledge-transfer clearance item.' })
  @ApiOkResponse({ description: 'Employee clearance item created.' })
  async createEmployeeClearanceItem(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('exitRecordId') exitRecordId: string,
    @Body() dto: CreateEmployeeClearanceItemDto,
  ) {
    return this.employeesService.createEmployeeClearanceItem(user, employeeId, exitRecordId, dto);
  }

  @Patch(':id/exit-clearance-items/:clearanceItemId')
  @RequirePermissions('employees.separate')
  @ApiOperation({ summary: 'Update a clearance item status, owner, due date, or evidence.' })
  @ApiOkResponse({ description: 'Employee clearance item updated.' })
  async updateEmployeeClearanceItem(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('clearanceItemId') clearanceItemId: string,
    @Body() dto: UpdateEmployeeClearanceItemDto,
  ) {
    return this.employeesService.updateEmployeeClearanceItem(user, employeeId, clearanceItemId, dto);
  }

  @Post(':id/rehire-records')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Record a governed rehire review and policy decision.' })
  @ApiOkResponse({ description: 'Employee rehire record created.' })
  async createEmployeeRehireRecord(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: CreateEmployeeRehireRecordDto,
  ) {
    return this.employeesService.createEmployeeRehireRecord(user, employeeId, dto);
  }

  @Get(':id/governance-snapshot')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Return employee readiness, masking, compliance, audit, import, and governance signals.' })
  @ApiOkResponse({ description: 'Employee governance snapshot returned.' })
  async getEmployeeGovernanceSnapshot(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.getEmployeeGovernanceSnapshot(user, employeeId);
  }

  @Post(':id/leadership-designations')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Designate an employee for manager, supervisor, unit-head, or approver eligibility.' })
  @ApiOkResponse({ description: 'Leadership designation created.' })
  async createLeadershipDesignation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Body() dto: CreateLeadershipDesignationDto,
  ) {
    return this.employeesService.createLeadershipDesignation(user, employeeId, dto);
  }

  @Patch(':id/leadership-designations/:designationId')
  @RequirePermissions('employees.write')
  @ApiOperation({ summary: 'Update or deactivate a leadership eligibility designation.' })
  @ApiOkResponse({ description: 'Leadership designation updated.' })
  async updateLeadershipDesignation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
    @Param('designationId') designationId: string,
    @Body() dto: UpdateLeadershipDesignationDto,
  ) {
    return this.employeesService.updateLeadershipDesignation(user, employeeId, designationId, dto);
  }

  @Get(':id/workforce-actions')
  @RequirePermissions('workforce-actions.read')
  @ApiOperation({ summary: 'List workforce actions for an employee.' })
  @ApiOkResponse({ description: 'Workforce actions returned.' })
  async workforceActions(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') employeeId: string,
  ) {
    return this.employeesService.listWorkforceActions(user, employeeId);
  }

  @Get(':id/timeline')
  @RequirePermissions('timeline.read')
  @ApiOperation({ summary: 'List timeline events for an employee.' })
  @ApiOkResponse({ description: 'Timeline returned.' })
  async timeline(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') employeeId: string) {
    return this.employeesService.listTimeline(user, employeeId);
  }
}
