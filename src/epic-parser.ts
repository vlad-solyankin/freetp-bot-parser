import axios from 'axios';
import * as cheerio from 'cheerio';
import { EpicGame } from './types';

/**
 * Парсер для бесплатных игр Epic Games Store
 * Парсит веб-страницу, так как GraphQL API требует аутентификации
 */
export class EpicGamesParser {
  private readonly storeUrl = 'https://store.epicgames.com';
  // Публичный API для бесплатных игр Epic Games
  private readonly publicApiUrl = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';

  /**
   * Получить текущие бесплатные игры из Epic Games Store
   */
  async getFreeGames(): Promise<EpicGame[]> {
    // Пробуем сначала публичный API
    try {
      const games = await this.getFreeGamesFromPublicAPI();
      if (games.length > 0) {
        return games;
      }
    } catch (error: any) {
      console.warn('Публичный API не доступен, пробуем парсинг веб-страницы:', error.message);
    }

    // Если публичный API не сработал, пробуем парсить веб-страницу
    try {
      return await this.getFreeGamesFromWeb();
    } catch (error: any) {
      console.error('Все методы парсинга не сработали:', error.message);
      return [];
    }
  }

  /**
   * Получить бесплатные игры через публичный API Epic Games
   */
  private async getFreeGamesFromPublicAPI(): Promise<EpicGame[]> {
    try {
      const response = await axios.get(this.publicApiUrl, {
        params: {
          locale: 'ru',
          country: 'RU',
          allowCountries: 'RU'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Origin': 'https://store.epicgames.com',
          'Referer': 'https://store.epicgames.com/'
        },
        timeout: 20000
      });

      if (!response.data?.data?.Catalog?.searchStore?.elements) {
        console.warn('Не удалось получить данные из публичного API');
        return [];
      }

      const elements = response.data.data.Catalog.searchStore.elements;
      const freeGames: EpicGame[] = [];
      const currentDate = new Date();

      for (const element of elements) {
        // Проверяем промо-акции
        const promotions = element.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
        const upcomingPromotions = element.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers || [];
        const allPromotions = [...promotions, ...upcomingPromotions];

        // Ищем активную бесплатную раздачу
        const activePromo = allPromotions.find((promo: any) => {
          const startDate = new Date(promo.startDate);
          const endDate = new Date(promo.endDate);
          return currentDate >= startDate && currentDate <= endDate && 
                 promo.discountSetting?.discountType === 'PERCENTAGE' && 
                 promo.discountSetting?.discountPercentage === 0;
        });

        if (activePromo) {
          const gameId = element.id || element.namespace || '';
          if (!gameId) continue;

          // Находим slug для URL (человекочитаемый идентификатор)
          // Epic Games использует productSlug, urlSlug или catalogNs.mappings[].pageSlug
          const productSlug = element.productSlug || 
                            element.urlSlug || 
                            element.catalogNs?.mappings?.[0]?.pageSlug ||
                            element.customAttributes?.find((attr: any) => attr.key === 'productSlug')?.value ||
                            element.customAttributes?.find((attr: any) => attr.key === 'urlSlug')?.value;

          // Если slug не найден, используем ID как fallback
          const urlSlug = productSlug || gameId;

          // Находим изображение
          const keyImage = element.keyImages?.find((img: any) => img.type === 'OfferImageWide') ||
                         element.keyImages?.find((img: any) => img.type === 'OfferImageTall') ||
                         element.keyImages?.find((img: any) => img.type === 'Thumbnail') ||
                         element.keyImages?.[0];

          // Получаем цену
          const originalPrice = element.price?.totalPrice?.originalPrice || 0;
          const currencyCode = element.price?.totalPrice?.currencyCode || 'RUB';

          const game: EpicGame = {
            id: gameId,
            title: element.title || 'Без названия',
            namespace: element.namespace || gameId,
            description: element.description || element.shortDescription || '',
            imageUrl: keyImage?.url,
            url: `${this.storeUrl}/ru/p/${urlSlug}`,
            startDate: activePromo.startDate,
            endDate: activePromo.endDate,
            originalPrice: originalPrice > 0 ? `${originalPrice} ${currencyCode}` : undefined,
            publisher: element.publisher?.name || element.customAttributes?.find((attr: any) => attr.key === 'publisherName')?.value,
            developer: element.seller?.name || element.customAttributes?.find((attr: any) => attr.key === 'developerName')?.value
          };

          freeGames.push(game);
        }
      }

      console.log(`Найдено бесплатных игр через публичный API: ${freeGames.length}`);
      return freeGames;

    } catch (error: any) {
      console.error('Ошибка при получении данных из публичного API:', error.message);
      throw error;
    }
  }

