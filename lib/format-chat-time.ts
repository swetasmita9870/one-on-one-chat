function toDate(date: string | number | Date) {
  return date instanceof Date ? date : new Date(date);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function calendarDaysBefore(messageDate: Date, now: Date) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMessageDay = new Date(messageDate);
  startOfMessageDay.setHours(0, 0, 0, 0);
  return (startOfToday.getTime() - startOfMessageDay.getTime()) / 86400000;
}

export function formatChatListTime(date: string | number | Date): string {
  const messageDate = toDate(date);
  const now = new Date();
  if (isNaN(messageDate.getTime())) return "";

  if (isSameDay(messageDate, now)) {
    return messageDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(messageDate, yesterday)) return "Yesterday";

  const days = calendarDaysBefore(messageDate, now);
  if (days > 1 && days < 7) {
    return messageDate.toLocaleDateString("en-IN", { weekday: "long" });
  }

  return messageDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatMessageTime(date: string | number | Date): string {
  const value = toDate(date);
  if (isNaN(value.getTime())) return "";
  return value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatChatDay(date: string | number | Date): string {
  const value = toDate(date);
  const now = new Date();
  if (isNaN(value.getTime())) return "";
  if (isSameDay(value, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(value, yesterday)) return "Yesterday";
  return value.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function formatLastSeen(date: string | number | Date): string {
  const value = toDate(date);
  if (isNaN(value.getTime())) return "";
  const time = formatMessageTime(value);
  const now = new Date();
  if (isSameDay(value, now)) return `last seen today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(value, yesterday)) return `last seen yesterday at ${time}`;
  const days = calendarDaysBefore(value, now);
  if (days > 1 && days < 7) {
    const weekday = value.toLocaleDateString("en-IN", { weekday: "long" });
    return `last seen ${weekday} at ${time}`;
  }
  return `last seen ${value.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}
