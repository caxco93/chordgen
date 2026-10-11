declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | boolean | null>) => void }
  }
}

/** Records a custom Umami event. Does nothing when the script is absent, e.g. in dev or behind an ad blocker. */
export function track(event: string, data?: Record<string, string | number | boolean | null>) {
  window.umami?.track(event, data)
}
