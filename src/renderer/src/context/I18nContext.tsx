import { createContext, ReactNode, useContext, useMemo } from "react";
import { AppLocale } from "../../../shared/preferences";
import { MessageKey, translate } from "../i18n";
import { usePreferencesContext } from "./PreferencesContext";

interface I18nContextValue {
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { preferences } = usePreferencesContext();

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: preferences.locale,
      t: (key, values) => translate(preferences.locale, key, values),
    }),
    [preferences.locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
