import { createContext } from "react";

/**
 * Whether the browser agreed to keep the app's data, as start-up asked it (R-07). Pending until
 * the browser answers; the Backup screen shows it (FR-075).
 */
export const StoragePersistedContext = createContext<Promise<boolean>>(Promise.resolve(false));
