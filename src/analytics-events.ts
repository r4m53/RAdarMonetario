export function trackEvent(name: string, parameters: Record<string, string | number | boolean> = {}) {
  if (!window.gtag) return;
  window.gtag("event", name, parameters);
}
