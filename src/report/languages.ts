// The languages the interface and the daily summary can be shown in.
//
// One fixed list shared by the browser (dropdown labels, search) and the
// server (which code the summary prompt is allowed to name). A language code
// is only ever chosen from this list, never typed freely, so a code is safe
// to place inside the summarizer prompt.

export interface LanguageInfo {
  /** Stable code stored in settings, e.g. "zh-TW". */
  code: string;
  /** Name in English, also the name the summary prompt uses. */
  english: string;
  /** The language's own name for itself. */
  native: string;
}

export const languageCatalog: readonly LanguageInfo[] = [
  { code: "en", english: "English", native: "English" },
  { code: "zh-TW", english: "Traditional Chinese", native: "繁體中文" },
  { code: "zh-CN", english: "Simplified Chinese", native: "简体中文" },
  { code: "es", english: "Spanish", native: "Español" },
  { code: "ja", english: "Japanese", native: "日本語" },
  { code: "ko", english: "Korean", native: "한국어" },
  { code: "fr", english: "French", native: "Français" },
  { code: "de", english: "German", native: "Deutsch" },
  { code: "pt", english: "Portuguese", native: "Português" },
  { code: "it", english: "Italian", native: "Italiano" },
  { code: "ru", english: "Russian", native: "Русский" },
  { code: "uk", english: "Ukrainian", native: "Українська" },
  { code: "pl", english: "Polish", native: "Polski" },
  { code: "cs", english: "Czech", native: "Čeština" },
  { code: "sk", english: "Slovak", native: "Slovenčina" },
  { code: "hu", english: "Hungarian", native: "Magyar" },
  { code: "ro", english: "Romanian", native: "Română" },
  { code: "bg", english: "Bulgarian", native: "Български" },
  { code: "hr", english: "Croatian", native: "Hrvatski" },
  { code: "el", english: "Greek", native: "Ελληνικά" },
  { code: "tr", english: "Turkish", native: "Türkçe" },
  { code: "nl", english: "Dutch", native: "Nederlands" },
  { code: "sv", english: "Swedish", native: "Svenska" },
  { code: "da", english: "Danish", native: "Dansk" },
  { code: "no", english: "Norwegian", native: "Norsk" },
  { code: "fi", english: "Finnish", native: "Suomi" },
  { code: "ca", english: "Catalan", native: "Català" },
  { code: "ar", english: "Arabic", native: "العربية" },
  { code: "he", english: "Hebrew", native: "עברית" },
  { code: "fa", english: "Persian", native: "فارسی" },
  { code: "ur", english: "Urdu", native: "اردو" },
  { code: "hi", english: "Hindi", native: "हिन्दी" },
  { code: "bn", english: "Bengali", native: "বাংলা" },
  { code: "ta", english: "Tamil", native: "தமிழ்" },
  { code: "te", english: "Telugu", native: "తెలుగు" },
  { code: "th", english: "Thai", native: "ไทย" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", english: "Malay", native: "Bahasa Melayu" },
  { code: "fil", english: "Filipino", native: "Filipino" },
  { code: "sw", english: "Swahili", native: "Kiswahili" },
];

export function findLanguage(code: string): LanguageInfo | undefined {
  return languageCatalog.find((language) => language.code === code);
}

/** "English name (native name)", the label shown wherever a language is named. */
export function formatLanguageLabel(language: LanguageInfo): string {
  return `${language.english} (${language.native})`;
}

/** A summary language setting: "auto" (follow the records) or a catalog code. */
export function isSupportedSummaryLanguage(value: unknown): value is string {
  return (
    typeof value === "string" && (value === "auto" || !!findLanguage(value))
  );
}
