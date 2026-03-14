// #region Imports
import {
  findArticleBySlug,
  normalizeArticleList,
  normalizeString
} from './normalizers';
import {
  LEAN_LIST_QUERY,
  LEGACY_LIST_QUERY,
  buildSingleArticleQuery
} from './queries';
import {
  fetchArticlesPayload,
  isInvalidQueryKeyError
} from './request';
// #endregion

// #region ReExports
export { findArticleBySlug, normalizeString };
// #endregion

// #region PublicAPI
/**
 * @param {typeof fetch} fetch
 * @returns {Promise<{ articles: ReturnType<typeof normalizeArticleList>; error: string }>}
 */
export const fetchPublishedArticles = async (fetch) => {
  const leanResult = await fetchArticlesPayload(
    fetch,
    LEAN_LIST_QUERY,
    `articles:list:lean:${LEAN_LIST_QUERY}`
  );

  if (!leanResult.error) {
    return {
      articles: normalizeArticleList(leanResult.payload),
      error: ''
    };
  }

  if (!isInvalidQueryKeyError(leanResult.error)) {
    return {
      articles: [],
      error: leanResult.error
    };
  }

  // Fallback for Strapi schemas where strict fields do not match API keys.
  const legacyResult = await fetchArticlesPayload(
    fetch,
    LEGACY_LIST_QUERY,
    `articles:list:legacy:${LEGACY_LIST_QUERY}`
  );

  if (legacyResult.error) {
    return {
      articles: [],
      error: legacyResult.error
    };
  }

  return {
    articles: normalizeArticleList(legacyResult.payload),
    error: ''
  };
};

/**
 * @param {typeof fetch} fetch
 * @param {string} slug
 * @returns {Promise<{ article: ReturnType<typeof normalizeArticleList>[number] | null; error: string }>}
 */
export const fetchPublishedArticleBySlug = async (fetch, slug) => {
  const normalizedSlug = normalizeString(slug);

  if (!normalizedSlug) {
    return {
      article: null,
      error: ''
    };
  }

  // Fast path: one record by slug instead of full collection fetch.
  const detailQuery = buildSingleArticleQuery(normalizedSlug);
  const detailResult = await fetchArticlesPayload(fetch, detailQuery, `articles:slug:${normalizedSlug}`);

  if (detailResult.error && !isInvalidQueryKeyError(detailResult.error)) {
    return {
      article: null,
      error: detailResult.error
    };
  }

  const directMatch = detailResult.error ? null : normalizeArticleList(detailResult.payload)[0] ?? null;
  if (directMatch) {
    return {
      article: directMatch,
      error: ''
    };
  }

  // Fallback handles legacy documentId links and non-queryable slug setups.
  const listResult = await fetchPublishedArticles(fetch);
  if (listResult.error) {
    return {
      article: null,
      error: listResult.error
    };
  }

  return {
    article: findArticleBySlug(listResult.articles, normalizedSlug) ?? null,
    error: ''
  };
};
// #endregion
