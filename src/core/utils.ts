export const scopes: Record<string, string[]> = {
  user: [
    "users:chat",
    "patient:read",
    "patient:write",
    "patient:update",
    "monitoring:read",
    "monitoring:write",
    "monitoring:update",
    "appointment:read",
    "appointment:write",
    "appointment:update",
    "medication:read",
    "medication:write",
    "medication:update",
    "medication:delete",
    "booking:read",
    "booking:write",
  ],
  doctor: [
    "users:chat",
    "patient:read",
    "doctor:read",
    "doctor:update",
    "doctor:analytics",
    "monitoring:read",
    "medication:read",
    "medication:update",
    "appointment:read",
    "appointment:write",
    "appointment:update",
    "medication:delete",
    "practice:read",
    "practice:write",
    "practice:admin",
    "schedule:read",
    "schedule:write",
    "booking:read",
    "booking:write",
    "booking:update",
  ],
  admin: [
    "users:chat",
    "users:read",
    "users:write",
    "users:update",
    "users:delete",
    "doctor:analytics",
    "appointment:read",
    "appointment:write",
    "appointment:update",
    "appointment:delete",
    "monitoring:read",
    "monitoring:delete",
    "medication:read",
    "medication:delete",
    "practice:read",
    "practice:write",
    "practice:admin",
    "schedule:read",
    "schedule:write",
    "booking:read",
    "booking:write",
    "booking:update",
  ],
  practice_owner: [
    "practice:read",
    "practice:write",
    "practice:admin",
    "schedule:read",
    "schedule:write",
    "booking:read",
    "booking:write",
    "booking:update",
    "users:chat",
    "doctor:read",
    "doctor:update",
  ],
  practice_admin: [
    "practice:read",
    "practice:admin",
    "schedule:read",
    "schedule:write",
    "booking:read",
    "booking:write",
    "booking:update",
    "users:chat",
  ],
  practice_staff: [
    "practice:read",
    "schedule:read",
    "booking:read",
    "booking:update",
    "users:chat",
  ],
};

export const statusPriorityMap = [
  {
    upcoming: 1,
    resheduled: 2,
    missed: 3,
    completed: 4,
    cancelled: 5,
  },
  {
    resheduled: 1,
    upcoming: 2,
    missed: 3,
    completed: 4,
    cancelled: 5,
  },
  {
    missed: 1,
    resheduled: 2,
    upcoming: 3,
    completed: 4,
    cancelled: 5,
  },
  {
    completed: 1,
    missed: 2,
    resheduled: 3,
    upcoming: 4,
    cancelled: 5,
  },
  {
    cancelled: 1,
    completed: 2,
    missed: 3,
    resheduled: 4,
    upcoming: 5,
  },
];

export function calculateAge(birthDateStr?: string | null): number | undefined {
  if (!birthDateStr) return undefined;
  const [month, day, year] = birthDateStr.split("/").map(Number);
  if (!month || !day || !year) return undefined;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return ageFromDate(parsed);
}

function ageFromDate(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age;
}

export function getAgeGroup(age: number | undefined): string {
  if (age === undefined) return "firey";
  if (age >= 18 && age <= 24) return "18-24";
  if (age >= 25 && age <= 34) return "25-34";
  if (age >= 35 && age <= 44) return "35-44";
  if (age >= 45 && age <= 54) return "45-54";
  if (age >= 55 && age <= 64) return "55-64";
  if (age >= 65) return "65+";
  return "firey";
}

export class Custom {
  static snakeToTitle(snakeStr: string): string {
    return snakeStr
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  static convertListToStr(items: string[]): string {
    if (items.length > 1) {
      return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
    }
    return items[0] ?? "";
  }
}

export function noneExcluded<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.values(obj).every(
    (value) => value === null || value === undefined,
  );
}
