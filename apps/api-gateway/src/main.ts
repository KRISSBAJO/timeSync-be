import 'reflect-metadata';

import { createHash } from 'node:crypto';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ClassSerializerInterceptor, HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';

import {
  HttpExceptionFilter,
  requestIdMiddleware,
  ResponseEnvelopeInterceptor,
} from '@timesync/common';

import { AppModule } from './app.module';
import { HealthService } from './health/health.service';
import { createOpenApiDocument } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const appEnv = config.get<string>('app.env', 'development');
  const isProduction = appEnv === 'production';

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.set('trust proxy', config.get<boolean>('app.trustProxy', false));

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.get<boolean>('security.hstsEnabled', isProduction)
        ? {
            maxAge: config.get<number>('security.hstsMaxAgeSeconds', 31536000),
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );
  app.use(compression());
  app.use(json({ limit: config.get<string>('app.jsonBodyLimit', '1mb') }));
  app.use(urlencoded({ extended: true, limit: config.get<string>('app.formBodyLimit', '1mb') }));
  app.use(cookieParser());

  const corsOrigins = config.get<string[]>('cors.origins', []);
  app.enableCors({
    origin: resolveCorsOrigin(corsOrigins, appEnv),
    credentials: config.get<boolean>('cors.credentials', true),
    maxAge: config.get<number>('cors.maxAgeSeconds', 600),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(reflector),
    new ResponseEnvelopeInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  if (config.get<boolean>('swagger.enabled', true)) {
    const swaggerPath = normalizeSwaggerPath(config.get<string>('swagger.path', 'docs'));
    const protectSwagger = swaggerBasicAuth(config);
    app.use(`/${swaggerPath}`, protectSwagger);
    app.use(`/${swaggerPath}-json`, protectSwagger);
    app.use(`/${swaggerPath}-yaml`, protectSwagger);

    const document = createOpenApiDocument(app);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  registerUnprefixedHealthRoutes(app.getHttpAdapter().getInstance() as HttpRouteRegistrar, app.get(HealthService));

  const port = config.get<number>('app.port', 4040);
  await app.listen(port);
}

function registerUnprefixedHealthRoutes(
  httpAdapter: HttpRouteRegistrar,
  healthService: HealthService,
) {
  httpAdapter.get('/health/live', (request: Request, response: Response) => {
    response.json(envelope(request, healthService.live()));
  });

  httpAdapter.get('/health/ready', async (request: Request, response: Response) => {
    const result = await healthService.ready();

    if (result.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    response.json(envelope(request, result));
  });

  httpAdapter.get('/health/dependencies', async (request: Request, response: Response) => {
    response.json(envelope(request, await healthService.dependencies()));
  });
}

type HttpRouteRegistrar = {
  get(path: string, handler: (request: Request, response: Response) => void | Promise<void>): void;
};

function envelope<TData>(request: Request, data: TData) {
  return {
    data,
    meta: {
      requestId: request.header('x-request-id'),
      timestamp: new Date().toISOString(),
    },
  };
}

void bootstrap();

function resolveCorsOrigin(origins: string[], appEnv: string) {
  if (origins.includes('*') && appEnv !== 'production' && appEnv !== 'staging') {
    return true;
  }

  if (origins.length === 0) {
    return appEnv === 'production' || appEnv === 'staging' ? false : true;
  }

  const allowlist = new Set(origins);

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowlist.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

function normalizeSwaggerPath(path: string) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '') || 'docs';
}

function swaggerBasicAuth(config: ConfigService) {
  const username = config.get<string | undefined>('swagger.username');
  const password = config.get<string | undefined>('swagger.password');

  return (request: Request, response: Response, next: NextFunction) => {
    if (!username || !password) {
      next();
      return;
    }

    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Basic ')) {
      challengeSwagger(response);
      return;
    }

    const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const incomingUsername = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
    const incomingPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

    if (safeEqual(incomingUsername, username) && safeEqual(incomingPassword, password)) {
      next();
      return;
    }

    challengeSwagger(response);
  };
}

function challengeSwagger(response: Response) {
  response.setHeader('WWW-Authenticate', 'Basic realm="TimeSync HR API Documentation"');
  response.status(HttpStatus.UNAUTHORIZED).json({
    error: {
      statusCode: HttpStatus.UNAUTHORIZED,
      code: 'SWAGGER_AUTHENTICATION_REQUIRED',
      message: 'Swagger authentication is required.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

function safeEqual(left: string, right: string) {
  return createHash('sha256').update(left).digest('hex') === createHash('sha256').update(right).digest('hex');
}
