import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from './auth/decorators/public.decorator';

@ApiTags('system')
@Public()
@Controller('api/v1')
export class AppController {
  @Get()
  @ApiOkResponse({
    description: 'API root metadata.',
    schema: {
      example: {
        name: 'TimeSync HR API',
        version: '0.1.0',
        status: 'ready',
      },
    },
  })
  getRoot() {
    return {
      name: 'TimeSync HR API',
      version: '0.1.0',
      status: 'ready',
    };
  }
}
