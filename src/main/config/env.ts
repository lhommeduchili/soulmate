export function getMainEnv(key: string): string {
  const envValue = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof envValue === "string" && envValue.trim()) {
    return envValue.trim();
  }

  const processValue = process.env[key];
  if (typeof processValue === "string" && processValue.trim()) {
    return processValue.trim();
  }

  return "";
}
