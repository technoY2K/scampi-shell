import { getConfigStore } from "../../platform/storage";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme.preference";
const VALID: readonly ThemePreference[] = ["system", "light", "dark"] as const;

function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

/** read persisted preference; defaults to "system" */
export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const store = await getConfigStore();
    const raw = await store.get(STORAGE_KEY);
    if (raw && isThemePreference(raw)) {
      return raw;
    }
  } catch {
    // fall through to default
  }
  return "system";
}

/** persist preference */
export async function setThemePreference(p: ThemePreference): Promise<void> {
  try {
    const store = await getConfigStore();
    await store.set(STORAGE_KEY, p);
  } catch {
    // best-effort; theme still applied for the session
  }
}
