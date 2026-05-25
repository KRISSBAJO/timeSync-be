require('dotenv/config');

const apiBaseUrl = trimTrailingSlash(process.env.RECRUITMENT_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:4040');
const frontendBaseUrl = process.env.RECRUITMENT_SMOKE_FRONTEND_URL || process.env.SMOKE_FRONTEND_BASE_URL;
const tenantSlug = process.env.SMOKE_TENANT_SLUG || process.env.DEMO_TENANT_SLUG || 'acme-health';
const adminEmail = process.env.RECRUITMENT_SMOKE_ADMIN_EMAIL || process.env.SMOKE_EMAIL || 'admin@acme-health.test';
const managerEmail = process.env.RECRUITMENT_SMOKE_MANAGER_EMAIL || 'manager@acme-health.test';
const employeeEmail = process.env.RECRUITMENT_SMOKE_EMPLOYEE_EMAIL || 'employee@acme-health.test';
const password = process.env.RECRUITMENT_SMOKE_PASSWORD || process.env.SMOKE_PASSWORD || process.env.DEMO_PASSWORD || 'DemoPass123!';
const timeoutMs = Number(process.env.RECRUITMENT_SMOKE_TIMEOUT_MS || process.env.SMOKE_TIMEOUT_MS || 10000);

const steps = [];
const publicJobSlug = process.env.RECRUITMENT_SMOKE_PUBLIC_JOB_SLUG || 'care-specialist-req-care-spec-2026';

const adminRecruitmentEndpoints = [
  objectEndpoint('/api/v1/recruitment/summary', 'recruitment summary'),
  paginatedEndpoint('/api/v1/recruitment/requisitions?limit=50', 'requisitions'),
  paginatedEndpoint('/api/v1/recruitment/candidates?limit=50', 'candidates'),
  paginatedEndpoint('/api/v1/recruitment/applications?limit=50', 'applications'),
  paginatedEndpoint('/api/v1/recruitment/interviews?limit=50', 'interviews'),
  paginatedEndpoint('/api/v1/recruitment/offers?limit=50', 'offers'),
  arrayEndpoint('/api/v1/recruitment/approval-rules', 'workflow adoption rules'),
  objectEndpoint('/api/v1/recruitment/reports?limit=50', 'recruitment reports'),
];

const managerRecruitmentEndpoints = [
  objectEndpoint('/api/v1/recruitment/summary', 'manager recruitment summary'),
  paginatedEndpoint('/api/v1/recruitment/requisitions?limit=50', 'manager requisitions'),
  paginatedEndpoint('/api/v1/recruitment/candidates?limit=50', 'manager candidates'),
  paginatedEndpoint('/api/v1/recruitment/applications?limit=50', 'manager applications'),
  paginatedEndpoint('/api/v1/recruitment/interviews?limit=50', 'manager interviews'),
  paginatedEndpoint('/api/v1/recruitment/offers?limit=50', 'manager offers'),
];

const employeeForbiddenEndpoints = [
  '/api/v1/recruitment/summary',
  '/api/v1/recruitment/requisitions?limit=50',
];

const frontendPages = [
  '/hire',
  `/careers/${tenantSlug}`,
  `/careers/${tenantSlug}/jobs/${publicJobSlug}`,
  '/recruitment',
  '/recruitment?tab=requisitions',
  '/recruitment?tab=candidates',
  '/recruitment?tab=pipeline',
  '/recruitment?tab=interviews',
  '/recruitment?tab=offers',
];

async function main() {
  const publicSession = { label: 'public', cookieJar: new Map() };
  await smokeFetch(publicSession, '/health/live', { method: 'GET' }, 200, 'health live');
  await runPublicCareersSmoke(publicSession);

  const admin = await login('tenant-admin', adminEmail);
  await smokeFetch(admin, '/api/v1/auth/me', { method: 'GET' }, 200, 'admin auth context', expectObject);
  await runEndpoints(admin, adminRecruitmentEndpoints);
  await runDetailEndpoints(admin);

  const manager = await login('manager', managerEmail);
  await smokeFetch(manager, '/api/v1/auth/me', { method: 'GET' }, 200, 'manager auth context', expectObject);
  await runEndpoints(manager, managerRecruitmentEndpoints);

  const employee = await login('employee', employeeEmail);
  await smokeFetch(employee, '/api/v1/auth/me', { method: 'GET' }, 200, 'employee auth context', expectObject);
  await runForbiddenEndpoints(employee, employeeForbiddenEndpoints);

  if (frontendBaseUrl) {
    await runFrontendPages();
  }

  await logout(admin);
  await logout(manager);
  await logout(employee);

  console.log(`Recruitment smoke passed against ${apiBaseUrl}.`);
  if (frontendBaseUrl) {
    console.log(`Recruitment frontend page smoke passed against ${trimTrailingSlash(frontendBaseUrl)}.`);
  }
  console.table(steps);
}

async function runPublicCareersSmoke(session) {
  await smokeFetch(
    session,
    '/api/v1/hiring',
    { method: 'GET' },
    200,
    'public hiring marketplace',
    expectHiringMarketplace,
  );
  await smokeFetch(
    session,
    `/api/v1/careers/${tenantSlug}`,
    { method: 'GET' },
    200,
    'public careers board',
    expectCareersBoard,
  );
  await smokeFetch(
    session,
    `/api/v1/careers/${tenantSlug}/jobs/${publicJobSlug}`,
    { method: 'GET' },
    200,
    'public job detail',
    expectPublicJobDetail,
  );
  await smokeFetch(
    session,
    `/api/v1/careers/${tenantSlug}/jobs/${publicJobSlug}/apply`,
    {
      method: 'POST',
      body: {
        firstName: 'Smoke',
        lastName: 'Applicant',
        email: `smoke.public.${Date.now()}@example.test`,
        phone: '+1-312-555-0199',
        currentEmployer: 'Smoke Test Clinic',
        currentTitle: 'Care Coordinator',
        locationName: 'Chicago, IL',
        resumeUrl: 'https://example.test/smoke-resume.pdf',
        source: 'Smoke test',
        availabilityNote: 'Available for validation immediately.',
        consentAccepted: true,
        answers: {
          healthcare_experience: 'Smoke validation candidate.',
          hybrid_availability: 'yes',
        },
      },
    },
    200,
    'public application intake',
    expectPublicApplicationReceipt,
  );
  await smokeFetch(
    session,
    '/api/v1/hiring/talent-profiles',
    {
      method: 'POST',
      body: {
        firstName: 'Marketplace',
        lastName: 'Talent',
        email: `marketplace.talent.${Date.now()}@example.test`,
        phone: '+1-312-555-0188',
        desiredTitle: 'Care Coordinator',
        currentTitle: 'Patient Services Associate',
        currentEmployer: 'Smoke Test Clinic',
        locationName: 'Chicago, IL',
        workModes: ['HYBRID', 'ONSITE'],
        employmentTypes: ['FULL_TIME'],
        skills: ['care coordination', 'scheduling', 'EHR'],
        resumeUrl: 'https://example.test/marketplace-resume.pdf',
        portfolioUrl: 'https://example.test/marketplace-profile',
        availabilityNote: 'Available for smoke validation.',
        preferredTenantSlug: tenantSlug,
        consentAccepted: true,
      },
    },
    200,
    'public talent profile intake',
    expectPublicTalentProfileReceipt,
  );
}

async function login(label, email) {
  const session = { label, cookieJar: new Map() };
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

async function logout(session) {
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

async function runEndpoints(session, endpoints) {
  for (const endpoint of endpoints) {
    await smokeFetch(session, endpoint.path, { method: 'GET' }, 200, endpoint.summary, endpoint.validate);
  }
}

async function runDetailEndpoints(session) {
  const requisitions = unwrapData(await smokeFetch(session, '/api/v1/recruitment/requisitions?limit=5', { method: 'GET' }, 200, 'detail seed requisitions', expectPaginated)).data;
  const candidates = unwrapData(await smokeFetch(session, '/api/v1/recruitment/candidates?limit=5', { method: 'GET' }, 200, 'detail seed candidates', expectPaginated)).data;
  const applications = unwrapData(await smokeFetch(session, '/api/v1/recruitment/applications?limit=5', { method: 'GET' }, 200, 'detail seed applications', expectPaginated)).data;
  const interviews = unwrapData(await smokeFetch(session, '/api/v1/recruitment/interviews?limit=5', { method: 'GET' }, 200, 'detail seed interviews', expectPaginated)).data;
  const offers = unwrapData(await smokeFetch(session, '/api/v1/recruitment/offers?limit=5', { method: 'GET' }, 200, 'detail seed offers', expectPaginated)).data;

  if (requisitions[0]) {
    await smokeFetch(session, `/api/v1/recruitment/requisitions/${requisitions[0].id}`, { method: 'GET' }, 200, 'requisition detail', expectRecruitmentDetail);
  }
  if (candidates[0]) {
    await smokeFetch(session, `/api/v1/recruitment/candidates/${candidates[0].id}`, { method: 'GET' }, 200, 'candidate detail', expectRecruitmentDetail);
  }
  if (applications[0]) {
    await smokeFetch(session, `/api/v1/recruitment/applications/${applications[0].id}`, { method: 'GET' }, 200, 'application detail', expectRecruitmentDetail);
  }
  if (interviews[0]) {
    await smokeFetch(session, `/api/v1/recruitment/interviews/${interviews[0].id}`, { method: 'GET' }, 200, 'interview detail', expectRecruitmentDetail);
  }
  if (offers[0]) {
    await smokeFetch(session, `/api/v1/recruitment/offers/${offers[0].id}`, { method: 'GET' }, 200, 'offer detail', expectRecruitmentDetail);
  }
}

async function runForbiddenEndpoints(session, endpoints) {
  for (const path of endpoints) {
    await smokeFetch(session, path, { method: 'GET' }, 403, 'employee access denied');
  }
}

async function runFrontendPages() {
  const baseUrl = trimTrailingSlash(frontendBaseUrl || '');

  for (const page of frontendPages) {
    const response = await fetchWithTimeout(`${baseUrl}${page}`, {
      method: 'GET',
      headers: {
        accept: 'text/html',
        'x-request-id': `recruitment-page-smoke-${Date.now()}-${steps.length}`,
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

async function smokeFetch(session, path, init, expectedStatus, summary, validate) {
  const method = init.method || 'GET';
  const headers = {
    accept: 'application/json',
    'x-request-id': `recruitment-smoke-${Date.now()}-${steps.length}`,
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
    throw new Error(`${method} ${path} expected ${expectedStatus}, received ${response.status}: ${appendRepairHint(message, response)}`);
  }

  if (validate) {
    try {
      validate(body);
    } catch (error) {
      throw new Error(`${method} ${path} returned ${response.status} but failed smoke validation: ${errorMessageFromUnknown(error)} Body shape: ${describeBodyShape(body)}`);
    }
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

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`Could not reach ${url}. Start or point to an existing API with RECRUITMENT_SMOKE_BASE_URL. ${errorMessageFromUnknown(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json();
}

function extractCsrfToken(body, cookieJar) {
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

function captureCookies(headers, jar) {
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

function getSetCookieHeaders(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : undefined;

  if (values && values.length > 0) {
    return values;
  }

  const combined = headers.get('set-cookie');

  if (!combined) {
    return [];
  }

  return combined.split(/,(?=\s*[^;,]+=)/).map((cookie) => cookie.trim());
}

function serializeCookies(jar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function objectEndpoint(path, summary) {
  return { path, summary, validate: expectObject };
}

function arrayEndpoint(path, summary) {
  return { path, summary, validate: expectArray };
}

function paginatedEndpoint(path, summary) {
  return { path, summary, validate: expectPaginated };
}

function expectObject(body) {
  if (!isRecord(unwrapData(body))) {
    throw new Error('Expected an object response body.');
  }
}

function expectArray(body) {
  if (!Array.isArray(unwrapData(body))) {
    throw new Error('Expected an array response body.');
  }
}

function expectPaginated(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Expected a paginated response with a data array.');
  }
}

function expectRecruitmentDetail(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !isRecord(payload.record) || !Array.isArray(payload.timeline) || !Array.isArray(payload.audit)) {
    throw new Error('Expected recruitment detail with record, timeline, and audit arrays.');
  }
}

function expectCareersBoard(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !isRecord(payload.tenant) || !Array.isArray(payload.data)) {
    throw new Error('Expected public careers board with tenant and data array.');
  }
}

function expectHiringMarketplace(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !isRecord(payload.metrics) || !Array.isArray(payload.data) || !Array.isArray(payload.talentProfiles)) {
    throw new Error('Expected public hiring marketplace with metrics, data, and talentProfiles.');
  }
}

function expectPublicJobDetail(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || !isRecord(payload.tenant) || !isRecord(payload.job) || typeof payload.job.slug !== 'string') {
    throw new Error('Expected public job detail with tenant and job payload.');
  }
}

function expectPublicApplicationReceipt(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || payload.received !== true || !isRecord(payload.application)) {
    throw new Error('Expected public application receipt.');
  }
}

function expectPublicTalentProfileReceipt(body) {
  const payload = unwrapData(body);

  if (!isRecord(payload) || payload.received !== true || !isRecord(payload.profile)) {
    throw new Error('Expected public talent profile receipt.');
  }
}

function describeBodyShape(body) {
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

function unwrapData(body) {
  if (isRecord(body) && 'data' in body) {
    return body.data;
  }

  return body;
}

function errorMessage(body, response) {
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

function appendRepairHint(message, response) {
  if (response.status !== 403 || !String(message).includes('recruitment.')) {
    return message;
  }

  return `${message}. If this is an existing demo tenant, run npm run repair:recruitment-access and rerun the smoke test.`;
}

function errorMessageFromUnknown(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown fetch error.';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
