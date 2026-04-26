const SPEC_NAME_KEY = "debately:spec:name";

export function getSpectatorDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(SPEC_NAME_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setSpectatorDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = name.trim().slice(0, 32);
    if (t) localStorage.setItem(SPEC_NAME_KEY, t);
  } catch {
    /* ignore */
  }
}

export function clearSpectatorDisplayName(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SPEC_NAME_KEY);
  } catch {
    /* ignore */
  }
}

export { SPEC_NAME_KEY };
