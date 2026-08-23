/** Local, offline registry of Agent Plugins schema versions. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SchemaDocumentType = "manifest" | "mcp";
export type SchemaVersionStatus = "published" | "draft";

export interface RegisteredSchemaDocument {
  readonly id: string;
  readonly file: string;
}

export interface SchemaVersionRegistration {
  readonly version: string;
  readonly specification: string;
  readonly status: SchemaVersionStatus;
  readonly activeForValidation: boolean;
  readonly activeForGeneration: boolean;
  readonly isDefault: boolean;
  readonly snapshotDirectory: string;
  readonly schemas: Readonly<Record<SchemaDocumentType, RegisteredSchemaDocument>>;
}

export interface RegisteredSchemaIdentifier {
  readonly version: SchemaVersionRegistration;
  readonly type: SchemaDocumentType;
  readonly schema: RegisteredSchemaDocument;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = dirname(HERE).endsWith("dist") ? dirname(dirname(HERE)) : dirname(HERE);
const schemaId = (version: string, file: string) =>
  `https://agent-plugins.org/schemas/${version}/${file}`;

function registration(
  version: string,
  status: SchemaVersionStatus,
  active: boolean,
  isDefault = false,
): SchemaVersionRegistration {
  return Object.freeze({
    version,
    specification: `Agent Plugins ${version}`,
    status,
    activeForValidation: active,
    activeForGeneration: active,
    isDefault,
    snapshotDirectory: join(SKILL_ROOT, "references", `agent-plugins-${version}`),
    schemas: Object.freeze({
      manifest: Object.freeze({ id: schemaId(version, "plugin.schema.json"), file: "plugin.schema.json" }),
      mcp: Object.freeze({ id: schemaId(version, "mcp.schema.json"), file: "mcp.schema.json" }),
    }),
  });
}

export const DEFAULT_SCHEMA_VERSION = "1.0.0";

/** Includes recognized inactive versions so callers can distinguish drafts from unknown identifiers. */
export const SCHEMA_VERSION_REGISTRY: Readonly<Record<string, SchemaVersionRegistration>> = Object.freeze({
  "1.0.0": registration("1.0.0", "published", true, true),
  "1.1.0": registration("1.1.0", "draft", false),
});

export const SCHEMA_REGISTRY = SCHEMA_VERSION_REGISTRY;

export function getSchemaVersion(version = DEFAULT_SCHEMA_VERSION): SchemaVersionRegistration | undefined {
  return SCHEMA_VERSION_REGISTRY[version];
}

export function getDefaultSchemaVersion(): SchemaVersionRegistration {
  return SCHEMA_VERSION_REGISTRY[DEFAULT_SCHEMA_VERSION]!;
}

export function getActiveSchemaVersions(): readonly SchemaVersionRegistration[] {
  return Object.values(SCHEMA_VERSION_REGISTRY).filter(entry => entry.activeForValidation);
}

export function findSchemaIdentifier(identifier: string): RegisteredSchemaIdentifier | undefined {
  for (const version of Object.values(SCHEMA_VERSION_REGISTRY)) {
    for (const type of ["manifest", "mcp"] as const) {
      const schema = version.schemas[type];
      if (schema.id === identifier) return { version, type, schema };
    }
  }
  return undefined;
}

export function getSchemaPath(version: SchemaVersionRegistration, type: SchemaDocumentType): string {
  return join(version.snapshotDirectory, version.schemas[type].file);
}
