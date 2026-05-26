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
  // { id: "clean-ponds", text: "ЧИСТЫЕ ПРУДЫ" },
  { id: "pt-1", text: "Введение" }, // Вступление / intro
  { id: "pt-2", text: "История места" },
  { id: "pt-3", text: "Рождение парка" }, // Как рождался парк
  { id: "pt-4", text: "Возрождение" }, // Реновация, как парк стал таким, какой он есть сейчас
  { id: "pt-5", text: "Северный микрорайон" }, // и улицы вокруг парка
  { id: "pt-6", text: "Дворовое детство" }, // игры и секреты счастья
  { id: "pt-7", text: "Парк как семья" },
  { id: "pt-8", text: "Флора и фауна" } // Заключение / Эпилог
];
