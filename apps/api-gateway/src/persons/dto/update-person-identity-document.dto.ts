import { PartialType } from '@nestjs/swagger';

import { CreatePersonIdentityDocumentDto } from './create-person-identity-document.dto';

export class UpdatePersonIdentityDocumentDto extends PartialType(CreatePersonIdentityDocumentDto) {}

