#!/usr/bin/env node

require('reflect-metadata');

const { mkdir, writeFile } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');

const { NestFactory } = require('@nestjs/core');

async function main() {
  const appModulePath = '../dist/apps/api-gateway/apps/api-gateway/src/app.module';
  const openApiPath = '../dist/apps/api-gateway/apps/api-gateway/src/openapi';
  let AppModule;
  let createOpenApiDocument;

  try {
    ({ AppModule } = require(appModulePath));
    ({ createOpenApiDocument } = require(openApiPath));
  } catch (error) {
    throw new Error(
      `Compiled API gateway was not found. Run "npm run build" before exporting OpenAPI. Cause: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  const outputPath = resolve(process.cwd(), process.env.OPENAPI_OUTPUT_PATH ?? 'openapi/timesync-hr-api.json');
  const document = createOpenApiDocument(app);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();

  console.log(`OpenAPI document written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
