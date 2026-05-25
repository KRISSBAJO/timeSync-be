import 'dotenv/config';

const apiBaseUrl = trimTrailingSlash(process.env.ATTENDANCE_LEAVE_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:4040');
const frontendBaseUrl = process.env.ATTENDANCE_LEAVE_SMOKE_FRONTEND_URL || process.env.SMOKE_FRONTEND_BASE_URL;
const tenantSlug = process.env.SMOKE_TENANT_SLUG || process.env.DEMO_TENANT_SLUG || 'acme-health';
const adminEmail = process.env.ATTENDANCE_LEAVE_SMOKE_ADMIN_EMAIL || process.env.SMOKE_EMAIL || 'admin@acme-health.test';
const employeeEmail = process.env.ATTENDANCE_LEAVE_SMOKE_EMPLOYEE_EMAIL || 'employee@acme-health.test';
const password = process.env.ATTENDANCE_LEAVE_SMOKE_PASSWORD || process.env.SMOKE_PASSWORD || process.env.DEMO_PASSWORD || 'DemoPass123!';
const timeoutMs = Number(process.env.ATTENDANCE_LEAVE_SMOKE_TIMEOUT_MS || process.env.SMOKE_TIMEOUT_MS || 10000);

type CookieJar = Map<string, string>;

type SmokeRequestInit = Omit<RequestInit, 'headers' | 'body'> & {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

type SmokeSession = {
  label: string;
  cookieJar: CookieJar;
  csrfToken?: string;
};

type SmokeStep = {
  actor: string;
  method: string;
  path: string;
  status: number;
  summary: string;
};

type SmokeEndpoint = {
  path: string;
  summary: string;
  validate?: (body: unknown) => void;
};

const steps: SmokeStep[] = [];

const adminAttendanceEndpoints: SmokeEndpoint[] = [
  objectEndpoint('/api/v1/attendance/summary', 'attendance summary'),
  objectEndpoint('/api/v1/attendance/my?limit=30', 'my attendance workspace'),
  paginatedEndpoint('/api/v1/attendance/records?limit=50', 'attendance records'),
  paginatedEndpoint('/api/v1/attendance/correction-requests?limit=50', 'correction requests'),
  paginatedEndpoint('/api/v1/attendance/exceptions?limit=50', 'attendance exceptions'),
  paginatedEndpoint('/api/v1/attendance/timesheets?limit=50', 'attendance timesheets'),
  objectEndpoint(`/api/v1/attendance/supervisor-board?date=${todayInput()}`, 'supervisor daily board'),
  objectEndpoint('/api/v1/attendance/reports/advanced?limit=50', 'advanced attendance report'),
  objectEndpoint('/api/v1/attendance/alerts/predictive?limit=50', 'predictive attendance alerts'),
  paginatedEndpoint('/api/v1/attendance/payroll/exports?limit=50', 'payroll exports'),
  paginatedEndpoint('/api/v1/attendance/geofences?limit=50', 'geofence controls'),
  paginatedEndpoint('/api/v1/attendance/devices?limit=50', 'clock devices'),
  paginatedEndpoint('/api/v1/attendance/kiosk-credentials?limit=50', 'kiosk credentials'),
  paginatedEndpoint('/api/v1/attendance/holidays?limit=50', 'attendance holidays'),
  paginatedEndpoint('/api/v1/attendance/premium-rules?limit=50', 'premium rules'),
  arrayEndpoint('/api/v1/attendance/policies', 'attendance policies'),
];

const employeeAttendanceEndpoints: SmokeEndpoint[] = [
  objectEndpoint('/api/v1/attendance/summary', 'employee attendance summary'),
  objectEndpoint('/api/v1/attendance/my?limit=30', 'employee attendance workspace'),
  paginatedEndpoint('/api/v1/attendance/records?limit=50', 'employee attendance records'),
  paginatedEndpoint('/api/v1/attendance/correction-requests?limit=50', 'employee correction requests'),
  paginatedEndpoint('/api/v1/attendance/exceptions?limit=50', 'employee attendance exceptions'),
  paginatedEndpoint('/api/v1/attendance/timesheets?limit=50', 'employee timesheets'),
];

const adminLeaveEndpoints: SmokeEndpoint[] = [
  objectEndpoint('/api/v1/leave/summary', 'leave summary'),
  objectEndpoint('/api/v1/leave/my?limit=30', 'my leave workspace'),
  paginatedEndpoint('/api/v1/leave/requests?limit=50', 'leave requests'),
  paginatedEndpoint('/api/v1/leave/balances?limit=50', 'leave balances'),
  arrayEndpoint('/api/v1/leave/types', 'leave types'),
  arrayEndpoint('/api/v1/leave/policies', 'leave policies'),
  objectEndpoint('/api/v1/leave/calendar?limit=50', 'leave calendar view'),
  objectEndpoint('/api/v1/leave/reports?limit=50', 'leave reports'),
  arrayEndpoint('/api/v1/leave/calendars', 'leave calendars'),
  arrayEndpoint('/api/v1/leave/calendar-days?limit=50', 'leave calendar days'),
  arrayEndpoint('/api/v1/leave/blackout-windows?limit=50', 'blackout windows'),
  arrayEndpoint('/api/v1/leave/approval-rules', 'leave workflow adoption rules'),
];

const employeeLeaveEndpoints: SmokeEndpoint[] = [
  objectEndpoint('/api/v1/leave/summary', 'employee leave summary'),
  objectEndpoint('/api/v1/leave/my?limit=30', 'employee leave workspace'),
  paginatedEndpoint('/api/v1/leave/requests?limit=50', 'employee leave requests'),
  paginatedEndpoint('/api/v1/leave/balances?limit=50', 'employee leave balances'),
  arrayEndpoint('/api/v1/leave/types', 'employee leave types'),
  arrayEndpoint('/api/v1/leave/policies', 'employee leave policies'),
  objectEndpoint('/api/v1/leave/calendar?limit=50', 'employee leave calendar view'),
  arrayEndpoint('/api/v1/leave/calendars', 'employee leave calendars'),
  arrayEndpoint('/api/v1/leave/calendar-days?limit=50', 'employee leave calendar days'),
  arrayEndpoint('/api/v1/leave/blackout-windows?limit=50', 'employee blackout windows'),
];

const frontendPages = [
  '/attendance',
  '/attendance?tab=corrections',
  '/attendance?tab=timesheets',
  '/leave',
  '/leave?tab=approvals',
];

async function main() {
  await smokeFetch({ label: 'public', cookieJar: new Map() }, '/health/live', { method: 'GET' }, 200, 'health live');

  const admin = await login('tenant-admin', adminEmail);
  await smokeFetch(admin, '/api/v1/auth/me', { method: 'GET' }, 200, 'admin auth context', expectObject);
  await runEndpoints(admin, [...adminAttendanceEndpoints, ...adminLeaveEndpoints]);

  const employee = await login('employee', employeeEmail);
  await smokeFetch(employee, '/api/v1/auth/me', { method: 'GET' }, 200, 'employee auth context', expectObject);
  await runEndpoints(employee, [...employeeAttendanceEndpoints, ...employeeLeaveEndpoints]);

  if (frontendBaseUrl) {
    await runFrontendPages();
  }

  await logout(admin);
  await logout(employee);

  console.log(`Attendance + Leave smoke passed against ${apiBaseUrl}.`);
  if (frontendBaseUrl) {
    console.log(`Frontend page smoke passed against ${trimTrailingSlash(frontendBaseUrl)}.`);
  }
  console.table(steps);
}

async function login(label: string, email: string): Promise<SmokeSession> {
  const session: SmokeSession = { label, cookieJar: new Map() };
  const response = await smokeFetch(
    session,
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
    `${label} login`,
    expectObject,
  );
  session.csrfToken = extractCsrfToken(response, session.cookieJar);
  return session;
}

async function logout(session: SmokeSession) {
  if (!session.csrfToken) {
    return;
  }

  await smokeFetch(
    session,
    '/api/v1/auth/logout',
    {
      method: 'POST',
      headers: {
        'x-csrf-token': session.csrfToken,
      },
    },
    200,
    `${session.label} logout`,
  );
}

async function runEndpoints(session: SmokeSession, endpoints: SmokeEndpoint[]) {
  for (const endpoint of endpoints) {
    await smokeFetch(session, endpoint.path, { method: 'GET' }, 200, endpoint.summary, endpoint.validate);
  }
}

async function runFrontendPages() {
  const baseUrl = trimTrailingSlash(frontendBaseUrl ?? '');

  for (const page of frontendPages) {
    const response = await fetchWithTimeout(`${baseUrl}${page}`, {
      method: 'GET',
      headers: {
        accept: 'text/html',
        'x-request-id': `attendance-leave-page-smoke-${Date.now()}-${steps.length}`,
      },
      redirect: 'manual',
    });

    if (![200, 302, 307, 308].includes(response.status)) {
      const body = await response.text();
      throw new Error(`GET ${page} expected page/redirect, received ${response.status}: ${body.slice(0, 240)}`);
    }

    steps.push({
      actor: 'frontend',
      method: 'GET',
      path: page,
      status: response.status,
      summary: response.status === 200 ? 'page rendered' : 'redirected',
    });
  }
}

async function smokeFetch(
  session: SmokeSession,
  path: string,
  init: SmokeRequestInit,
  expectedStatus: number,
  summary: string,
  validate?: (body: unknown) => void,
): Promise<unknown> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': `attendance-leave-smoke-${Date.now()}-${steps.length}`,
    ...init.headers,
  };

  if (init.body) {
    headers['content-type'] = 'application/json';
  }

  const cookieHeader = serializeCookies(session.cookieJar);
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    ...init,
    method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: 'manual',
  });

  captureCookies(response.headers, session.cookieJar);
  const body = await readBody(response);

  if (response.status !== expectedStatus) {
    const message = errorMessage(body, response);
    throw new Error(`${method} ${path} expected ${expectedStatus}, received ${response.status}: ${message}`);
  }

  try {
    validate?.(body);
  } catch (error) {
    throw new Error(`${method} ${path} returned ${response.status} but failed smoke validation: ${errorMessageFromUnknown(error)} Body shape: ${describeBodyShape(body)}`);
  }

  steps.push({
    actor: session.label,
    method,
    path,
    status: response.status,
    summary,
  });

  return body;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`Could not reach ${url}. Start or point to an existing API with ATTENDANCE_LEAVE_SMOKE_BASE_URL. ${errorMessageFromUnknown(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json() as Promise<unknown>;
}

function extractCsrfToken(body: unknown, cookieJar: CookieJar): string {
  const payload = unwrapData(body);

  if (isRecord(payload) && typeof payload.csrfToken === 'string') {
    return payload.csrfToken;
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

function objectEndpoint(path: string, summary: string): SmokeEndpoint {
  return { path, summary, validate: expectObject };
}

function arrayEndpoint(path: string, summary: string): SmokeEndpoint {
  return { path, summary, validate: expectArray };
}

function paginatedEndpoint(path: string, summary: string): SmokeEndpoint {
  return { path, summary, validate: expectPaginated };
}

function expectObject(body: unknown) {
  if (!isRecord(unwrapData(body))) {
    throw new Error('Expected an object response body.');
  }
}

function expectArray(body: unknown) {
  if (!Array.isArray(unwrapData(body))) {
    throw new Error('Expected an array response body.');
  }
}

function expectPaginated(body: unknown) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Expected a paginated response with a data array.');
  }
}

function describeBodyShape(body: unknown) {
  const payload = unwrapData(body);

  if (Array.isArray(payload)) {
    return `array(length=${payload.length})`;
  }

  if (!isRecord(payload)) {
    return typeof payload;
  }

  const keys = Object.keys(payload).slice(0, 8);
  const keyedTypes = keys.map((key) => `${key}:${Array.isArray(payload[key]) ? 'array' : typeof payload[key]}`);
  return `{${keyedTypes.join(', ')}}`;
}

function unwrapData(body: unknown): unknown {
  if (isRecord(body) && 'data' in body) {
    return body.data;
  }

  return body;
}

function errorMessage(body: unknown, response: Response): string {
  if (typeof body === 'string' && body.trim()) {
    return body.slice(0, 240);
  }

  if (isRecord(body)) {
    if (typeof body.message === 'string') {
      return body.message;
    }

    if ('error' in body) {
      return JSON.stringify(body.error);
    }
  }

  return response.statusText || 'Unexpected response';
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown fetch error.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
