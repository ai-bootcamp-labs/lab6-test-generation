/**
 * Smoke load test for the auth API. Runs autocannon against `POST /auth/login`
 * (wrong-password) and `POST /auth/register` (fresh emails) under a short
 * concurrent burst. Used to catch order-of-magnitude regressions, not as a
 * formal capacity test.
 *
 * Usage: `npm run test:load -- --url http://localhost:3000`
 */
import autocannon, { type Client, type Result } from 'autocannon';

interface Args {
  url: string;
  duration: number;
  connections: number;
}

/**
 * Parse simple `--key value` CLI arguments.
 * @param argv - Process argv slice.
 * @returns Parsed args with sensible defaults.
 */
function parseArgs(argv: string[]): Args {
  const get = (key: string, fallback: string): string => {
    const idx = argv.indexOf(`--${key}`);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1]! : fallback;
  };
  return {
    url: get('url', 'http://localhost:3000'),
    duration: Number(get('duration', '10')),
    connections: Number(get('connections', '20')),
  };
}

/**
 * Run a single autocannon scenario.
 * @param title - Display label.
 * @param opts - Autocannon options.
 * @returns Final result.
 */
async function run(title: string, opts: autocannon.Options): Promise<Result> {
  // eslint-disable-next-line no-console -- intentional CLI output
  console.log(`\n=== ${title} ===`);
  return new Promise<Result>((resolve, reject) => {
    const inst = autocannon(opts, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(inst, { renderProgressBar: true });
  });
}

/** Entry point. */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseOpts: Pick<autocannon.Options, 'connections' | 'duration'> = {
    connections: args.connections,
    duration: args.duration,
  };

  const wrongLogin = await run('POST /auth/login (wrong password)', {
    ...baseOpts,
    url: `${args.url}/auth/login`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'load@example.com', password: 'wrong-password' }),
  });

  const register = await run('POST /auth/register (unique emails)', {
    ...baseOpts,
    url: `${args.url}/auth/register`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    setupClient: (client: Client) => {
      // Each connection sends a different body so we never collide on email.
      client.setBody(
        JSON.stringify({
          email: `load-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          password: 'Str0ng!Passw0rd-XYZ',
        }),
      );
    },
  } as autocannon.Options);

  // eslint-disable-next-line no-console -- intentional CLI output
  console.log('\n=== Summary ===');
  for (const [name, r] of [
    ['login-wrong', wrongLogin],
    ['register-fresh', register],
  ] as const) {
    // eslint-disable-next-line no-console -- intentional CLI output
    console.log(`${name}: p95=${r.latency.p97_5}ms reqs=${r.requests.total} 2xx=${r['2xx']}`);
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- intentional CLI output
  console.error(err);
  process.exit(1);
});
