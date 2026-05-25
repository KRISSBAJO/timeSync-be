import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateTenantDto } from './create-tenant.dto';

class UpdateTenantBaseDto extends OmitType(CreateTenantDto, [
  'adminEmail',
  'adminPassword',
] as const) {}

export class UpdateTenantDto extends PartialType(UpdateTenantBaseDto) {}
