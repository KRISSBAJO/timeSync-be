import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { EndAssignmentDto } from './dto/end-assignment.dto';
import { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@Controller('api/v1/assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'Create an effective-dated employee assignment.' })
  @ApiOkResponse({ description: 'Assignment created.' })
  async createAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignmentsService.createAssignment(user, dto);
  }

  @Get()
  @RequirePermissions('assignments.read')
  @ApiOperation({ summary: 'List employee assignments.' })
  @ApiOkResponse({ description: 'Assignments returned.' })
  async listAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAssignmentsQueryDto,
  ) {
    return this.assignmentsService.listAssignments(user, query);
  }

  @Get('current')
  @RequirePermissions('assignments.read')
  @ApiOperation({ summary: 'List assignments active on the requested date.' })
  @ApiOkResponse({ description: 'Current assignments returned.' })
  async currentAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAssignmentsQueryDto,
  ) {
    return this.assignmentsService.listCurrentAssignments(user, query);
  }

  @Get('summary')
  @RequirePermissions('assignments.read')
  @ApiOperation({ summary: 'Return current assignment and position-capacity metrics.' })
  @ApiOkResponse({ description: 'Assignment summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.assignmentsService.getSummary(user);
  }

  @Get('employees/:employeeId/history')
  @RequirePermissions('assignments.read')
  @ApiOperation({ summary: 'Return assignment history for an employee.' })
  @ApiOkResponse({ description: 'Employee assignment history returned.' })
  async employeeHistory(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('employeeId') employeeId: string,
  ) {
    return this.assignmentsService.employeeAssignmentHistory(user, employeeId);
  }

  @Get(':id')
  @RequirePermissions('assignments.read')
  @ApiOperation({ summary: 'Get an employee assignment.' })
  @ApiOkResponse({ description: 'Assignment returned.' })
  async getAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
  ) {
    return this.assignmentsService.getAssignment(user, assignmentId);
  }

  @Patch(':id')
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'Update an effective-dated employee assignment.' })
  @ApiOkResponse({ description: 'Assignment updated.' })
  async updateAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.updateAssignment(user, assignmentId, dto);
  }

  @Post(':id/end')
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'End an active or future employee assignment.' })
  @ApiOkResponse({ description: 'Assignment ended.' })
  async endAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: EndAssignmentDto,
  ) {
    return this.assignmentsService.endAssignment(user, assignmentId, dto);
  }

  @Delete(':id')
  @RequirePermissions('assignments.write')
  @ApiOperation({ summary: 'Delete a future assignment that has not become effective.' })
  @ApiOkResponse({ description: 'Future assignment deleted.' })
  async deleteAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
  ) {
    return this.assignmentsService.deleteAssignment(user, assignmentId);
  }
}
