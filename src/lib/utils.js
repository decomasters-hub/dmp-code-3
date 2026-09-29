let n = 100;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${(n++).toString(36)}`;
export const now = () => Date.now();
export const timeLabel = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
export const dayLabel = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
