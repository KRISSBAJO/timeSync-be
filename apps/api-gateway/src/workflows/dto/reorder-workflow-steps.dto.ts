import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderWorkflowStepsDto {
  @ApiProperty({
    example: [
      'fbe772b8-6fd8-4192-a168-20bdf45f0081',
      'e4dd9e92-7bb0-4db8-a8f5-fac22f8d9b13',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  stepIds!: string[];
}
