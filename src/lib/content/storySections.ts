/**
 * Story sections (from CMS / Strapi)
 *
 * Each section owns the title text rendered through the landscape MSDF title pipeline.
 */

export type StorySection = {
  id: string
  titleText: string
}

// mock data for now, eventually to be fetched from Strapi API
// export const STORY_SECTIONS: StorySection[] = [
//   { id: "pt-1", titleText: "Введение" }, // Вступление / intro
//   { id: "pt-2", titleText: "История места" },
//   { id: "pt-3", titleText: "Рождение парка" }, // Как рождался парк
//   { id: "pt-4", titleText: "Возрождение" }, // Реновация
//   { id: "pt-5", titleText: "Северный микрорайон" }, // и улицы вокруг парка
//   { id: "pt-6", titleText: "Дворовое детство" }, // игры и секреты счастья
//   { id: "pt-7", titleText: "Парк как семья" },
//   { id: "pt-8", titleText: "Флора и фауна" }, // Заключение / Эпилог
// ]
export const STORY_SECTIONS: StorySection[] = [
  // { id: "clean-ponds", titleText: "ЧИСТЫЕ ПРУДЫ" },
  { id: "pt-1", titleText: "1" },
  { id: "pt-2", titleText: "2" },
  { id: "pt-3", titleText: "3" },
  { id: "pt-4", titleText: "4" },
  { id: "pt-5", titleText: "5" },
  { id: "pt-6", titleText: "6" },
  { id: "pt-7", titleText: "7" },
  { id: "pt-8", titleText: "8" },
]
