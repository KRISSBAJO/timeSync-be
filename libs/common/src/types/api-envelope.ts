export interface ApiEnvelope<TData> {
  data: TData;
  meta: {
    requestId?: string;
    timestamp: string;
  };
}

export interface ApiErrorEnvelope {
  error: {
    statusCode: number;
    code: string;
    message: string | string[];
    details?: unknown;
  };
  meta: {
    requestId?: string;
    timestamp: string;
  };
}

