const buildBaseListQuery = () => {
  return new URLSearchParams({
    publicationState: 'live',
    'sort[0]': 'publishedAt:desc'
  });
};

/**
 * @param {URLSearchParams} query
 */
const appendLeanFields = (query) => {
  query.set('fields[0]', 'documentId');
  query.set('fields[1]', 'slug');
  query.set('fields[2]', 'title');
  query.set('fields[3]', 'excerpt');
  query.set('populate[cover][fields][0]', 'url');
};

const buildLeanListQuery = () => {
  const query = buildBaseListQuery();

  // Keep list payload minimal: only fields used in cards and links.
  appendLeanFields(query);

  return query;
};

const buildLegacyListQuery = () => {
  const query = buildBaseListQuery();
  query.set('populate', '*');
  return query;
};

export const LEAN_LIST_QUERY = buildLeanListQuery().toString();
export const LEGACY_LIST_QUERY = buildLegacyListQuery().toString();

/**
 * @param {string} slug
 */
export const buildSingleArticleQuery = (slug) => {
  const query = buildLeanListQuery();

  // Detail page additionally needs rich text and one record.
  query.set('fields[4]', 'text');
  query.set('pagination[pageSize]', '1');
  query.set('filters[slug][$eq]', slug);

  return query.toString();
};
