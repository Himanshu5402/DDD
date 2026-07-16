// Shared visual metadata for tasks.

export const PRIORITY_COLOR = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'error',
};

export const STATUS_ACCENT = {
  todo: '#64748b',
  in_progress: '#4f46e5',
  in_review: '#0ea5e9',
  blocked: '#dc2626',
  done: '#16a34a',
};

export function initials(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

export function isOverdue(iso, status) {
  if (!iso || status === 'done') return false;
  return new Date(iso).getTime() < Date.now();
}

export function formatMinutes(mins = 0) {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ') || '0m';
}
