import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ApiErrorEnvelope } from '../types/api-envelope';

interface HttpExceptionResponseShape {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const normalized =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as HttpExceptionResponseShape)
        : undefined;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : normalized?.message ?? 'Internal server error';

    const errorBody: ApiErrorEnvelope = {
      error: {
        statusCode,
        code:
          normalized?.code ??
          normalized?.error?.toUpperCase().replaceAll(' ', '_') ??
          HttpStatus[statusCode] ??
          'INTERNAL_SERVER_ERROR',
        message,
        details: normalized?.details ?? this.getDevelopmentErrorDetails(exception, statusCode),
      },
      meta: {
        requestId: request.header('x-request-id'),
        timestamp: new Date().toISOString(),
      },
    };

    if (statusCode >= 500) {
      const requestLogger = (request as Request & {
        log?: {
          error: (payload: Record<string, unknown>, message?: string) => void;
        };
      }).log;
      const logPayload = {
        err: exception,
        requestId: request.header('x-request-id'),
        method: request.method,
        path: request.originalUrl ?? request.url,
      };

      if (requestLogger) {
        requestLogger.error(logPayload, 'Unhandled request exception');
      } else {
        this.logger.error(
          `${this.getExceptionMessage(exception)} ${JSON.stringify({
            requestId: logPayload.requestId,
            method: logPayload.method,
            path: logPayload.path,
          })}`,
          this.getExceptionStack(exception),
        );
      }
    }

    response.status(statusCode).json(errorBody);
  }

  private getExceptionMessage(exception: unknown): string {
    return exception instanceof Error ? exception.message : String(exception);
  }

  private getExceptionStack(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }

  private getDevelopmentErrorDetails(exception: unknown, statusCode: number) {
    if (statusCode < 500 || process.env.NODE_ENV === 'production') {
      return undefined;
    }

    if (exception instanceof Error) {
      return {
        name: exception.name,
        message: exception.message,
      };
    }

    return {
      name: 'UnknownError',
      message: String(exception),
    };
  }
}
