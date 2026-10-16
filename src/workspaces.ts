export type Area = 'staff' | 'management';
export type Mode = 'dashboard' | 'history' | 'entry' | 'reports' | 'suppliers';
export type WorkspaceRoute = { area: Area; mode: Mode };

export function resolveWorkspace(hash: string, manager: boolean): WorkspaceRoute {
  const [area, page] = hash.replace(/^#\/?/, '').split('/');
  if (area === 'staff') return { area: 'staff', mode: page === 'purchases' ? 'history' : 'entry' };
  if (manager) {
    const mode = area !== 'management' ? 'dashboard' : page === 'purchases' ? 'history' : page === 'reports' ? 'reports' : page === 'suppliers' ? 'suppliers' : 'dashboard';
    return { area: 'management', mode: mode || 'dashboard' };
  }
  return { area: 'staff', mode: 'entry' };
}

export function workspaceHash({ area, mode }: WorkspaceRoute) {
  return `#/${area}/${mode === 'entry' ? 'add' : mode === 'history' ? 'purchases' : mode}`;
}
