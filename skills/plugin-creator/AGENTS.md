# Repository instructions


This repository maintains the Goose/Open Plugins creator skill.

- Write all Agent Skill metadata and instructions in English.
- Keep Skill descriptions concise and in third person; state what the Skill does and when it should activate.
- Keep `SKILL.md` at or below 500 lines; move conditional or deep detail into directly linked references using progressive disclosure.

- Scope generated artifacts to plugins installed under `.agents/plugins`.
- Do not generate standalone `.agents/skills` or `.agents/agents` assets.
- Bundled skills under a plugin's `skills/` directory are in scope.
- Treat hooks as executable security-sensitive code.
- Keep Goose-specific behavior explicit and source-verified.
- Preserve portable components when migrating another plugin ecosystem.
- Make TypeScript CLI changes in `apps/plugin-creator-cli/`, never in this portable Skill tree.
- Run `(cd apps/plugin-creator-cli && npm run build && npm test)` after CLI changes.
