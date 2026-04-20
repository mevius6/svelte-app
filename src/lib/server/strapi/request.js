import {
  getStrapiRuntimeConfig,
  buildArticlesUrl
} from './config';

/**
 * Process-local cache reduces repeated requests on a warm instance.
 * It is not shared across processes/containers.
 * @type {Map<string, { expiresAt: number; payload: any }>}
 */
const responseCache = new Map();
/**
 * In-flight dedupe for concurrent identical requests.
 * @type {Map<string, Promise<{ payload: any; error: string }>>}
 */
const inFlightRequests = new Map();

/**
 * @param {string} key
 * @param {number} cacheTtlMs
 */
const readFromCache = (key, cacheTtlMs) => {
  if (cacheTtlMs === 0) {
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

  // Promote entry to MRU position.
  responseCache.delete(key);
  responseCache.set(key, entry);

  return entry.payload;
};

/**
 * @param {string} key
 * @param {any} payload
 * @param {number} cacheTtlMs
 * @param {number} cacheMaxEntries
 */
const writeToCache = (key, payload, cacheTtlMs, cacheMaxEntries) => {
  if (cacheTtlMs === 0) {
    return;
  }

  if (responseCache.has(key)) {
    responseCache.delete(key);
  }

  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + cacheTtlMs
  });

  while (responseCache.size > cacheMaxEntries) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    responseCache.delete(oldestKey);
  }
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
  let runtime;
  try {
    runtime = getStrapiRuntimeConfig();
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Strapi config is invalid';
    console.error('[strapi] configuration error', { message });
    return {
      payload: null,
      error: 'Strapi API не настроен. Проверьте серверную конфигурацию.'
    };
  }

  const cachedPayload = readFromCache(cacheKey, runtime.cacheTtlMs);
  if (cachedPayload) {
    return { payload: cachedPayload, error: '' };
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = (async () => {
    const url = buildArticlesUrl(queryString, runtime.origin);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), runtime.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: runtime.headers
      });

      if (!response.ok) {
        const details = await parseErrorDetails(response);

        return {
          payload: null,
          error: toStatusError(response.status, details)
        };
      }

      const payload = await response.json();
      writeToCache(cacheKey, payload, runtime.cacheTtlMs, runtime.cacheMaxEntries);

      return {
        payload,
        error: ''
      };
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return {
          payload: null,
          error: `Превышено время ожидания ответа Strapi (${runtime.timeoutMs} ms).`
        };
      }

      const message = caughtError instanceof Error ? caughtError.message : 'Unknown network error';
      console.error('[strapi] request failed', {
        url,
        message,
        cacheKey
      });

      return {
        payload: null,
        error: `API недоступен: ${message}`
      };
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
};
