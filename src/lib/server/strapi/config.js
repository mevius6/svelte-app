import { env } from '$env/dynamic/private';

const rawOrigin = env.STRAPI_API_ORIGIN?.trim();
const rawToken = env.STRAPI_API_TOKEN?.trim();
const parsedTimeoutMs = Number(env.STRAPI_API_TIMEOUT_MS ?? 15000);
const parsedCacheTtlMs = Number(env.STRAPI_API_CACHE_TTL_MS ?? 60000);

if (!rawOrigin) {
  throw new Error('STRAPI_API_ORIGIN is not set');
}

if (!Number.isFinite(parsedTimeoutMs) || parsedTimeoutMs <= 0) {
  throw new Error('STRAPI_API_TIMEOUT_MS must be a positive number');
}

if (!Number.isFinite(parsedCacheTtlMs) || parsedCacheTtlMs < 0) {
  throw new Error('STRAPI_API_CACHE_TTL_MS must be a non-negative number');
}

export const STRAPI_ORIGIN = rawOrigin.replace(/\/+$/, '');
export const STRAPI_HEADERS = rawToken ? { Authorization: `Bearer ${rawToken}` } : undefined;
export const STRAPI_TIMEOUT_MS = parsedTimeoutMs;
export const STRAPI_CACHE_TTL_MS = parsedCacheTtlMs;
export const ARTICLES_ENDPOINT = '/api/articles';

/**
 * @param {string} queryString
 */
export const buildArticlesUrl = (queryString) => `${STRAPI_ORIGIN}${ARTICLES_ENDPOINT}?${queryString}`;
