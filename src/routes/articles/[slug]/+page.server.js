import { error } from '@sveltejs/kit';
import {
  fetchPublishedArticleBySlug,
  normalizeString
} from '$lib/server/strapi/articles';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params }) {
  const slug = normalizeString(params.slug);

  if (!slug) {
    throw error(404, 'Статья не найдена');
  }

  // Query one article by slug to avoid loading the whole collection on detail pages.
  const { article, error: loadError } = await fetchPublishedArticleBySlug(fetch, slug);

  if (loadError) {
    return {
      article: null,
      error: loadError
    };
  }

  if (!article) {
    throw error(404, `Статья "${slug}" не найдена`);
  }

  return {
    article,
    error: ''
  };
}
