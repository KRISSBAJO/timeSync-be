import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { CreatePositionGradeDto } from './dto/create-position-grade.dto';
import { CreatePositionLevelDto } from './dto/create-position-level.dto';
import { CreatePositionSkillDto } from './dto/create-position-skill.dto';
import { CreateSkillDto } from './dto/create-skill.dto';
import { ListPositionGradesQueryDto } from './dto/list-position-grades-query.dto';
import { ListPositionLevelsQueryDto } from './dto/list-position-levels-query.dto';
import { ListPositionsQueryDto } from './dto/list-positions-query.dto';
import { ListSkillsQueryDto } from './dto/list-skills-query.dto';
import { PositionOccupantsQueryDto } from './dto/position-occupants-query.dto';
import { PositionStatusTransitionDto } from './dto/position-status-transition.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { UpdatePositionGradeDto } from './dto/update-position-grade.dto';
import { UpdatePositionLevelDto } from './dto/update-position-level.dto';
import { UpdatePositionSkillDto } from './dto/update-position-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { PositionsService } from './positions.service';

@ApiTags('positions')
@ApiCookieAuth('access_token')
@Controller('api/v1/positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post('grades')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Create a position grade.' })
  @ApiOkResponse({ description: 'Position grade created.' })
  async createGrade(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreatePositionGradeDto,
  ) {
    return this.positionsService.createGrade(user, dto);
  }

  @Get('grades')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'List position grades.' })
  @ApiOkResponse({ description: 'Position grades returned.' })
  async listGrades(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListPositionGradesQueryDto,
  ) {
    return this.positionsService.listGrades(user, query);
  }

  @Get('grades/:id')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Get a position grade.' })
  @ApiOkResponse({ description: 'Position grade returned.' })
  async getGrade(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') gradeId: string) {
    return this.positionsService.getGrade(user, gradeId);
  }

  @Patch('grades/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Update a position grade.' })
  @ApiOkResponse({ description: 'Position grade updated.' })
  async updateGrade(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') gradeId: string,
    @Body() dto: UpdatePositionGradeDto,
  ) {
    return this.positionsService.updateGrade(user, gradeId, dto);
  }

  @Delete('grades/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Soft-delete an unused position grade.' })
  @ApiOkResponse({ description: 'Position grade deleted.' })
  async deleteGrade(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') gradeId: string) {
    return this.positionsService.deleteGrade(user, gradeId);
  }

  @Post('levels')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Create a position level.' })
  @ApiOkResponse({ description: 'Position level created.' })
  async createLevel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreatePositionLevelDto,
  ) {
    return this.positionsService.createLevel(user, dto);
  }

  @Get('levels')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'List position levels.' })
  @ApiOkResponse({ description: 'Position levels returned.' })
  async listLevels(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListPositionLevelsQueryDto,
  ) {
    return this.positionsService.listLevels(user, query);
  }

  @Get('levels/:id')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Get a position level.' })
  @ApiOkResponse({ description: 'Position level returned.' })
  async getLevel(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') levelId: string) {
    return this.positionsService.getLevel(user, levelId);
  }

  @Patch('levels/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Update a position level.' })
  @ApiOkResponse({ description: 'Position level updated.' })
  async updateLevel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') levelId: string,
    @Body() dto: UpdatePositionLevelDto,
  ) {
    return this.positionsService.updateLevel(user, levelId, dto);
  }

  @Delete('levels/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Soft-delete an unused position level.' })
  @ApiOkResponse({ description: 'Position level deleted.' })
  async deleteLevel(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') levelId: string) {
    return this.positionsService.deleteLevel(user, levelId);
  }

  @Post('skills')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Create or update a tenant skill catalog item.' })
  @ApiOkResponse({ description: 'Skill catalog item upserted.' })
  async createSkill(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateSkillDto) {
    return this.positionsService.createSkill(user, dto);
  }

  @Get('skills')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'List tenant and global skill catalog items.' })
  @ApiOkResponse({ description: 'Skill catalog returned.' })
  async listSkills(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListSkillsQueryDto,
  ) {
    return this.positionsService.listSkills(user, query);
  }

  @Get('skills/:id')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Get a skill catalog item.' })
  @ApiOkResponse({ description: 'Skill returned.' })
  async getSkill(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') skillId: string) {
    return this.positionsService.getSkill(user, skillId);
  }

  @Patch('skills/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Update a tenant-owned skill catalog item.' })
  @ApiOkResponse({ description: 'Skill updated.' })
  async updateSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.positionsService.updateSkill(user, skillId, dto);
  }

  @Delete('skills/:id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Delete an unused tenant-owned skill catalog item.' })
  @ApiOkResponse({ description: 'Skill deleted.' })
  async deleteSkill(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') skillId: string) {
    return this.positionsService.deleteSkill(user, skillId);
  }

  @Get('summary')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Return position control and vacancy metrics.' })
  @ApiOkResponse({ description: 'Position summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.positionsService.getSummary(user);
  }

  @Get('tree')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Return the position hierarchy tree.' })
  @ApiOkResponse({ description: 'Position hierarchy returned.' })
  async tree(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.positionsService.getPositionHierarchy(user);
  }

  @Post()
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Create a workforce position.' })
  @ApiOkResponse({ description: 'Position created.' })
  async createPosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreatePositionDto,
  ) {
    return this.positionsService.createPosition(user, dto);
  }

  @Get()
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'List workforce positions with capacity metrics.' })
  @ApiOkResponse({ description: 'Positions returned.' })
  async listPositions(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListPositionsQueryDto,
  ) {
    return this.positionsService.listPositions(user, query);
  }

  @Get(':id')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'Get a workforce position.' })
  @ApiOkResponse({ description: 'Position returned.' })
  async getPosition(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') positionId: string) {
    return this.positionsService.getPosition(user, positionId);
  }

  @Patch(':id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Update a workforce position.' })
  @ApiOkResponse({ description: 'Position updated.' })
  async updatePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.positionsService.updatePosition(user, positionId, dto);
  }

  @Delete(':id')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Archive an unused workforce position.' })
  @ApiOkResponse({ description: 'Position archived.' })
  async deletePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
  ) {
    return this.positionsService.deletePosition(user, positionId);
  }

  @Post(':id/activate')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Activate a workforce position.' })
  @ApiOkResponse({ description: 'Position activated.' })
  async activatePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: PositionStatusTransitionDto,
  ) {
    return this.positionsService.activatePosition(user, positionId, dto);
  }

  @Post(':id/freeze')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Freeze a workforce position to prevent new assignments.' })
  @ApiOkResponse({ description: 'Position frozen.' })
  async freezePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: PositionStatusTransitionDto,
  ) {
    return this.positionsService.freezePosition(user, positionId, dto);
  }

  @Post(':id/close')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Close a position that no longer has open assignments or child positions.' })
  @ApiOkResponse({ description: 'Position closed.' })
  async closePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: PositionStatusTransitionDto,
  ) {
    return this.positionsService.closePosition(user, positionId, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Archive a position that no longer has open assignments or child positions.' })
  @ApiOkResponse({ description: 'Position archived.' })
  async archivePosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: PositionStatusTransitionDto,
  ) {
    return this.positionsService.archivePosition(user, positionId, dto);
  }

  @Post(':id/reopen')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Reopen an archived or closed position back to draft.' })
  @ApiOkResponse({ description: 'Position reopened.' })
  async reopenPosition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: PositionStatusTransitionDto,
  ) {
    return this.positionsService.reopenPosition(user, positionId, dto);
  }

  @Get(':id/occupants')
  @RequirePermissions('positions.read')
  @ApiOperation({ summary: 'List current or as-of-date occupants for a position.' })
  @ApiOkResponse({ description: 'Position occupants returned.' })
  async occupants(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Query() query: PositionOccupantsQueryDto,
  ) {
    return this.positionsService.getPositionOccupants(user, positionId, query);
  }

  @Post(':id/skills')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Add or update a required skill for a position.' })
  @ApiOkResponse({ description: 'Position skill upserted.' })
  async addPositionSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Body() dto: CreatePositionSkillDto,
  ) {
    return this.positionsService.addPositionSkill(user, positionId, dto);
  }

  @Patch(':id/skills/:positionSkillId')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Update a position skill requirement.' })
  @ApiOkResponse({ description: 'Position skill updated.' })
  async updatePositionSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Param('positionSkillId') positionSkillId: string,
    @Body() dto: UpdatePositionSkillDto,
  ) {
    return this.positionsService.updatePositionSkill(user, positionId, positionSkillId, dto);
  }

  @Delete(':id/skills/:positionSkillId')
  @RequirePermissions('positions.write')
  @ApiOperation({ summary: 'Remove a skill requirement from a position.' })
  @ApiOkResponse({ description: 'Position skill removed.' })
  async deletePositionSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') positionId: string,
    @Param('positionSkillId') positionSkillId: string,
  ) {
    return this.positionsService.deletePositionSkill(user, positionId, positionSkillId);
  }
}
