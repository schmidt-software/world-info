// Date formatting shared by the tooltip and the event list.

export function formatTime(date) {
  return date.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

// "12 min ago", "3 h ago", "2 days ago", or "in 30 min" for upcoming events.
export function formatAge(date, now = Date.now()) {
  const signedMinutes = Math.round((now - date.getTime()) / 60000);
  const minutes = Math.abs(signedMinutes);
  const hours = Math.round(minutes / 60);
  const span = minutes < 60 ? `${minutes} min` : hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
  return signedMinutes < 0 ? `in ${span}` : `${span} ago`;
}
