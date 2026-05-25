import { PartialType } from '@nestjs/swagger';

import { CreatePersonEducationDto } from './create-person-education.dto';

export class UpdatePersonEducationDto extends PartialType(CreatePersonEducationDto) {}

