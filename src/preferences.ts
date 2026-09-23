export interface Preferences {
  tips: boolean;
  fast: boolean;
}
const key = "faultline-preferences-v1";
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return { tips: value.tips !== false, fast: value.fast === true };
  } catch {
    return { tips: true, fast: false };
  }
}
export function storePreferences(value: Preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Preferences are optional. */ }
}
