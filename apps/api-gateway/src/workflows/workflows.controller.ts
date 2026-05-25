import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ListWorkflowsQueryDto } from './dto/list-workflows-query.dto';
import { ReorderWorkflowStepsDto } from './dto/reorder-workflow-steps.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowStatusTransitionDto } from './dto/workflow-status-transition.dto';
import { CreateWorkflowStepDto, UpdateWorkflowStepDto } from './dto/workflow-step.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@ApiCookieAuth('access_token')
@Controller('api/v1/workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Create a workflow definition with optional steps.' })
  @ApiOkResponse({ description: 'Workflow created.' })
  async createWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.createWorkflow(user, dto);
  }

  @Get()
  @RequirePermissions('workflows.read')
  @ApiOperation({ summary: 'List workflow definitions.' })
  @ApiOkResponse({ description: 'Workflows returned.' })
  async listWorkflows(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListWorkflowsQueryDto,
  ) {
    return this.workflowsService.listWorkflows(user, query);
  }

  @Get(':id')
  @RequirePermissions('workflows.read')
  @ApiOperation({ summary: 'Get a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow returned.' })
  async getWorkflow(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') workflowId: string) {
    return this.workflowsService.getWorkflow(user, workflowId);
  }

  @Patch(':id')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Update a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow updated.' })
  async updateWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.updateWorkflow(user, workflowId, dto);
  }

  @Delete(':id')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Archive a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow archived.' })
  async deleteWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
  ) {
    return this.workflowsService.deleteWorkflow(user, workflowId);
  }

  @Post(':id/activate')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Activate a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow activated.' })
  async activateWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: WorkflowStatusTransitionDto,
  ) {
    return this.workflowsService.activateWorkflow(user, workflowId, dto);
  }

  @Post(':id/inactivate')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Inactivate a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow inactivated.' })
  async inactivateWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: WorkflowStatusTransitionDto,
  ) {
    return this.workflowsService.inactivateWorkflow(user, workflowId, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Archive a workflow definition.' })
  @ApiOkResponse({ description: 'Workflow archived.' })
  async archiveWorkflow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: WorkflowStatusTransitionDto,
  ) {
    return this.workflowsService.archiveWorkflow(user, workflowId, dto);
  }

  @Post(':id/steps')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Add a workflow step.' })
  @ApiOkResponse({ description: 'Workflow step created.' })
  async addStep(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: CreateWorkflowStepDto,
  ) {
    return this.workflowsService.addStep(user, workflowId, dto);
  }

  @Post(':id/steps/reorder')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Reorder all workflow steps.' })
  @ApiOkResponse({ description: 'Workflow steps reordered.' })
  async reorderSteps(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Body() dto: ReorderWorkflowStepsDto,
  ) {
    return this.workflowsService.reorderSteps(user, workflowId, dto);
  }

  @Patch(':id/steps/:stepId')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Update a workflow step.' })
  @ApiOkResponse({ description: 'Workflow step updated.' })
  async updateStep(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateWorkflowStepDto,
  ) {
    return this.workflowsService.updateStep(user, workflowId, stepId, dto);
  }

  @Delete(':id/steps/:stepId')
  @RequirePermissions('workflows.write')
  @ApiOperation({ summary: 'Delete a workflow step.' })
  @ApiOkResponse({ description: 'Workflow step deleted.' })
  async deleteStep(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') workflowId: string,
    @Param('stepId') stepId: string,
  ) {
    return this.workflowsService.deleteStep(user, workflowId, stepId);
  }
}
