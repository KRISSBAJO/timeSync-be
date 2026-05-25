import { Module } from '@nestjs/common';

import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  controllers: [WorkflowsController, ApprovalsController],
  providers: [WorkflowsService, ApprovalsService],
  exports: [WorkflowsService, ApprovalsService],
})
export class WorkflowsModule {}
