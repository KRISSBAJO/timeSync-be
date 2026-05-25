import 'dotenv/config';

type EndpointResult = {
  path: string;
  ok: boolean;
  status: number;
  summary: string;
};

const baseUrl = (process.env.RUNTIME_CHECK_BASE_URL ?? `http://localhost:${process.env.PORT ?? '4040'}/api/v1`)
  .replace(/\/$/, '');
const timeoutMs = Number(process.env.RUNTIME_CHECK_TIMEOUT_MS ?? 7000);

async function fetchJson(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) as unknown : {};

    return {
      response,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function bodyStatus(body: unknown) {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const maybeEnvelope = body as { data?: unknown; status?: unknown };
  const data = maybeEnvelope.data && typeof maybeEnvelope.data === 'object'
    ? maybeEnvelope.data as { status?: unknown }
    : undefined;

  return typeof data?.status === 'string'
    ? data.status
    : typeof maybeEnvelope.status === 'string'
      ? maybeEnvelope.status
      : undefined;
}

async function checkEndpoint(path: string, acceptedStatuses: string[]): Promise<EndpointResult> {
  try {
    const result = await fetchJson(path);
    const response = result.response;
    const body = result.body;
    const status = bodyStatus(body);
    const ok = response.ok && Boolean(status && acceptedStatuses.includes(status));

    return {
      path,
      ok,
      status: response.status,
      summary: status ? `reported ${status}` : 'missing status field',
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: 0,
      summary: error instanceof Error ? error.message : 'Unknown readiness check error',
    };
  }
}

async function main() {
  const results = await Promise.all([
    checkEndpoint('/health/live', ['ok']),
    checkEndpoint('/health/ready', ['ok']),
    checkEndpoint('/health/runtime', ['ok', 'warning']),
  ]);
  const failed = results.filter((result) => !result.ok);

  console.table(results);

  if (failed.length > 0) {
    console.error(`Production readiness check failed for ${failed.length} endpoint(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Production readiness check passed against ${baseUrl}.`);
}

void main();
