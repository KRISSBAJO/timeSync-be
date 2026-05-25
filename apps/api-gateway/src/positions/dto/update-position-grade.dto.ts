import { PartialType } from '@nestjs/swagger';

import { CreatePositionGradeDto } from './create-position-grade.dto';

export class UpdatePositionGradeDto extends PartialType(CreatePositionGradeDto) {}
