# Repository instructions

- Treat `references/hooks.md` as the vendored source of truth.
- Generate hooks only as plugin components.
- Keep blocking behavior limited to PreToolUse and Stop.
- Treat hook commands as executable, security-sensitive code.
- Make TypeScript CLI changes in `apps/hook-creator-cli/`, never in this portable Skill tree.
- Run `(cd apps/hook-creator-cli && npm run build && npm test)` after CLI changes.
