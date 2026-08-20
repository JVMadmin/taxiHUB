export function timeAgo(iso) {
  if (!iso) return "sin datos";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `hace ${diff} seg`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function elapsed(iso) {
  if (!iso) return "00:00:00";
  let s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  s %= 3600;
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
