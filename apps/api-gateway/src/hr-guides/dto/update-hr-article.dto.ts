import { PartialType } from '@nestjs/swagger';

import { CreateHrArticleDto } from './create-hr-article.dto';

export class UpdateHrArticleDto extends PartialType(CreateHrArticleDto) {}
