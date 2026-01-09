/**
 * Типы данных для игры с freetp.org
 */

export interface Game {
  id: string; // ID игры из URL или заголовка
  title: string; // Название игры
  url: string; // Ссылка на страницу игры
  updateDate: string; // Дата обновления
  description: string; // Краткое описание
  genres: string[]; // Жанры игры
  author: string; // Автор публикации
  publishDate: string; // Дата публикации
}

export interface ParsedGames {
  games: Game[];
  lastCheck: Date;
}

/**
 * Типы данных для бесплатных игр Epic Games Store
 */
export interface EpicGame {
  id: string; // Offer ID из Epic Games
  title: string; // Название игры
  namespace: string; // Namespace игры
  description: string; // Описание игры
  imageUrl?: string; // URL изображения игры
  url: string; // Ссылка на страницу игры в Epic Games Store
  startDate: string; // Дата начала раздачи
  endDate: string; // Дата окончания раздачи
  originalPrice?: string; // Оригинальная цена (если была)
  publisher?: string; // Издатель
  developer?: string; // Разработчик
}
