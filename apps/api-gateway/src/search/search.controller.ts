import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiCookieAuth('access_token')
@Controller('api/v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Search across workforce, positions, documents, organization, and workflows.' })
  @ApiOkResponse({ description: 'Global search results returned.' })
  async search(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: GlobalSearchQueryDto,
  ) {
    return this.searchService.search(user, query);
  }
}
