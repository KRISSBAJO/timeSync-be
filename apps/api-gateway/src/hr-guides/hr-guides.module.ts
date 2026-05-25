import { Module } from '@nestjs/common';

import { HrGuidesController } from './hr-guides.controller';
import { HrGuidesService } from './hr-guides.service';

@Module({
  controllers: [HrGuidesController],
  providers: [HrGuidesService],
})
export class HrGuidesModule {}
