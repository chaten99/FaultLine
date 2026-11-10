const browsers: Array<[RegExp, string]> = [
  [/edg(?:e|a|ios)?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/firefox|fxios/i, "Firefox"],
  [/chrome|crios|chromium/i, "Chrome"],
  [/safari/i, "Safari"],
];

const systems: Array<[RegExp, string]> = [
  [/windows/i, "Windows"],
  [/iphone|ipad|ipod/i, "iOS"],
  [/android/i, "Android"],
  [/mac os x|macintosh/i, "macOS"],
  [/cros/i, "ChromeOS"],
  [/linux|x11/i, "Linux"],
];

export const describeDevice = (userAgent: string | undefined | null): string => {
  if (!userAgent) return "Unknown device";
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = systems.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
};
