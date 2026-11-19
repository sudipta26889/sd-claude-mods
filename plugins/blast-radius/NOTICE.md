# Notice

This folder is a changed copy of the Blast Radius mod from
[anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/569c5283d9a0a7ee7938df85bb32e4f48cbb8c86/claude-code/mods/blast-radius),
taken at commit `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86`.

- Copyright 2026 Anthropic PBC. Licensed under the Apache License, Version 2.0. The licence
  text is in [LICENSE](LICENSE).
- The upstream README, with its screenshots and full list of limits, is at the link above.
  It is not copied here.

## What was changed

Changed by sudipta26889 in November 2026:

- `hooks/blast-radius.mjs`: added the optional `preCheck` setting. Before a risky command is
  held, the mod runs `<preCheck> <kind> <command>`. If that exits 0 and prints exactly
  `approve`, the command runs with no panel. With no setting, or any other answer, the mod
  behaves as upstream does. Nothing else in the file is changed.
- `.claude-plugin/plugin.json`: added `preCheck` under `userConfig`, and removed `version`,
  `author` and `keywords` so the manifest matches the others in this repository.
- `hooks/hooks.json`: kept the module list only.
- `tests/blast-radius.test.ts`: new. Covers the `preCheck` setting.
