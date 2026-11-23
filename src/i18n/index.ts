import { en } from './en';
import { ja, type TranslationKey } from './ja';

export type Language = 'ja' | 'en';

const LANG_STORAGE_KEY = 'clipkit_lang';
const DICTS: Record<Language, Record<TranslationKey, string>> = { ja, en };

export function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ja';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // Ignore storage errors
  }
  const navLang = navigator.language?.toLowerCase() || 'ja';
  return navLang.startsWith('ja') ? 'ja' : 'en';
}

export function persistLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export function translate(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const dict = DICTS[lang] || DICTS.ja;
  let text = dict[key] ?? DICTS.ja[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export type { TranslationKey };
