import type { WindowIdentity } from '../shared/protocol';

export type WindowSpec = {
  id: WindowIdentity;
  title: string;
  size: { width: number; height: number };
  htmlSegments: string[];
  // placeholder 窗体会被正常打开，但交互逻辑保持禁用，避免误接入未完成业务。
  placeholder?: boolean;
};

// 所有主进程窗体都在这里集中注册；后续新增业务窗体时优先只改这里。
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
  {
    id: 'partner:credit',
    title: 'Partner - Credit (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'credit', 'index.html'],
    placeholder: true,
  },
  {
    id: 'partner:consumer',
    title: 'Partner - Consumer (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'consumer', 'index.html'],
    placeholder: true,
  },
  {
    id: 'partner:risk',
    title: 'Partner - Risk (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'risk', 'index.html'],
    placeholder: true,
  },
] as const;

export function getMainWindowSpecs(options?: { includePlaceholders?: boolean }) {
  const includePlaceholders = options?.includePlaceholders === true;
  if (includePlaceholders) return MAIN_WINDOW_REGISTRY;
  // 默认跳过 placeholder，避免启动时打开未接入业务的空壳窗体。
  return MAIN_WINDOW_REGISTRY.filter((spec) => !spec.placeholder);
}
