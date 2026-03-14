import { env } from '$env/dynamic/private';

/**
 * Minimal reference implementation for Strapi articles fetching.
 * Keeps only essential behavior: normalization, robust errors, lean->legacy fallback.
 */

// #region Config
const STRAPI_ORIGIN = env.STRAPI_API_ORIGIN?.trim();
const STRAPI_TOKEN = env.STRAPI_API_TOKEN?.trim();
const TIMEOUT_MS = Number(env.STRAPI_API_TIMEOUT_MS ?? 15000);

if (!STRAPI_ORIGIN) {
  throw new Error('STRAPI_API_ORIGIN is not set');
}

if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
  throw new Error('STRAPI_API_TIMEOUT_MS must be a positive number');
}

const ORIGIN = STRAPI_ORIGIN.replace(/\/+$/, '');
const API_URL = `${ORIGIN}/api/articles`;
const HEADERS = STRAPI_TOKEN ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : undefined;
// #endregion

// #region Types
/**
 * @typedef {{
 *   documentId: string;
 *   slug: string;
 *   title: string;
 *   excerpt: string;
 *   textBlocks: string[];
 *   cover: string;
 * }} Article
 */
// #endregion

// #region Normalizers
/** @param {unknown} value */
export const normalizeString = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

/** @param {unknown} media */
const resolveMediaUrl = (media) => {
  if (!media || typeof media !== 'object') return '';

  const raw = /** @type {Record<string, any>} */ (media);
  const nested = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const attrs = nested.attributes && typeof nested.attributes === 'object' ? nested.attributes : nested;
  const maybeUrl = attrs.url ?? raw.url ?? '';

  if (typeof maybeUrl !== 'string' || !maybeUrl.trim()) return '';
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
  return `${ORIGIN}${maybeUrl.startsWith('/') ? maybeUrl : `/${maybeUrl}`}`;
};

/** @param {unknown} value */
const normalizeRichText = (value) => {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];

  /**
   * @param {unknown} node
   * @returns {string}
   */
  const flatten = (node) => {
    if (!node || typeof node !== 'object') return '';

    const raw = /** @type {Record<string, any>} */ (node);
    if (typeof raw.text === 'string') return raw.text;
    if (!Array.isArray(raw.children)) return '';
    return raw.children.map(flatten).join('');
  };

  return value.map((block) => flatten(block).trim()).filter(Boolean);
};

/** @param {Record<string, any>} attrs */
const isPublished = (attrs) => {
  const publishedAt = normalizeString(attrs.publishedAt ?? attrs.published_at ?? '');
  if (publishedAt) return true;

  const status = normalizeString(attrs.status ?? attrs.Status ?? '').toLowerCase();
  if (!status) return true;
  return status === 'published' || status === 'live';
};

/** @param {unknown} item */
const normalizeArticle = (item) => {
  if (!item || typeof item !== 'object') return null;

  const raw = /** @type {Record<string, any>} */ (item);
  const attrs = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : raw;
  if (!isPublished(attrs)) return null;

  return {
    documentId: normalizeString(attrs.documentId ?? attrs.id ?? ''),
    slug: normalizeString(attrs.slug ?? attrs.Slug ?? attrs.documentId ?? attrs.id ?? ''),
    title: normalizeString(attrs.title ?? attrs.Title ?? ''),
    excerpt: normalizeString(attrs.excerpt ?? attrs.Excerpt ?? ''),
    textBlocks: normalizeRichText(attrs.text ?? attrs.Text ?? ''),
    cover: resolveMediaUrl(attrs.cover ?? attrs.Cover ?? null)
  };
};

/** @param {any} payload */
const normalizeArticleList = (payload) => {
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return list.map(normalizeArticle).filter(Boolean);
};

/**
 * @param {Article[]} articles
 * @param {string} slug
 * @returns {Article | undefined}
 */
export const findArticleBySlug = (articles, slug) => {
  const target = normalizeString(slug).toLowerCase();
  if (!target) return undefined;

  return articles.find((item) => {
    return item.slug.toLowerCase() === target || item.documentId.toLowerCase() === target;
  });
};
// #endregion

