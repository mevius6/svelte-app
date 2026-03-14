import { STRAPI_ORIGIN } from './config';

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

/**
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeString = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
};

/**
 * @param {unknown} media
 * @returns {string}
 */
const resolveMediaUrl = (media) => {
  if (!media || typeof media !== 'object') {
    return '';
  }

  const raw = /** @type {Record<string, any>} */ (media);
  const nested = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const attrs = nested.attributes && typeof nested.attributes === 'object' ? nested.attributes : nested;
  const maybeUrl = attrs.url ?? raw.url ?? '';

  if (typeof maybeUrl !== 'string' || !maybeUrl.trim()) {
    return '';
  }

  if (/^https?:\/\//i.test(maybeUrl)) {
    return maybeUrl;
  }

  return `${STRAPI_ORIGIN}${maybeUrl.startsWith('/') ? maybeUrl : `/${maybeUrl}`}`;
};

/**
 * Convert Strapi rich text blocks into plain paragraph strings.
 * @param {unknown} value
 * @returns {string[]}
 */
const normalizeRichText = (value) => {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  /**
   * @param {unknown} node
   * @returns {string}
   */
  const flattenText = (node) => {
    if (!node || typeof node !== 'object') {
      return '';
    }

    const raw = /** @type {Record<string, any>} */ (node);

    if (typeof raw.text === 'string') {
      return raw.text;
    }

    if (!Array.isArray(raw.children)) {
      return '';
    }

    return raw.children.map(flattenText).join('');
  };

  return value
    .map((block) => flattenText(block).trim())
    .filter((paragraph) => paragraph.length > 0);
};

/**
 * @param {Record<string, any>} attrs
 */
const isPublished = (attrs) => {
  const publishedAt = normalizeString(attrs.publishedAt ?? attrs.published_at ?? '');
  if (publishedAt) {
    return true;
  }

  const status = normalizeString(attrs.status ?? attrs.Status ?? '').toLowerCase();
  if (!status) {
    return true;
  }

  return status === 'published' || status === 'live';
};

/**
 * @param {unknown} item
 * @returns {Article | null}
 */
const normalizeArticle = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const raw = /** @type {Record<string, any>} */ (item);
  const attrs = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : raw;

  if (!isPublished(attrs)) {
    return null;
  }

  return {
    documentId: normalizeString(attrs.documentId ?? attrs.id ?? ''),
    slug: normalizeString(attrs.slug ?? attrs.Slug ?? attrs.documentId ?? attrs.id ?? ''),
    title: normalizeString(attrs.title ?? attrs.Title ?? ''),
    excerpt: normalizeString(attrs.excerpt ?? attrs.Excerpt ?? ''),
    textBlocks: normalizeRichText(attrs.text ?? attrs.Text ?? ''),
    cover: resolveMediaUrl(attrs.cover ?? attrs.Cover ?? null)
  };
};

/**
 * @param {any} payload
 * @returns {Article[]}
 */
export const normalizeArticleList = (payload) => {
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

  if (!target) {
    return undefined;
  }

  return articles.find((item) => {
    return item.slug.toLowerCase() === target || item.documentId.toLowerCase() === target;
  });
};
