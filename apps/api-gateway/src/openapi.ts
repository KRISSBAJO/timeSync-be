import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TimeSync HR API')
    .setDescription('Enterprise multi-tenant WorkforceOS / HR platform API')
    .setVersion('0.1.0')
    .addCookieAuth('access_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    }, 'access_token')
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
    }, 'refresh_token')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Required for state-changing browser requests once auth is enabled.',
      },
      'csrf-token',
    )
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}
