/**
 * Hero title items (from CMS / Strapi)
 *
 * Eventually these will come from a Strapi API, but for now we use dummy data.
 * Each item represents a renderable hero title for the landscape scene.
 */

export type HeroTitleItem = {
  id: string;        // Stable key from Strapi
  text: string;      // Hero title text (will be rendered via MSDF)
};

export const HERO_TITLES: HeroTitleItem[] = [
  { id: "clean-ponds", text: "ЧИСТЫЕ ПРУДЫ" },
  { id: "night-waves", text: "НОЧНЫЕ ВОЛНЫ" },
  { id: "dawn-glow", text: "РАССВЕТНЫЙ ЛУЧ" },
];
