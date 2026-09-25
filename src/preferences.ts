export interface Preferences {
  tips: boolean;
  fast: boolean;
  /** The first New expedition asked about Field Training once; either answer is final. */
  trainingOffered: boolean;
}
const key = "faultline-preferences-v1";
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return { tips: value.tips !== false, fast: value.fast === true, trainingOffered: value.trainingOffered === true };
  } catch {
    return { tips: true, fast: false, trainingOffered: false };
  }
}
export function storePreferences(value: Preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Preferences are optional. */ }
}
