import { PartialType } from '@nestjs/swagger';

import { CreatePersonExperienceDto } from './create-person-experience.dto';

export class UpdatePersonExperienceDto extends PartialType(CreatePersonExperienceDto) {}

