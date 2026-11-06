function minutes(value: string | null | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isAgendaEventNow(occurrence: string, startTime: string, endTime: string, now: Date): boolean {
  const start = minutes(startTime);
  const end = minutes(endTime);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (!startTime && !endTime) return occurrence === dateKey(today);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (end < start) {
    return (occurrence === dateKey(today) && current >= start) || (occurrence === dateKey(yesterday) && current <= end);
  }
  return occurrence === dateKey(today) && current >= start && current <= end;
}

export function isAgendaEventPast(occurrence: string, startTime: string, endTime: string, now: Date): boolean {
  const start = minutes(startTime);
  const end = minutes(endTime);
  const today = dateKey(now);
  if (occurrence > today) return false;
  if (occurrence < today) return !isAgendaEventNow(occurrence, startTime, endTime, now);
  if (end === null || (start !== null && end < start)) return false;
  return now.getHours() * 60 + now.getMinutes() > end;
}
