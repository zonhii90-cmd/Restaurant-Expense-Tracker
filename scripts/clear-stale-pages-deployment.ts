import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Options = {
  token: string;
  repository: string;
  deploymentId: string;
  request?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
};
const TERMINAL = new Set([
  'succeed', 'deployment_failed', 'deployment_perms_error',
  'deployment_content_failed', 'deployment_cancelled', 'deployment_lost',
]);

export async function clearStalePagesDeployment({ token, repository, deploymentId,
  request = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)),
  now = Date.now, log = console.log,
}: Options): Promise<void> {
  // This recovery is deliberately restricted to the one failed deployment.
  if (repository !== 'zonhii90-cmd/Restaurant-Expense-Tracker' ||
      deploymentId !== 'e8b873f3cdd2c54d1ac9f9ba9978458635e1ad59') {
    throw new Error('Recovery target does not match the confirmed timed-out deployment.');
  }
  if (!token) throw new Error('The workflow token is missing.');
  const url = `https://api.github.com/repos/${repository}/pages/deployments/${deploymentId}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28' };
  async function status(): Promise<string> {
    const response = await request(url, { headers, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return 'absent';
    if (!response.ok) throw new Error(`Cannot read the old Pages deployment: HTTP ${response.status}.`);
    const data = await response.json() as { status?: string };
    return data.status ?? 'unknown_status';
  }
  let state = await status();
  if (state === 'absent' || TERMINAL.has(state)) {
    log('The confirmed old deployment is already finished or absent; no cancellation needed.');
    return;
  }
  log('Requesting cancellation of the confirmed old deployment only.');
  const response = await request(`${url}/cancel`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot cancel the old Pages deployment: HTTP ${response.status}.`);
  const deadline = now() + 120000;
  while (now() < deadline) {
    state = await status();
    if (state === 'absent' || TERMINAL.has(state)) {
      log('The old deployment is no longer in progress. New deployment can proceed.');
      return;
    }
    await sleep(5000);
  }
  throw new Error('GitHub still reports the old deployment in progress after cancellation. Stop here and check GitHub Pages service status or contact GitHub Support.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await clearStalePagesDeployment({
      token: process.env.GITHUB_TOKEN ?? '',
      repository: process.env.GITHUB_REPOSITORY ?? '',
      deploymentId: process.env.STALE_PAGES_DEPLOYMENT_ID ?? '',
    });
  } catch (error) {
    // Do not log the request, token, response body or other credentials.
    console.error(error instanceof Error ? error.message : 'Pages recovery failed.');
    process.exitCode = 1;
  }
}
