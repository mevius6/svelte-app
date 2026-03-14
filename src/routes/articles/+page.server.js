import { fetchPublishedArticles } from '$lib/server/strapi/articles';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  return fetchPublishedArticles(fetch);
}
