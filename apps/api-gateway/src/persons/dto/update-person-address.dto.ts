import { PartialType } from '@nestjs/swagger';

import { CreatePersonAddressDto } from './create-person-address.dto';

export class UpdatePersonAddressDto extends PartialType(CreatePersonAddressDto) {}