  /**
   * Получить бесплатные игры через парсинг веб-страницы (резервный метод)
   */
  private async getFreeGamesFromWeb(): Promise<EpicGame[]> {
    try {
      // Парсим страницу бесплатных игр
      const response = await axios.get(`${this.storeUrl}/ru/free-games`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/'
        },
        timeout: 20000,
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const freeGames: EpicGame[] = [];

      // Пробуем извлечь данные из встроенных JSON в script тегах
      // Epic Games часто встраивает данные в window.__INITIAL_STATE__ или window.__APOLLO_STATE__
      let gameData: any = null;

      // Ищем window.__INITIAL_STATE__
      const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
      if (initialStateMatch) {
        try {
          const stateStr = initialStateMatch[1];
          gameData = JSON.parse(stateStr);
          console.log('Найден __INITIAL_STATE__');
        } catch (e) {
          console.warn('Не удалось распарсить __INITIAL_STATE__:', e);
        }
      }

      // Ищем window.__APOLLO_STATE__
      if (!gameData) {
        const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
        if (apolloMatch) {
          try {
            const apolloStr = apolloMatch[1];
            gameData = JSON.parse(apolloStr);
            console.log('Найден __APOLLO_STATE__');
          } catch (e) {
            console.warn('Не удалось распарсить __APOLLO_STATE__:', e);
          }
        }
      }

      // Ищем данные в data-атрибутах или других местах
      if (!gameData) {
        // Пробуем найти JSON в script тегах с типом application/json
        $('script[type="application/json"]').each((_, el) => {
          try {
            const jsonData = JSON.parse($(el).html() || '{}');
            if (jsonData && (jsonData.Catalog || jsonData.searchStore || jsonData.elements)) {
              gameData = jsonData;
              console.log('Найден JSON в script теге');
              return false; // Прекратить итерацию
            }
          } catch (e) {
            // Игнорируем ошибки парсинга
          }
        });
      }

      // Если нашли данные в JSON, извлекаем игры
      if (gameData) {
        const elements = this.extractGamesFromData(gameData);
        for (const element of elements) {
          const game = this.parseGameElement(element);
          if (game) {
            freeGames.push(game);
          }
        }
      }

      // Если не нашли через JSON, пробуем парсить HTML напрямую
      if (freeGames.length === 0) {
        console.log('Пробуем парсить HTML напрямую...');
        const htmlGames = this.parseGamesFromHTML($);
        freeGames.push(...htmlGames);
      }

      console.log(`Найдено бесплатных игр в Epic Games: ${freeGames.length}`);
      return freeGames;

    } catch (error: any) {
      console.error('Ошибка при парсинге бесплатных игр Epic Games:', error.message);
      return [];
    }
  }

  /**
   * Извлечь игры из JSON данных
   */
  private extractGamesFromData(data: any): any[] {
    const games: any[] = [];

    // Пробуем разные пути в структуре данных
    if (data.Catalog?.searchStore?.elements) {
      return data.Catalog.searchStore.elements;
    }

    if (data.searchStore?.elements) {
      return data.searchStore.elements;
    }

    if (data.elements) {
      return data.elements;
    }

    // Ищем в корневых ключах
    for (const key in data) {
      if (typeof data[key] === 'object' && data[key] !== null) {
        if (data[key].elements) {
          games.push(...data[key].elements);
        } else if (Array.isArray(data[key])) {
          games.push(...data[key]);
        }
      }
    }

    return games;
  }

