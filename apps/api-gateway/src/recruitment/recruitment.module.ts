import { Module } from '@nestjs/common';

import { WorkflowsModule } from '../workflows/workflows.module';
import { CareersController } from './careers.controller';
import { HiringMarketplaceController } from './hiring-marketplace.controller';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [RecruitmentController, CareersController, HiringMarketplaceController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
