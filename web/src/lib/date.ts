export function toDateInput(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateInput(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
}

export function toDatetimeLocal(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}
