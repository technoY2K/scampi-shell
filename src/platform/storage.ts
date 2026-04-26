import { DEVICE_IDENTITY_STORAGE_KEY } from "../gateway/identity-constants";
import { getSafeLocalStorage } from "../gateway/local-storage";
import { isTauri } from "./runtime";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const CONFIG_STORE_FILE = "config.json";

function createLocalStorageKeyValueStore(): KeyValueStore {
  const storage = getSafeLocalStorage();
  return {
    async get(key: string) {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    async set(key: string, value: string) {
      try {
        storage?.setItem(key, value);
      } catch {
        // same as before: fail silently if storage unavailable
      }
    },
    async remove(key: string) {
      try {
        storage?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

async function createTauriConfigKeyValueStore(): Promise<KeyValueStore> {
  const { load } = await import("@tauri-apps/plugin-store");
  const fileStore = await load(CONFIG_STORE_FILE, { defaults: {}, autoSave: true });
  return {
    async get(key: string) {
      const v = await fileStore.get<unknown>(key);
      if (v === undefined || v === null) {
        return null;
      }
      if (typeof v === "string") {
        return v;
      }
      return JSON.stringify(v);
    },
    async set(key: string, value: string) {
      await fileStore.set(key, value);
    },
    async remove(key: string) {
      await fileStore.delete(key);
    },
  };
}

async function createTauriKeychainKeyValueStore(): Promise<KeyValueStore> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    async get(key: string) {
      if (key !== DEVICE_IDENTITY_STORAGE_KEY) {
        return null;
      }
      return invoke<string | null>("identity_get");
    },
    async set(key: string, value: string) {
      if (key !== DEVICE_IDENTITY_STORAGE_KEY) {
        return;
      }
      await invoke("identity_set", { value });
    },
    async remove(key: string) {
      if (key !== DEVICE_IDENTITY_STORAGE_KEY) {
        return;
      }
      await invoke("identity_remove");
    },
  };
}

export async function getIdentityStore(): Promise<KeyValueStore> {
  if (isTauri()) {
    return createTauriKeychainKeyValueStore();
  }
  return createLocalStorageKeyValueStore();
}

export async function getConfigStore(): Promise<KeyValueStore> {
  if (isTauri()) {
    return createTauriConfigKeyValueStore();
  }
  return createLocalStorageKeyValueStore();
}
