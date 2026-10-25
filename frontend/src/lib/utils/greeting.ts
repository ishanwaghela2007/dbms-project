/**
 * Returns a time-sensitive greeting string based on the current local hour.
 *
 * 05:00–11:59  → Good morning
 * 12:00–16:59  → Good afternoon
 * 17:00–20:59  → Good evening
 * 21:00–04:59  → Good night
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

/**
 * Returns a short contextual description to go with the greeting,
 * e.g. shown as the dashboard subtitle.
 */
export function getGreetingDescription(role: "admin" | "teacher" | "student"): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    if (role === "admin") return "Here's what's happening across your campus today.";
    if (role === "teacher") return "Ready to make today's classes count.";
    return "Start your day by reviewing your attendance and upcoming deadlines.";
  }
  if (hour >= 12 && hour < 17) {
    if (role === "admin") return "Afternoon check-in — here's your campus overview.";
    if (role === "teacher") return "Keep the momentum going — your students are counting on you.";
    return "Afternoon update — check your results and notifications.";
  }
  if (hour >= 17 && hour < 21) {
    if (role === "admin") return "Evening wrap-up — review any pending campus actions.";
    if (role === "teacher") return "Wind down — review today's attendance and plan for tomorrow.";
    return "Evening check — catch up on anything you missed today.";
  }
  // Late night / early morning
  if (role === "admin") return "Burning the midnight oil — here's your campus snapshot.";
  if (role === "teacher") return "Late-night session — your workspace is ready when you are.";
  return "Studying late? Here's your academic overview.";
}
