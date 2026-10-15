import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearStalePagesDeployment } from '../scripts/clear-stale-pages-deployment.ts';

const base = {
  token: 'FAKE_TEST_TOKEN', repository: 'zonhii90-cmd/Restaurant-Expense-Tracker',
  deploymentId: 'e8b873f3cdd2c54d1ac9f9ba9978458635e1ad59', log: () => {},
};
test('Pages recovery leaves completed deployments alone', async () => {
  const methods: string[] = [];
  await clearStalePagesDeployment({ ...base, request: async (_url, init) => {
    methods.push(init?.method ?? 'GET');
    return Response.json({ status: 'succeed' });
  } });
  assert.deepEqual(methods, ['GET']);
});
test('Pages recovery cancels only the confirmed stale ID and waits for completion', async () => {
  const methods: string[] = [];
  let clock = 0;
  let gets = 0;
  await clearStalePagesDeployment({ ...base,
    now: () => clock, sleep: async ms => { clock += ms; },
    request: async (url, init) => {
      assert.ok(String(url).startsWith(`https://api.github.com/repos/${base.repository}/pages/deployments/${base.deploymentId}`));
      methods.push(init?.method ?? 'GET');
      if (init?.method === 'POST') {
        assert.ok(String(url).endsWith('/cancel'));
        return new Response(null, { status: 204 });
      }
      return Response.json({ status: ++gets < 3 ? 'updating_pages' : 'deployment_cancelled' });
    },
  });
  assert.deepEqual(methods, ['GET', 'POST', 'GET', 'GET']);
});
test('Pages recovery fails safely when GitHub does not release the stale deployment', async () => {
  let clock = 0;
  await assert.rejects(clearStalePagesDeployment({ ...base,
    now: () => clock, sleep: async ms => { clock += ms; },
    request: async () => Response.json({ status: 'updating_pages' }),
  }), /still reports the old deployment/);
  assert.equal(clock, 120000);
});
test('Pages recovery refuses a different repository or deployment and does not log tokens on API errors', async () => {
  let requests = 0;
  const request: typeof fetch = async () => { requests++; return new Response(null, { status: 403 }); };
  await assert.rejects(clearStalePagesDeployment({ ...base, repository: 'other/repo', request }), /target/);
  await assert.rejects(clearStalePagesDeployment({ ...base, deploymentId: 'different', request }), /target/);
  assert.equal(requests, 0);
  await assert.rejects(clearStalePagesDeployment({ ...base, request }), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(base.token));
    return error.message.includes('HTTP 403');
  });
});
