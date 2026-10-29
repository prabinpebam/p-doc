/**
 * The locale whose region picks the paper of new documents, read from the operating system: on Linux
 * and macOS POSIX `LC_ALL` or `LC_PAPER` when set (they decide paper there), otherwise the system
 * locale (Windows: the user's regional format; macOS: the region in System Settings). `PDOC_LOCALE`
 * overrides it, so tests run the same on every computer.
 */
export function paperLocale(systemLocale: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.PDOC_LOCALE) return env.PDOC_LOCALE;
  if (platform !== "win32") {
    const posix = env.LC_ALL || env.LC_PAPER;
    if (posix && !/^(C|POSIX)([._@]|$)/.test(posix)) return posix;
  }
  return systemLocale;
}

/** The system locale outside Electron (the CLI): what ICU reads from the operating system. */
export const nodeSystemLocale = (): string => Intl.DateTimeFormat().resolvedOptions().locale;
