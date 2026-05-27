import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveUserConfigPath() {
  return process.env.CLAUDE_STATUSLINE_CONFIG
    || join(homedir(), '.claude', 'claude-statusline.json');
}

export function resolveProjectConfigPath(cwd = process.cwd()) {
  return join(cwd, '.claude', 'claude-statusline.json');
}

export function resolveSettingsPath() {
  return join(homedir(), '.claude', 'settings.json');
}

export function configPathForScope(scope, cwd = process.cwd()) {
  if (scope === 'project') return resolveProjectConfigPath(cwd);
  return resolveUserConfigPath();
}
