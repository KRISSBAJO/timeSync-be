import { Module } from '@nestjs/common';

import { WorkflowsModule } from '../workflows/workflows.module';
import { CareersController } from './careers.controller';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [RecruitmentController, CareersController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
