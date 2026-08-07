export const PROFILE_FIELD_VERSIONS_KEY = "__profileFieldVersions";

export type ProfileFieldVersions = Record<string, number>;

export function parseProfileFieldVersions(
  value: unknown,
): ProfileFieldVersions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const versions: ProfileFieldVersions = {};
  for (const [key, version] of Object.entries(value)) {
    if (
      typeof version === "number" &&
      Number.isFinite(version) &&
      version >= 0
    ) {
      versions[key] = version;
    }
  }
  return versions;
}
