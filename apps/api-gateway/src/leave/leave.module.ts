import { Module } from '@nestjs/common';

import { WorkflowsModule } from '../workflows/workflows.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
