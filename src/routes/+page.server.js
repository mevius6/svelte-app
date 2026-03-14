import { fetchPublishedArticles } from '$lib/server/strapi/articles';

/**
 * @param {{ slug: string; documentId: string; title: string }} article
 */
const toNavItem = (article) => {
  const slug = article.slug || article.documentId;
  const href = slug ? `/articles/${encodeURIComponent(slug)}` : '/articles';
  const label = article.title || 'Статья';

  return {
    href,
    label,
    ariaLabel: `Открыть статью: ${label}`
  };
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  const { articles, error } = await fetchPublishedArticles(fetch);

  return {
    navItems: articles.map(toNavItem),
    navError: error
  };
}
