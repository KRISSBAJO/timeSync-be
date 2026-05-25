import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { ApprovalsService } from './approvals.service';
import { ApprovalActionDto } from './dto/approval-action.dto';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { DelegateApprovalDto } from './dto/delegate-approval.dto';
import { ListApprovalRequestsQueryDto } from './dto/list-approval-requests-query.dto';
import { ListApprovalTasksQueryDto } from './dto/list-approval-tasks-query.dto';
import { ListDelegationsQueryDto } from './dto/list-delegations-query.dto';
import { SubmitApprovalRequestDto } from './dto/submit-approval-request.dto';
import { UpdateDelegationDto } from './dto/update-delegation.dto';

@ApiTags('approvals')
@ApiCookieAuth('access_token')
@Controller('api/v1/approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post('requests')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Submit an approval request against an active workflow.' })
  @ApiOkResponse({ description: 'Approval request submitted.' })
  async submitRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: SubmitApprovalRequestDto,
  ) {
    return this.approvalsService.submitRequest(user, dto);
  }

  @Get('requests')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'List approval requests.' })
  @ApiOkResponse({ description: 'Approval requests returned.' })
  async listRequests(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListApprovalRequestsQueryDto,
  ) {
    return this.approvalsService.listRequests(user, query);
  }

  @Get('tasks')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'List approval tasks, defaulting to the current user.' })
  @ApiOkResponse({ description: 'Approval tasks returned.' })
  async listTasks(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListApprovalTasksQueryDto,
  ) {
    return this.approvalsService.listTasks(user, query);
  }

  @Get('requests/:id')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'Get an approval request.' })
  @ApiOkResponse({ description: 'Approval request returned.' })
  async getRequest(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') requestId: string) {
    return this.approvalsService.getRequest(user, requestId);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Approve the current approval step.' })
  @ApiOkResponse({ description: 'Approval step approved.' })
  async approveRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveRequest(user, requestId, dto);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Reject the current approval step and request.' })
  @ApiOkResponse({ description: 'Approval request rejected.' })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectRequest(user, requestId, dto);
  }

  @Post('requests/:id/return')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Return the current approval step for changes.' })
  @ApiOkResponse({ description: 'Approval request returned for changes.' })
  async returnRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnRequest(user, requestId, dto);
  }

  @Post('requests/:id/comment')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'Comment on an approval request.' })
  @ApiOkResponse({ description: 'Approval comment added.' })
  async commentOnRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.commentOnRequest(user, requestId, dto);
  }

  @Post('requests/:id/delegate')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Delegate the current approval step to another user.' })
  @ApiOkResponse({ description: 'Approval step delegated.' })
  async delegateCurrentStep(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DelegateApprovalDto,
  ) {
    return this.approvalsService.delegateCurrentStep(user, requestId, dto);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Cancel a pending approval request.' })
  @ApiOkResponse({ description: 'Approval request cancelled.' })
  async cancelRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.cancelRequest(user, requestId, dto);
  }

  @Post('requests/:id/withdraw')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Withdraw a pending approval request.' })
  @ApiOkResponse({ description: 'Approval request withdrawn.' })
  async withdrawRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.withdrawRequest(user, requestId, dto);
  }

  @Post('delegations')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Create an approval delegation.' })
  @ApiOkResponse({ description: 'Delegation created.' })
  async createDelegation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateDelegationDto,
  ) {
    return this.approvalsService.createDelegation(user, dto);
  }

  @Get('delegations')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'List approval delegations.' })
  @ApiOkResponse({ description: 'Delegations returned.' })
  async listDelegations(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListDelegationsQueryDto,
  ) {
    return this.approvalsService.listDelegations(user, query);
  }

  @Patch('delegations/:id')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Update an approval delegation.' })
  @ApiOkResponse({ description: 'Delegation updated.' })
  async updateDelegation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') delegationId: string,
    @Body() dto: UpdateDelegationDto,
  ) {
    return this.approvalsService.updateDelegation(user, delegationId, dto);
  }

  @Delete('delegations/:id')
  @RequirePermissions('approvals.process')
  @ApiOperation({ summary: 'Disable an approval delegation.' })
  @ApiOkResponse({ description: 'Delegation disabled.' })
  async deleteDelegation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') delegationId: string,
  ) {
    return this.approvalsService.deleteDelegation(user, delegationId);
  }
}
