import { AppLocale } from "../../../shared/preferences";
import { enMessages } from "./messages/en";
import { esCLMessages } from "./messages/es-CL";

const messagesByLocale = {
  "es-CL": esCLMessages,
  en: enMessages,
} as const;

export type MessageKey = keyof typeof enMessages;

export function translate(
  locale: AppLocale,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  const messages = messagesByLocale[locale] ?? enMessages;
  const template = messages[key] ?? enMessages[key];

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values?.[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}
