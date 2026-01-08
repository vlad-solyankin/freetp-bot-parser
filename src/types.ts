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
