# Repository instructions

This repository maintains a portable, vendor-neutral Agent Skill Creator.

- Use the Agent Skills `SKILL.md` specification for skills.
- Write all Agent Skill metadata and instructions in English.
- Keep Skill descriptions concise and in third person; state what the Skill does and when it should activate.
- Keep `SKILL.md` at or below 500 lines; move conditional or deep detail into directly linked references using progressive disclosure.
- Scope all generated artifacts to Agent Skills under `.agents/skills`; do not generate `.agents/agents` or `.agents/plugins` assets.
- Use `AGENTS.md` exclusively for repository instructions; do not add host-specific instruction files or configuration directories.
- Keep agent and plugin schemas host-aware; they are not part of the Agent Skills specification.
- Keep runner-specific behavior isolated in `scripts/runners/`.
- Run `npm run build` (TypeScript compile) after script changes.
- Run `node dist/scripts/quick_validate.js .` after `SKILL.md` changes.
