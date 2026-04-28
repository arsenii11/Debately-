export const VOICE_INPUT_LANG_STORAGE_KEY = "debately:voiceLang";

export const VOICE_LANG_AUTO = "auto";

export const VOICE_INPUT_LANG_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: VOICE_LANG_AUTO, label: "Auto" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "ru-RU", label: "Russian" },
  { value: "uk-UA", label: "Ukrainian" },
  { value: "de-DE", label: "German" },
  { value: "fr-FR", label: "French" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "it-IT", label: "Italian" },
  { value: "pl-PL", label: "Polish" },
  { value: "tr-TR", label: "Turkish" },
  { value: "ar-SA", label: "Arabic" },
  { value: "hi-IN", label: "Hindi" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese (Mandarin)" },
  { value: "ko-KR", label: "Korean" },
];

const BCP47_LOOSE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

export function loadVoiceInputLang(): string {
  if (typeof window === "undefined") return VOICE_LANG_AUTO;
  try {
    const raw = localStorage.getItem(VOICE_INPUT_LANG_STORAGE_KEY)?.trim();
    if (!raw) return VOICE_LANG_AUTO;
    if (raw === VOICE_LANG_AUTO) return VOICE_LANG_AUTO;
    if (BCP47_LOOSE.test(raw)) return raw;
    return VOICE_LANG_AUTO;
  } catch {
    return VOICE_LANG_AUTO;
  }
}

export function saveVoiceInputLang(value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VOICE_INPUT_LANG_STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}
