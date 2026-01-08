import * as fs from 'fs';
import * as path from 'path';
import { Game } from './types';

/**
 * Простое файловое хранилище для списка известных игр
 * В продакшене можно заменить на БД (SQLite, PostgreSQL и т.д.)
 */
const STORAGE_FILE = path.join(__dirname, '../data/games.json');

export class GameStorage {
  private games: Map<string, Game> = new Map();

  constructor() {
    this.load();
  }

  /**
   * Загрузить данные из файла
   */
  private load(): void {
    try {
      // Создать директорию, если её нет
      const dataDir = path.dirname(STORAGE_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Загрузить данные, если файл существует
      if (fs.existsSync(STORAGE_FILE)) {
        const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const gamesArray: any[] = JSON.parse(data);
        
        // Миграция: преобразуем старые данные (category -> genres)
        const migratedGames = gamesArray.map(game => {
          // Если есть category, но нет genres, создаем genres из category
          if (game.category && (!game.genres || game.genres.length === 0)) {
            game.genres = [game.category];
            delete game.category;
          }
          // Если нет ни category, ни genres
          if (!game.genres || game.genres.length === 0) {
            game.genres = ['Не указано'];
          }
          return game as Game;
        });
        
        this.games = new Map(migratedGames.map(game => [game.id, game]));
      }
    } catch (error) {
      console.error('Ошибка при загрузке данных:', error);
      this.games = new Map();
    }
  }

  /**
   * Сохранить данные в файл
   */
  private save(): void {
    try {
      const gamesArray = Array.from(this.games.values());
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(gamesArray, null, 2), 'utf-8');
    } catch (error) {
      console.error('Ошибка при сохранении данных:', error);
    }
  }

  /**
   * Получить все известные игры
   */
  getAllGames(): Game[] {
    return Array.from(this.games.values());
  }

  /**
   * Проверить, существует ли игра
   */
  hasGame(gameId: string): boolean {
    return this.games.has(gameId);
  }

  /**
   * Добавить новую игру
   */
  addGame(game: Game): void {
    this.games.set(game.id, game);
    this.save();
  }

  /**
   * Добавить несколько игр
   */
  addGames(games: Game[]): void {
    games.forEach(game => this.games.set(game.id, game));
    this.save();
  }

  /**
   * Найти новые игры (которых ещё нет в хранилище)
   */
  findNewGames(games: Game[]): Game[] {
    return games.filter(game => !this.games.has(game.id));
  }

  /**
   * Получить последние N игр
   */
  getLatestGames(count: number = 10): Game[] {
    const allGames = this.getAllGames();
    // Сортируем по дате обновления (новые первыми)
    return allGames
      .sort((a, b) => new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime())
      .slice(0, count);
  }
}
