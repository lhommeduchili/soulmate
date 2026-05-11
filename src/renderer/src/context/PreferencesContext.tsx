import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
} from "../../../shared/preferences";

interface PreferencesContextValue {
  preferences: AppPreferences;
  isLoadingPreferences: boolean;
  updatePreferences: (
    nextPreferences: Partial<AppPreferences>,
  ) => Promise<AppPreferences>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [preferences, setPreferences] =
    useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  useEffect(() => {
    let isMounted = true;

    window.api.settings
      .getPreferences()
      .then((nextPreferences: AppPreferences) => {
        if (isMounted) {
          setPreferences(nextPreferences);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load preferences", error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPreferences(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = preferences.locale;
    document.documentElement.dir = "ltr";
  }, [preferences.locale]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      isLoadingPreferences,
      updatePreferences: async (nextPreferences) => {
        const updatedPreferences =
          await window.api.settings.updatePreferences(nextPreferences);
        setPreferences(updatedPreferences);
        return updatedPreferences;
      },
    }),
    [isLoadingPreferences, preferences],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferencesContext(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error(
      "usePreferencesContext must be used within a PreferencesProvider",
    );
  }
  return context;
}
