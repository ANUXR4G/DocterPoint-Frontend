import { Redis } from "ioredis";
import { settings } from "../config/index.js";
import type { RedisClient } from "../types/index.js";

let redisClient: RedisClient | null = null;
let redisUnavailable = false;

export function getRedis(): RedisClient {
  if (!redisClient) {
    redisClient = new Redis({
      host: settings.redisHost,
      port: settings.redisPort,
      password: settings.redisPassword || undefined,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      retryStrategy: (attempt) => (attempt > 2 ? null : attempt * 250),
    });

    redisClient.on("error", (error) => {
      redisUnavailable = true;
      console.warn("[redis] unavailable:", error.message);
    });

    redisClient.on("connect", () => {
      redisUnavailable = false;
    });
  }

  return redisClient;
}

async function withRedis<T>(
  operation: (redis: RedisClient) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (redisUnavailable) return fallback;

  try {
    const redis = getRedis();
    return await operation(redis);
  } catch (error) {
    redisUnavailable = true;
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn("[redis] cache skipped:", message);
    return fallback;
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  return withRedis(async (redis) => {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  }, null);
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSeconds = 3600,
): Promise<void> {
  await withRedis(async (redis) => {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }, undefined);
}

export async function deleteCachedKeys(patterns: string[]): Promise<void> {
  await withRedis(async (redis) => {
    const keys = new Set<string>();
    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        const matched = await redis.keys(pattern);
        matched.forEach((key: string) => keys.add(key));
      } else {
        keys.add(pattern);
      }
    }
    if (keys.size > 0) {
      await redis.del(...Array.from(keys));
    }
  }, undefined);
}

export async function deleteCachedKey(key: string): Promise<void> {
  await deleteCachedKeys([key]);
}
