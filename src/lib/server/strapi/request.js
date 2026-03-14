import {
  STRAPI_CACHE_TTL_MS,
  STRAPI_HEADERS,
  STRAPI_TIMEOUT_MS,
  buildArticlesUrl
} from './config';

/**
 * Process-local cache reduces repeated requests on a warm instance.
 * It is not shared across processes/containers.
 * @type {Map<string, { expiresAt: number; payload: any }>}
 */
const responseCache = new Map();

/**
 * @param {string} key
 */
const readFromCache = (key) => {
  if (STRAPI_CACHE_TTL_MS === 0) {
    return null;
  }

  const entry = responseCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return entry.payload;
};

/**
 * @param {string} key
 * @param {any} payload
 */
const writeToCache = (key, payload) => {
  if (STRAPI_CACHE_TTL_MS === 0) {
    return;
  }

  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + STRAPI_CACHE_TTL_MS
  });
};

/**
 * @param {Response} response
 */
const parseErrorDetails = async (response) => {
  try {
    const errorPayload = await response.json();
    const message = errorPayload?.error?.message;

    if (typeof message === 'string' && message.trim()) {
      return `: ${message}`;
    }
  } catch {
    // Ignore parse errors for non-JSON error payloads.
  }

  return '';
};

/**
 * @param {number} status
 * @param {string} details
 * @returns {string}
 */
const toStatusError = (status, details) => {
  if (status === 401) {
    return `Доступ к Strapi API требует авторизацию (401)${details}.`;
  }

  if (status === 403) {
    return `Нет прав на чтение статей в Strapi (403)${details}.`;
  }

  if (status >= 500) {
    return `Strapi вернул серверную ошибку (${status})${details}.`;
  }

  return `REST request failed with status ${status}${details}`;
};

/**
 * @param {string} error
 */
export const isInvalidQueryKeyError = (error) => {
  return /status 400/i.test(error) && /invalid key/i.test(error);
};

/**
 * @param {typeof fetch} fetch
 * @param {string} queryString
 * @param {string} cacheKey
 * @returns {Promise<{ payload: any; error: string }>}
 */
export const fetchArticlesPayload = async (fetch, queryString, cacheKey) => {
  const cachedPayload = readFromCache(cacheKey);
  if (cachedPayload) {
    return { payload: cachedPayload, error: '' };
  }

  const url = buildArticlesUrl(queryString);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STRAPI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: STRAPI_HEADERS
    });

    if (!response.ok) {
      const details = await parseErrorDetails(response);

      return {
        payload: null,
        error: toStatusError(response.status, details)
      };
    }

    const payload = await response.json();
    writeToCache(cacheKey, payload);

    return {
      payload,
      error: ''
    };
  } catch (caughtError) {
    if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
      return {
        payload: null,
        error: `Превышено время ожидания ответа Strapi (${STRAPI_TIMEOUT_MS} ms).`
      };
    }

    const message = caughtError instanceof Error ? caughtError.message : 'Unknown network error';

    return {
      payload: null,
      error: `API недоступен (${url}): ${message}`
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
