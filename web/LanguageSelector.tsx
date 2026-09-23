import { useEffect, useRef, useState } from "react";
import { findLanguage } from "../src/report/languages.js";
import type { Translations } from "./i18n.js";
import { searchLanguageOptions } from "./language-options.js";
import { buildLanguagePack } from "./language-runtime.js";
import { HeaderIconButton } from "./HeaderIconButton.js";
import { format } from "./i18n.js";

type BuildRowState = { kind: "preparing" } | { kind: "failed"; reason: string };

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
  const [buildState, setBuildState] = useState<
    Record<string, BuildRowState | undefined>
  >({});
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
  const tooltip = format(t.header.languageCurrentTooltip, {
    language: current?.native ?? language,
  });

  const choose = (code: string) => {
    setIsOpen(false);
    setQuery("");
    if (code !== language) onLanguageChange(code);
  };

  // Pressing Add never changes the page's language (test L2-20); it only
  // marks that row as preparing, then failed or (via the runtime registry,
  // which the options list reads live) selectable.
  const add = async (code: string) => {
    setBuildState((state) => ({ ...state, [code]: { kind: "preparing" } }));
    const outcome = await buildLanguagePack(code, {
      fetchFn: fetch,
      origin: window.location.origin,
    });
    setBuildState((state) => {
      const next = { ...state };
      if (outcome.ok) delete next[code];
      else next[code] = { kind: "failed", reason: outcome.reason };
      return next;
    });
  };

  return (
    <div className="language-selector" ref={rootRef}>
      <HeaderIconButton
        className="language-selector-btn"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        label={t.header.languageToggle}
        tooltip={tooltip}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span aria-hidden="true">🌐</span>
      </HeaderIconButton>
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
            {options.map((option) => {
              const row = buildState[option.code];
              const selectable =
                option.status === "built-in" || option.status === "added";
              return (
                <li key={option.code} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.code === language}
                    className={`language-option ${option.code === language ? "active" : ""}`}
                    disabled={!selectable}
                    onClick={() => choose(option.code)}
                  >
                    <span>{option.label}</span>
                    {option.status === "built-in" && (
                      <span className="language-option-note">
                        {t.header.languageBuiltIn}
                      </span>
                    )}
                  </button>
                  {option.status === "addable" && (
                    <span className="language-option-add">
                      {row?.kind === "preparing" ? (
                        <span className="language-option-note">
                          {t.header.languagePreparing}
                        </span>
                      ) : (
                        <>
                          {row?.kind === "failed" && (
                            <span className="language-option-note language-option-failed">
                              {t.header.languageAddFailed}
                            </span>
                          )}
                          <button
                            type="button"
                            className="language-add-btn"
                            onClick={() => void add(option.code)}
                          >
                            {t.header.languageAdd}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
