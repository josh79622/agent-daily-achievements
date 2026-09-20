import { useEffect, useRef, useState } from "react";
import { findLanguage } from "../src/report/languages.js";
import type { Translations } from "./i18n.js";
import { searchLanguageOptions } from "./language-options.js";

interface LanguageSelectorProps {
  language: string;
  onLanguageChange: (code: string) => void;
  disabled?: boolean;
  t: Translations;
}

export function LanguageSelector({
  language,
  onLanguageChange,
  disabled = false,
  t,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
        return;
      }
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [isOpen]);

  const current = findLanguage(language);
  const options = searchLanguageOptions(query);

  const choose = (code: string) => {
    setIsOpen(false);
    setQuery("");
    if (code !== language) onLanguageChange(code);
  };

  return (
    <div className="language-selector" ref={rootRef}>
      <button
        type="button"
        className="zen-theme-btn language-selector-btn"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        title={t.header.languageToggle}
        aria-label={t.header.languageToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>🌐</span>
        <span className="theme-btn-text">
          {current ? current.native : language}
        </span>
      </button>
      {isOpen && (
        <div className="language-menu">
          <input
            type="text"
            className="language-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.header.languageSearchPlaceholder}
            aria-label={t.header.languageSearchPlaceholder}
            autoFocus
          />
          <ul className="language-list" role="listbox">
            {options.length === 0 && (
              <li className="language-empty">{t.header.languageNoResults}</li>
            )}
            {options.map((option) => (
              <li key={option.code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.code === language}
                  className={`language-option ${option.code === language ? "active" : ""}`}
                  disabled={!option.builtIn}
                  onClick={() => choose(option.code)}
                >
                  <span>{option.label}</span>
                  <span className="language-option-note">
                    {option.builtIn
                      ? t.header.languageBuiltIn
                      : t.header.languageNotAvailable}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
