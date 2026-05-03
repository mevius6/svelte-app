// @ts-nocheck
import { env } from '$env/dynamic/private';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CACHE_TTL_MS = 60000;
const DEFAULT_CACHE_MAX_ENTRIES = 128;

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseTimeoutMs = () => {
  const timeoutMs = toNumber(env.STRAPI_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  if (timeoutMs <= 0) {
    throw new Error('STRAPI_API_TIMEOUT_MS must be a positive number');
  }
  return timeoutMs;
};

const parseCacheTtlMs = () => {
  const cacheTtlMs = toNumber(env.STRAPI_API_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
  if (cacheTtlMs < 0) {
    throw new Error('STRAPI_API_CACHE_TTL_MS must be a non-negative number');
  }
  return cacheTtlMs;
};

const parseCacheMaxEntries = () => {
  const cacheMaxEntries = Math.floor(
    toNumber(env.STRAPI_API_CACHE_MAX_ENTRIES, DEFAULT_CACHE_MAX_ENTRIES)
  );
  if (cacheMaxEntries <= 0) {
    throw new Error('STRAPI_API_CACHE_MAX_ENTRIES must be a positive integer');
  }
  return cacheMaxEntries;
};

export const STRAPI_ORIGIN = env.STRAPI_API_ORIGIN?.trim().replace(/\/+$/, '') ?? '';
export const ARTICLES_ENDPOINT = '/api/articles';

export const getStrapiRuntimeConfig = () => {
  const rawOrigin = env.STRAPI_API_ORIGIN?.trim();
  if (!rawOrigin) {
    throw new Error('STRAPI_API_ORIGIN is not set');
  }

  const origin = rawOrigin.replace(/\/+$/, '');
  const token = env.STRAPI_API_TOKEN?.trim();

  return {
    origin,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    timeoutMs: parseTimeoutMs(),
    cacheTtlMs: parseCacheTtlMs(),
    cacheMaxEntries: parseCacheMaxEntries()
  };
};

/**
 * @param {string} queryString
 * @param {string} [origin]
 */
export const buildArticlesUrl = (queryString, origin = STRAPI_ORIGIN) => {
  return `${origin}${ARTICLES_ENDPOINT}?${queryString}`;
};
