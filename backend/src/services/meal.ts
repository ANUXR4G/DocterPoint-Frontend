import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { uuidToBase64 } from "../core/security.js";
import { getCachedJson } from "../db/redis.js";
import type { RedisClient, SessionUser } from "../types/index.js";

function mealData(meal: {
  id: string;
  name: string;
  category: string;
  description: string;
  ingredients: unknown;
  time: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  blog: string;
  imgSrc: string;
  cookingType: string | null;
  cuisine: string | null;
}) {
  return {
    id: uuidToBase64(meal.id),
    name: meal.name,
    category: meal.category,
    description: meal.description,
    ingredients: meal.ingredients,
    time: meal.time,
    calories: meal.calories,
    protein: meal.protein,
    fat: meal.fat,
    carbs: meal.carbs,
    blog: meal.blog,
    img_src: meal.imgSrc,
    cooking_type: meal.cookingType,
    cuisine: meal.cuisine,
  };
}

export class MealService {
  static async retrieveAll(
    sessionUser: SessionUser,
    redis: RedisClient,
    q?: string,
    page = 1,
    limit = 10,
    category?: string,
  ) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const patientId = uuidToBase64(sessionUser.id);
    const redisMedicationKey = `patients:medications:${patientId}`;

    let ingredients: string[] | null = null;
    let allergies: string[] | null = null;
    let preferredCuisine: string | null = null;

    const cachedMedication = await getCachedJson<Record<string, unknown>>(redisMedicationKey);
    if (cachedMedication) {
      ingredients = (cachedMedication.recommended_ingredients as string[]) ?? null;
      allergies = (cachedMedication.allergies as string[]) ?? null;
      preferredCuisine = (cachedMedication.preferred_cuisine as string) ?? null;
    } else {
      const medication = await prisma.medication.findFirst({
        where: { patientId: sessionUser.id },
        select: {
          allergies: true,
          recommendedIngredients: true,
          preferredCuisine: true,
        },
      });
      ingredients = (medication?.recommendedIngredients as string[]) ?? null;
      allergies = (medication?.allergies as string[]) ?? null;
      preferredCuisine = medication?.preferredCuisine ?? null;
    }

    const andConditions: Record<string, unknown>[] = [];

    if (q) {
      andConditions.push({ name: { contains: q, mode: "insensitive" } });
    }

    if (category && !q) {
      andConditions.push({ category });
    }

    if (ingredients?.length && !q) {
      for (const ingredient of ingredients) {
        andConditions.push({
          ingredients: { array_contains: [ingredient] },
        });
      }
    }

    if (allergies?.length && !q) {
      for (const ingredient of allergies) {
        andConditions.push({
          NOT: {
            ingredients: { array_contains: [ingredient] },
          },
        });
      }
    }

    if (preferredCuisine && !q && preferredCuisine !== "All") {
      andConditions.push({ cuisine: preferredCuisine });
    }

    const where = andConditions.length ? { AND: andConditions } : {};

    const [total, meals] = await Promise.all([
      prisma.meal.count({ where }),
      prisma.meal.findMany({
        where,
        orderBy: { updatedAt: "asc" },
        skip: offset,
        take: limit,
      }),
    ]);

    return {
      total,
      meals: meals.map(mealData),
    };
  }
}
