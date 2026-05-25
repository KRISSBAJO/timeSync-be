import { PartialType } from '@nestjs/swagger';

import { CreateOrganizationNodeDto } from './create-organization-node.dto';

export class UpdateOrganizationNodeDto extends PartialType(CreateOrganizationNodeDto) {}