// #region QueryBuilders
const buildLeanListQuery = () => {
  const query = new URLSearchParams({
    publicationState: 'live',
    'sort[0]': 'publishedAt:desc'
  });

  query.set('fields[0]', 'documentId');
  query.set('fields[1]', 'slug');
  query.set('fields[2]', 'title');
  query.set('fields[3]', 'excerpt');
  query.set('populate[cover][fields][0]', 'url');

  return query.toString();
};

const buildLegacyListQuery = () => {
  const query = new URLSearchParams({
    publicationState: 'live',
    populate: '*',
    'sort[0]': 'publishedAt:desc'
  });

  return query.toString();
};

/** @param {string} slug */
const buildDetailQuery = (slug) => {
  const query = new URLSearchParams(buildLeanListQuery());
  query.set('fields[4]', 'text');
  query.set('pagination[pageSize]', '1');
  query.set('filters[slug][$eq]', slug);
  return query.toString();
};

/** @param {number} status @param {string} details */
const toStatusError = (status, details) => {
  if (status === 401) return `Доступ к Strapi API требует авторизацию (401)${details}.`;
  if (status === 403) return `Нет прав на чтение статей в Strapi (403)${details}.`;
  if (status >= 500) return `Strapi вернул серверную ошибку (${status})${details}.`;
  return `REST request failed with status ${status}${details}`;
};

/** @param {string} error */
const isInvalidKeyError = (error) => /status 400/i.test(error) && /invalid key/i.test(error);
// #endregion

// #region Request
/**
 * @param {typeof fetch} fetch
 * @param {string} queryString
 * @returns {Promise<{ payload: any; error: string }>}
 */
const request = async (fetch, queryString) => {
  const url = `${API_URL}?${queryString}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: HEADERS
    });

    if (!response.ok) {
      let details = '';

      try {
        const errorPayload = await response.json();
        const message = errorPayload?.error?.message;
        if (typeof message === 'string' && message.trim()) details = `: ${message}`;
      } catch {
        // ignore non-JSON error payloads
      }

      return {
        payload: null,
        error: toStatusError(response.status, details)
      };
    }

    return {
      payload: await response.json(),
      error: ''
    };
  } catch (caughtError) {
    if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
      return {
        payload: null,
        error: `Превышено время ожидания ответа Strapi (${TIMEOUT_MS} ms).`
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
// #endregion

// #region PublicAPI
/**
 * @param {typeof fetch} fetch
 * @returns {Promise<{ articles: Article[]; error: string }>}
 */
export const fetchPublishedArticles = async (fetch) => {
  const leanResult = await request(fetch, buildLeanListQuery());

  if (!leanResult.error) {
    return { articles: normalizeArticleList(leanResult.payload), error: '' };
  }

  if (!isInvalidKeyError(leanResult.error)) {
    return { articles: [], error: leanResult.error };
  }

  // Fallback keeps compatibility with Strapi schemas that reject strict fields.
  const legacyResult = await request(fetch, buildLegacyListQuery());

  if (legacyResult.error) {
    return { articles: [], error: legacyResult.error };
  }

  return { articles: normalizeArticleList(legacyResult.payload), error: '' };
};

/**
 * @param {typeof fetch} fetch
 * @param {string} slug
 * @returns {Promise<{ article: Article | null; error: string }>}
 */
export const fetchPublishedArticleBySlug = async (fetch, slug) => {
  const normalizedSlug = normalizeString(slug);
  if (!normalizedSlug) return { article: null, error: '' };

  const detailResult = await request(fetch, buildDetailQuery(normalizedSlug));

  if (detailResult.error && !isInvalidKeyError(detailResult.error)) {
    return { article: null, error: detailResult.error };
  }

  const direct = detailResult.error ? null : normalizeArticleList(detailResult.payload)[0] ?? null;
  if (direct) return { article: direct, error: '' };

  const listResult = await fetchPublishedArticles(fetch);
  if (listResult.error) return { article: null, error: listResult.error };

  return {
    article: findArticleBySlug(listResult.articles, normalizedSlug) ?? null,
    error: ''
  };
};
// #endregion
