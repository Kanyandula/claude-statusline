import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  resolveUserConfigPath,
  resolveProjectConfigPath,
  resolveSettingsPath,
  configPathForScope,
} from '../../src/cli/paths.js';

test('resolveUserConfigPath: default location under HOME', () => {
  delete process.env.CLAUDE_STATUSLINE_CONFIG;
  assert.equal(resolveUserConfigPath(), join(homedir(), '.claude', 'claude-statusline.json'));
});

test('resolveUserConfigPath: CLAUDE_STATUSLINE_CONFIG override wins', () => {
  process.env.CLAUDE_STATUSLINE_CONFIG = '/tmp/custom.json';
  try { assert.equal(resolveUserConfigPath(), '/tmp/custom.json'); }
  finally { delete process.env.CLAUDE_STATUSLINE_CONFIG; }
});

test('resolveProjectConfigPath: <cwd>/.claude/claude-statusline.json', () => {
  assert.equal(resolveProjectConfigPath('/x/y'), '/x/y/.claude/claude-statusline.json');
});

test('resolveSettingsPath: ~/.claude/settings.json', () => {
  assert.equal(resolveSettingsPath(), join(homedir(), '.claude', 'settings.json'));
});

test('configPathForScope: scope=project uses cwd', () => {
  delete process.env.CLAUDE_STATUSLINE_CONFIG;
  assert.equal(configPathForScope('project', '/x'), '/x/.claude/claude-statusline.json');
});

test('configPathForScope: scope=user uses user path', () => {
  delete process.env.CLAUDE_STATUSLINE_CONFIG;
  assert.equal(configPathForScope('user', '/x'), join(homedir(), '.claude', 'claude-statusline.json'));
});
