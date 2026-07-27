// src/lib/data/episodes.ts

export type Slide = {
  image: string;        // путь к картинке, например "/images/episode-1/00.jpg"
  alt?: string;
  caption?: string;
  width: number;        // исходная ширина
  height: number;       // исходная высота
};

export type Episode = {
  id: number;
  slug: string;         // "episode-1"
  title: string;
  description: string;
  audioUrl: string;     // URL аудиофайла
  coverUrl: string;     // обложка серии
  duration: string;     // "18:42"
  order: number;        // порядок показа
  carousel: Slide[];    // всегда массив, даже если пустой
};

export const episodes: Episode[] = [
  {
    id: 1,
    slug: 'episode-1',
    title: 'Серия 1. Начало',
    description: 'Первая часть аудиоспектакля.',
    audioUrl: 'https://cdn.example.com/audio/episode-1.mp3',
    coverUrl: '/images/episode-1/cover.jpg',
    duration: '18:42',
    order: 1,
    carousel: [
      {
        image: '/images/episode-01/00.jpg',
        alt: 'Кадр 0',
        caption: 'Сцена у окна',
        width: 1600,
        height: 900
      },
      {
        image: '/images/episode-01/01.jpg',
        alt: 'Кадр 1',
        caption: 'Ночной коридор',
        width: 1600,
        height: 900
      }
    ]
  },

  {
    id: 2,
    slug: 'episode-2',
    title: 'Серия 2. Развитие',
    description: 'Вторая часть аудиоспектакля.',
    audioUrl: 'https://cdn.example.com/audio/episode-2.mp3',
    coverUrl: '/images/episode-2/00.jpg',
    duration: '21:05',
    order: 2,
    carousel: []
  }

  // остальные 6 эпизодов…
];
