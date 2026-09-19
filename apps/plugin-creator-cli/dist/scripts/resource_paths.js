import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = dirname(here).endsWith(process.platform === "win32" ? "\\dist" : "/dist")
    ? dirname(dirname(here))
    : dirname(here);
export const REPOSITORY_ROOT = resolve(APP_ROOT, "../..");
export const PORTABLE_SKILL_ROOT = resolve(process.env.PLUGIN_CREATOR_SKILL_ROOT ?? resolve(REPOSITORY_ROOT, "skills/plugin-creator"));
export const portableSkillPath = (...segments) => resolve(PORTABLE_SKILL_ROOT, ...segments);