  /**
   * Парсить элемент игры из JSON данных
   */
  private parseGameElement(element: any): EpicGame | null {
    try {
      // Проверяем, что это бесплатная игра
      const currentPrice = element.currentPrice || element.price?.totalPrice?.discountPrice || 0;
      const originalPrice = element.price?.totalPrice?.originalPrice || 0;
      
      // Проверяем промо-акции
      const promotions = element.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
      const currentDate = new Date();
      
      const activePromo = promotions.find((promo: any) => {
        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);
        return currentDate >= startDate && currentDate <= endDate && 
               promo.discountSetting?.discountType === 'PERCENTAGE' && 
               promo.discountSetting?.discountPercentage === 0;
      });

      // Если игра не бесплатна, пропускаем
      if (!activePromo && (currentPrice > 0 || originalPrice === 0)) {
        return null;
      }

      const gameId = element.id || element.namespace || element.offerId || '';
      if (!gameId) {
        return null;
      }

      // Находим slug для URL
      const productSlug = element.productSlug || 
                        element.urlSlug || 
                        element.catalogNs?.mappings?.[0]?.pageSlug ||
                        element.customAttributes?.find((attr: any) => attr.key === 'productSlug')?.value ||
                        element.customAttributes?.find((attr: any) => attr.key === 'urlSlug')?.value;
      const urlSlug = productSlug || gameId;

      // Находим изображение
      const keyImage = element.keyImages?.find((img: any) => img.type === 'OfferImageWide') ||
                     element.keyImages?.find((img: any) => img.type === 'OfferImageTall') ||
                     element.keyImages?.[0];

      const game: EpicGame = {
        id: gameId,
        title: element.title || 'Без названия',
        namespace: element.namespace || gameId,
        description: element.description || element.shortDescription || '',
        imageUrl: keyImage?.url,
        url: `${this.storeUrl}/ru/p/${urlSlug}`,
        startDate: activePromo?.startDate || new Date().toISOString(),
        endDate: activePromo?.endDate || this.calculateDefaultEndDate(),
        originalPrice: originalPrice > 0 
          ? `${originalPrice} ${element.price?.totalPrice?.currencyCode || 'RUB'}`
          : undefined,
        publisher: element.publisher?.name || element.publisherDisplayName,
        developer: element.seller?.name || element.developerDisplayName
      };

      return game;
    } catch (error) {
      console.warn('Ошибка при парсинге элемента игры:', error);
      return null;
    }
  }

  /**
   * Парсить игры из HTML (резервный метод)
   */
  private parseGamesFromHTML($: cheerio.CheerioAPI): EpicGame[] {
    const games: EpicGame[] = [];

    // Ищем карточки бесплатных игр по data-component="FreeOfferCard"
    const freeOfferCards = $('[data-component="FreeOfferCard"]');
    
    if (freeOfferCards.length > 0) {
      console.log(`Найдено ${freeOfferCards.length} карточек бесплатных игр`);
      
      freeOfferCards.each((_, card) => {
        try {
          const $card = $(card);
          
          // Ищем ссылку внутри карточки
          const $link = $card.find('a[href*="/p/"]').first();
          if ($link.length === 0) return;
          
          const href = $link.attr('href') || '';
          if (!href || !href.includes('/p/')) return;
          
          // Извлекаем ID игры из ссылки
          const gameIdMatch = href.match(/\/p\/([^\/\?]+)/);
          if (!gameIdMatch) return;
          
          const gameId = gameIdMatch[1];
          
          // Извлекаем название игры
          const title = $link.find('h6').text().trim() || 
                       $link.attr('aria-label')?.split(',')[3]?.trim() ||
                       'Без названия';
          
          // Извлекаем дату окончания из time элементов
          let endDate = this.calculateDefaultEndDate();
          const $timeElements = $link.find('time[datetime]');
          if ($timeElements.length > 0) {
            // Берем последний time элемент (обычно там дата окончания)
            const lastTime = $timeElements.last();
            const datetime = lastTime.attr('datetime');
            if (datetime) {
              try {
                endDate = new Date(datetime).toISOString();
              } catch (e) {
                console.warn('Не удалось распарсить дату:', datetime);
              }
            }
          }
          
          // Извлекаем изображение
          const $img = $link.find('img[data-image]').first();
          const imageUrl = $img.attr('data-image') || $img.attr('src') || '';
          
          // Извлекаем описание (если есть)
          const description = $link.find('p').text().trim() || '';
          
          // Формируем полную ссылку
          const fullUrl = href.startsWith('http') ? href : `${this.storeUrl}${href}`;
          
          const game: EpicGame = {
            id: gameId,
            title: title.substring(0, 200),
            namespace: gameId,
            description: description.substring(0, 500),
            imageUrl: imageUrl,
            url: fullUrl,
            startDate: new Date().toISOString(),
            endDate: endDate
          };
          
          games.push(game);
        } catch (e) {
          console.warn('Ошибка при парсинге карточки игры:', e);
        }
      });
    } else {
      // Если не нашли по data-component, пробуем другие селекторы
      console.log('Не найдено карточек по data-component="FreeOfferCard", пробуем альтернативные селекторы...');
      
      const selectors = [
        '[data-testid="offer-card"]',
        'a[href*="/p/"][aria-label*="Сейчас бесплатно"]',
        'a[href*="/p/"][aria-label*="Бесплатно"]'
      ];

      for (const selector of selectors) {
        const cards = $(selector);
        if (cards.length > 0) {
          console.log(`Найдено ${cards.length} карточек с селектором ${selector}`);
          
          cards.each((_, card) => {
            try {
              const $card = $(card);
              const href = $card.attr('href') || '';
              
              if (!href || !href.includes('/p/')) return;
              
              const gameIdMatch = href.match(/\/p\/([^\/\?]+)/);
              if (!gameIdMatch) return;
              
              const gameId = gameIdMatch[1];
              const ariaLabel = $card.attr('aria-label') || '';
              
              // Парсим название из aria-label (формат: "Бесплатные игры, 1 из 3, Сейчас бесплатно, Название игры, ...")
              const titleParts = ariaLabel.split(',');
              const title = titleParts.length >= 4 ? titleParts[3].trim() : 
                           $card.find('h6').text().trim() || 
                           $card.find('h3').text().trim() ||
                           'Без названия';
              
              // Извлекаем дату окончания
              let endDate = this.calculateDefaultEndDate();
              const $time = $card.find('time[datetime]').last();
              const datetime = $time.attr('datetime');
              if (datetime) {
                try {
                  endDate = new Date(datetime).toISOString();
                } catch (e) {
                  // Игнорируем ошибки
                }
              }
              
              const $img = $card.find('img[data-image]').first();
              const imageUrl = $img.attr('data-image') || $img.attr('src') || '';
              
              const fullUrl = href.startsWith('http') ? href : `${this.storeUrl}${href}`;
              
              games.push({
                id: gameId,
                title: title.substring(0, 200),
                namespace: gameId,
                description: '',
                imageUrl: imageUrl,
                url: fullUrl,
                startDate: new Date().toISOString(),
                endDate: endDate
              });
            } catch (e) {
              // Игнорируем ошибки
            }
          });

          if (games.length > 0) {
            break; // Если нашли игры, прекращаем поиск
          }
        }
      }
    }

    console.log(`Распарсено игр из HTML: ${games.length}`);
    return games;
  }

  /**
   * Вычислить дату окончания по умолчанию (обычно раздачи длятся неделю)
   */
  private calculateDefaultEndDate(): string {
    // Обычно бесплатные игры доступны до следующего четверга в 17:00 UTC
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = воскресенье, 4 = четверг
    const daysUntilThursday = dayOfWeek <= 4 ? (4 - dayOfWeek) : (11 - dayOfWeek);
    const nextThursday = new Date(now);
    nextThursday.setDate(now.getDate() + daysUntilThursday);
    nextThursday.setHours(17, 0, 0, 0); // 17:00 UTC
    
    // Если уже прошло 17:00 в четверг, берем следующий четверг
    if (dayOfWeek === 4 && now.getHours() >= 17) {
      nextThursday.setDate(nextThursday.getDate() + 7);
    }

    return nextThursday.toISOString();
  }
}
