declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | boolean | null>) => void }
  }
}

/** Records a custom Umami event. Does nothing when the script is absent, e.g. in dev or behind an ad blocker. */
export function track(event: string, data?: Record<string, string | number | boolean | null>) {
  window.umami?.track(event, data)
}

/** Seconds of active time on the page at which an `engagement-time` event is sent. */
const MILESTONES_SECONDS = [10, 30, 60, 120, 300, 600, 1200, 1800]

/** Sends an `engagement-time` event each time the page has been visible for another milestone's worth of seconds. */
export function trackEngagementTime() {
  let activeSeconds = 0
  let nextMilestone = 0
  const timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    activeSeconds++
    if (activeSeconds < MILESTONES_SECONDS[nextMilestone]!) return
    track('engagement-time', { seconds: MILESTONES_SECONDS[nextMilestone]! })
    nextMilestone++
    if (nextMilestone === MILESTONES_SECONDS.length) clearInterval(timer)
  }, 1000)
}
