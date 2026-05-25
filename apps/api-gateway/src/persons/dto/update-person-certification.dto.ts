import { PartialType } from '@nestjs/swagger';

import { CreatePersonCertificationDto } from './create-person-certification.dto';

export class UpdatePersonCertificationDto extends PartialType(CreatePersonCertificationDto) {}

