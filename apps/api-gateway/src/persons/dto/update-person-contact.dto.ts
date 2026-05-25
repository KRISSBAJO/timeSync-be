import { PartialType } from '@nestjs/swagger';

import { CreatePersonContactDto } from './create-person-contact.dto';

export class UpdatePersonContactDto extends PartialType(CreatePersonContactDto) {}

