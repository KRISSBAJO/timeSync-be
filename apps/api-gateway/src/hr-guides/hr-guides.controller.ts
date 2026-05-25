import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateHrArticleDto } from './dto/create-hr-article.dto';
import { CreateHrArticleCommentDto } from './dto/create-hr-article-comment.dto';
import { HrArticleReactionDto } from './dto/hr-article-reaction.dto';
import { ListHrArticlesQueryDto } from './dto/list-hr-articles-query.dto';
import { UpdateHrArticleDto } from './dto/update-hr-article.dto';
import { UpdateHrArticleStatusDto } from './dto/update-hr-article-status.dto';
import { HrGuidesService } from './hr-guides.service';

@ApiTags('hr guides')
@Controller('api/v1')
export class HrGuidesController {
  constructor(private readonly hrGuidesService: HrGuidesService) {}

  @Public()
  @Get('hr-guides/categories')
  @ApiOperation({ summary: 'List public HR guide categories.' })
  @ApiOkResponse({ description: 'HR guide categories returned.' })
  async listCategories() {
    return this.hrGuidesService.listCategories();
  }

  @Public()
  @Get('hr-guides')
  @ApiOperation({ summary: 'List published HR guide articles.' })
  @ApiOkResponse({ description: 'Published HR guides returned.' })
  async listPublishedArticles(@Query() query: ListHrArticlesQueryDto) {
    return this.hrGuidesService.listPublishedArticles(query);
  }

  @Public()
  @Get('hr-guides/:slug')
  @ApiOperation({ summary: 'Get a published HR guide article and record a read.' })
  @ApiOkResponse({ description: 'Published HR guide returned.' })
  async getPublishedArticle(@Param('slug') slug: string, @Req() request: Request) {
    return this.hrGuidesService.getPublishedArticle(slug, request);
  }

  @Public()
  @Post('hr-guides/:slug/comments')
  @ApiOperation({ summary: 'Create a public HR guide comment.' })
  @ApiCreatedResponse({ description: 'Comment captured.' })
  async createPublicComment(
    @Param('slug') slug: string,
    @Body() dto: CreateHrArticleCommentDto,
    @Req() request: Request,
  ) {
    return this.hrGuidesService.createPublicComment(slug, dto, request);
  }

  @Public()
  @Post('hr-guides/:slug/reactions')
  @ApiOperation({ summary: 'Toggle a public HR guide reaction.' })
  @ApiOkResponse({ description: 'Reaction state returned.' })
  async togglePublicReaction(
    @Param('slug') slug: string,
    @Body() dto: HrArticleReactionDto,
    @Req() request: Request,
  ) {
    return this.hrGuidesService.togglePublicReaction(slug, dto, request);
  }

  @Get('platform/hr-guides')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.read')
  @ApiOperation({ summary: 'List HR guide articles for content administration.' })
  @ApiOkResponse({ description: 'HR guide articles returned.' })
  async listPlatformArticles(@Query() query: ListHrArticlesQueryDto) {
    return this.hrGuidesService.listPlatformArticles(query);
  }

  @Post('platform/hr-guides')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.write')
  @ApiOperation({ summary: 'Create an HR guide article.' })
  @ApiCreatedResponse({ description: 'HR guide article created.' })
  async createPlatformArticle(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateHrArticleDto,
  ) {
    return this.hrGuidesService.createPlatformArticle(user, dto);
  }

  @Get('platform/hr-guides/:id')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.read')
  @ApiOperation({ summary: 'Get an HR guide article for content administration.' })
  @ApiOkResponse({ description: 'HR guide article returned.' })
  async getPlatformArticle(@Param('id') id: string) {
    return this.hrGuidesService.getPlatformArticle(id);
  }

  @Patch('platform/hr-guides/:id')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.write')
  @ApiOperation({ summary: 'Update an HR guide article.' })
  @ApiOkResponse({ description: 'HR guide article updated.' })
  async updatePlatformArticle(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateHrArticleDto,
  ) {
    return this.hrGuidesService.updatePlatformArticle(user, id, dto);
  }

  @Patch('platform/hr-guides/:id/status')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.publish')
  @ApiOperation({ summary: 'Update HR guide article publishing status.' })
  @ApiOkResponse({ description: 'HR guide article status updated.' })
  async updatePlatformArticleStatus(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateHrArticleStatusDto,
  ) {
    return this.hrGuidesService.updatePlatformArticleStatus(user, id, dto);
  }

  @Delete('platform/hr-guides/:id')
  @ApiCookieAuth('access_token')
  @RequirePermissions('content.publish')
  @ApiOperation({ summary: 'Archive and delete an HR guide article.' })
  @ApiOkResponse({ description: 'HR guide article archived.' })
  async deletePlatformArticle(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.hrGuidesService.deletePlatformArticle(user, id);
  }
}
