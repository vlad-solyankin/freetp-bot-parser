import * as fs from 'fs';
import * as path from 'path';
import { EpicGame } from './types';

/**
 * Хранилище для бесплатных игр Epic Games Store
 */
const STORAGE_FILE = path.join(__dirname, '../data/epic-games.json');

export class EpicGamesStorage {
  private games: Map<string, EpicGame> = new Map();

  constructor() {
    this.load();
  }

  /**
   * Загрузить данные из файла
   */
  private load(): void {
    try {
      const dataDir = path.dirname(STORAGE_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(STORAGE_FILE)) {
        const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const gamesArray: EpicGame[] = JSON.parse(data);
        this.games = new Map(gamesArray.map(game => [game.id, game]));
      }
    } catch (error) {
      console.error('Ошибка при загрузке данных Epic Games:', error);
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
      console.error('Ошибка при сохранении данных Epic Games:', error);
    }
  }

  /**
   * Получить все известные игры
   */
  getAllGames(): EpicGame[] {
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
  addGame(game: EpicGame): void {
    this.games.set(game.id, game);
    this.save();
  }

  /**
   * Добавить несколько игр
   */
  addGames(games: EpicGame[]): void {
    games.forEach(game => this.games.set(game.id, game));
    this.save();
  }

  /**
   * Найти новые игры (которых ещё нет в хранилище)
   */
  findNewGames(games: EpicGame[]): EpicGame[] {
    return games.filter(game => !this.games.has(game.id));
  }

  /**
   * Получить активные бесплатные игры (те, которые еще доступны)
   */
  getActiveGames(): EpicGame[] {
    const now = new Date();
    return Array.from(this.games.values()).filter(game => {
      const endDate = new Date(game.endDate);
      return endDate >= now;
    });
  }

  /**
   * Очистить устаревшие игры (которые больше не бесплатны)
   */
  cleanExpiredGames(): void {
    const now = new Date();
    let cleaned = 0;
    
    for (const [id, game] of this.games.entries()) {
      const endDate = new Date(game.endDate);
      if (endDate < now) {
        this.games.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Удалено устаревших игр Epic Games: ${cleaned}`);
      this.save();
    }
  }
}
