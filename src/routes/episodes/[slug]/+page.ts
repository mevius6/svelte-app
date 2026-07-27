import { error } from '@sveltejs/kit';
import episodes from '$lib/content/data.json';
// —or—
// import { episodes } from '$lib/content/episodes';
// import type { Episode } from '$lib/content/episodes';

export type Slide = {
  image: string;
  alt?: string;
  caption?: string;
  width: number;
  height: number;
};

export type Episode = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  audioUrl: string;
  coverUrl: string;
  duration: string;
  order: number;
  carousel?: Slide[];
};

export function load({ params }) {
  const episode = (episodes as Episode[]).find((item) => item.slug === params.slug);

  if (!episode) {
    throw error(404, 'Episode not found');
  }

  const sorted = [...(episodes as Episode[])].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((item) => item.slug === params.slug);

  return {
    episode,
    prev: sorted[index - 1] ?? null,
    next: sorted[index + 1] ?? null
  };
}
