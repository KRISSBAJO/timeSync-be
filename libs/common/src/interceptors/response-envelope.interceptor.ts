import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';

import type { ApiEnvelope } from '../types/api-envelope';

@Injectable()
export class ResponseEnvelopeInterceptor<TData>
  implements NestInterceptor<TData, ApiEnvelope<TData | null>>
{
  intercept(context: ExecutionContext, next: CallHandler<TData>): Observable<ApiEnvelope<TData | null>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        if (this.isAlreadyEnveloped(data)) {
          return data;
        }

        return {
          data: data ?? null,
          meta: {
            requestId: request.header('x-request-id'),
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }

  private isAlreadyEnveloped(data: unknown): data is ApiEnvelope<TData> {
    return Boolean(data && typeof data === 'object' && 'data' in data && 'meta' in data);
  }
}
