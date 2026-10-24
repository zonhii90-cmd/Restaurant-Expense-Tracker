import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspace, workspaceHash } from '../src/workspaces';

test('manager and staff defaults differ and management links cannot grant staff access', () => {
  assert.deepEqual(resolveWorkspace('', true), { area: 'management', mode: 'dashboard' });
  assert.deepEqual(resolveWorkspace('', false), { area: 'staff', mode: 'entry' });
  for (const page of ['dashboard', 'purchases', 'reports', 'suppliers', 'staff', 'logins']) {
    assert.deepEqual(resolveWorkspace(`#/management/${page}`, false), { area: 'staff', mode: 'entry' });
    const route = resolveWorkspace(`#/management/${page}`, true);
    assert.equal(route.area, 'management');
    assert.equal(workspaceHash(route), `#/management/${page}`);
  }
  for (const manager of [true, false]) {
    assert.deepEqual(resolveWorkspace('#/staff/add', manager), { area: 'staff', mode: 'entry' });
    assert.deepEqual(resolveWorkspace('#/staff/purchases', manager), { area: 'staff', mode: 'history' });
  }
  for (const page of ['unknown', '__proto__', 'constructor', 'toString'])
    assert.deepEqual(resolveWorkspace(`#/management/${page}`, true), { area: 'management', mode: 'dashboard' });
});
