import type { WindowIdentity } from '../shared/protocol';

export type WindowSpec = {
  id: WindowIdentity;
  title: string;
  size: { width: number; height: number };
  htmlSegments: string[];
};

// 所有主进程窗体集中注册；新增业务窗体时优先只改这里（并同步 protocol WINDOW_IDENTITIES）。
export const MAIN_WINDOW_REGISTRY: readonly WindowSpec[] = [
  {
    id: 'workbench',
    title: 'Workbench',
    size: { width: 1100, height: 800 },
    htmlSegments: ['renderer', 'workbench', 'index.html'],
  },
  {
    id: 'dialer',
    title: 'Dialer',
    size: { width: 480, height: 600 },
    htmlSegments: ['renderer', 'dialer', 'index.html'],
  },
  {
    id: 'partner:auto',
    title: 'Partner - Auto',
    size: { width: 560, height: 620 },
    htmlSegments: ['renderer', 'partner', 'auto', 'index.html'],
  },
] as const;

export function getMainWindowSpecs() {
  return MAIN_WINDOW_REGISTRY;
}
