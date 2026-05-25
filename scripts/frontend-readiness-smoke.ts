import 'dotenv/config';

const baseUrl = trimTrailingSlash(process.env.SMOKE_BASE_URL || 'http://localhost:4040');
const email = process.env.SMOKE_EMAIL || 'admin@acme-health.test';
const password = process.env.SMOKE_PASSWORD || process.env.DEMO_PASSWORD || 'DemoPass123!';
const tenantSlug = process.env.SMOKE_TENANT_SLUG || process.env.DEMO_TENANT_SLUG || 'acme-health';

type CookieJar = Map<string, string>;

type SmokeRequestInit = Omit<RequestInit, 'headers' | 'body'> & {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

type SmokeStep = {
  method: string;
  path: string;
  status: number;
};

const cookieJar: CookieJar = new Map();
const steps: SmokeStep[] = [];

async function main() {
  await smokeFetch('/health/live', { method: 'GET' }, 200);

  const loginResponse = await smokeFetch(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: {
        email,
        password,
        tenantSlug,
        rememberDevice: false,
      },
    },
    200,
  );
  const csrfToken = extractCsrfToken(loginResponse);

  await smokeFetch('/api/v1/auth/me', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/dashboard/overview?period=LAST_30_DAYS', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/dashboard/workforce?period=LAST_30_DAYS', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/employees/summary', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/organization/tree', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/positions/summary', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/approvals/tasks', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/notifications/summary', { method: 'GET' }, 200);
  await smokeFetch('/api/v1/analytics/snapshots/latest?limit=5', { method: 'GET' }, 200);
  await smokeFetch(
    '/api/v1/auth/logout',
    {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfToken,
      },
    },
    200,
  );

  console.log(`Frontend readiness smoke passed against ${baseUrl}.`);
  for (const step of steps) {
    console.log(`${step.status} ${step.method} ${step.path}`);
  }
}

async function smokeFetch(path: string, init: SmokeRequestInit, expectedStatus: number): Promise<unknown> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': `smoke-${Date.now()}-${steps.length}`,
    ...init.headers,
  };

  if (init.body) {
    headers['content-type'] = 'application/json';
  }

  const cookieHeader = serializeCookies(cookieJar);

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: 'manual',
  });

  captureCookies(response.headers, cookieJar);

  const body = await readBody(response);

  if (response.status !== expectedStatus) {
    const message = isRecord(body) && 'error' in body ? JSON.stringify(body.error) : response.statusText;
    throw new Error(`${method} ${path} expected ${expectedStatus}, received ${response.status}: ${message}`);
  }

  steps.push({ method, path, status: response.status });
  return body;
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json() as Promise<unknown>;
}

function extractCsrfToken(body: unknown): string {
  if (isRecord(body)) {
    const data = body.data;

    if (isRecord(data) && typeof data.csrfToken === 'string') {
      return data.csrfToken;
    }
  }

  const token = cookieJar.get('csrf_token');

  if (!token) {
    throw new Error('Login succeeded but no CSRF token was returned.');
  }

  return token;
}

function captureCookies(headers: Headers, jar: CookieJar) {
  for (const setCookie of getSetCookieHeaders(headers)) {
    const [nameValue] = setCookie.split(';');
    const separatorIndex = nameValue.indexOf('=');

    if (separatorIndex < 1) {
      continue;
    }

    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();

    if (value) {
      jar.set(name, value);
    } else {
      jar.delete(name);
    }
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = headersWithSetCookie.getSetCookie?.();

  if (values && values.length > 0) {
    return values;
  }

  const combined = headers.get('set-cookie');

  if (!combined) {
    return [];
  }

  return combined.split(/,(?=\s*[^;,]+=)/).map((cookie) => cookie.trim());
}

function serializeCookies(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
