import { SetMetadata } from '@nestjs/common';

import { REQUIRED_TENANT_FEATURES_KEY } from '../../auth/auth.constants';

export const RequireTenantFeatures = (...features: string[]) =>
  SetMetadata(REQUIRED_TENANT_FEATURES_KEY, features);
