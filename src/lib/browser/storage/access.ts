/** Storage access remains lazy so blocked or unavailable browser storage is tolerated. */
export function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

export function write(storage: () => Storage, key: string, value: string | null): boolean {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const local = () => localStorage;
export const session = () => sessionStorage;
