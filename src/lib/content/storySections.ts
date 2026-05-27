/**
 * Story sections (from CMS / Strapi)
 *
 * Eventually these will come from a Strapi API, but for now we use dummy data.
 * Each section owns the title text rendered through the landscape MSDF title pipeline.
 */

export type StorySection = {
  id: string
  titleText: string
}

export const STORY_SECTIONS: StorySection[] = [
  // { id: "clean-ponds", titleText: "ЧИСТЫЕ ПРУДЫ" },
  { id: "pt-1", titleText: "Введение" }, // Вступление / intro
  { id: "pt-2", titleText: "История места" },
  { id: "pt-3", titleText: "Рождение парка" }, // Как рождался парк
  { id: "pt-4", titleText: "Возрождение" }, // Реновация, как парк стал таким, какой он есть сейчас
  { id: "pt-5", titleText: "Северный микрорайон" }, // и улицы вокруг парка
  { id: "pt-6", titleText: "Дворовое детство" }, // игры и секреты счастья
  { id: "pt-7", titleText: "Парк как семья" },
  { id: "pt-8", titleText: "Флора и фауна" }, // Заключение / Эпилог
]
