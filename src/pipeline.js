import { parseInput } from './input.js';
import { claudeAdapter } from './adapters/claude.js';
import { render } from './render.js';

export function renderFromStdin(raw, opts = {}) {
  const { config, colour, gitFn } = opts;
  const parsed = parseInput(raw);
  let input = claudeAdapter(parsed);

  if (config?.fields?.branch && typeof gitFn === 'function') {
    const cwd = parsed?.workspace?.current_dir || parsed?.cwd || null;
    const info = gitFn(cwd);
    if (info) input = { ...input, branch: info.branch, dirty: !!info.dirty };
  }

  return render(input, { config, colour });
}
