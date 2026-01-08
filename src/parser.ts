import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { Game } from './types';

/**
 * Парсер для сайта freetp.org
 */
export class FreetpParser {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://freetp.org') {
    this.baseUrl = baseUrl;
  }

  /**
   * Парсинг страницы и извлечение списка игр
   * @param limit - Количество игр для парсинга
   * @param pageNumber - Номер страницы (опционально, если не указан - парсится главная страница)
   */
  async parseGames(limit: number = 10, pageNumber?: number): Promise<Game[]> {
    try {
      // Формируем URL: если указан номер страницы, используем /page/<номер>, иначе главная
      const url = pageNumber && pageNumber > 1 
        ? `${this.baseUrl}/page/${pageNumber}`
        : this.baseUrl;
      
      console.log(`Парсинг страницы: ${url}`);
      
      // Получаем HTML страницы
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'identity', // Отключаем сжатие для правильной обработки кодировки
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        responseType: 'arraybuffer' // Получаем как бинарные данные
      });

      // Определяем кодировку из ответа
      let htmlString: string;
      const contentType = response.headers['content-type'] || '';
      
      // Пробуем определить кодировку из Content-Type
      let encoding = 'win1251'; // По умолчанию Windows-1251 для русских сайтов
      if (contentType.includes('charset=')) {
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        if (charsetMatch) {
          const detectedEncoding = charsetMatch[1].toLowerCase().trim();
          // Нормализуем названия кодировок
          if (detectedEncoding.includes('1251') || detectedEncoding.includes('windows-1251')) {
            encoding = 'win1251';
          } else if (detectedEncoding.includes('utf-8') || detectedEncoding.includes('utf8')) {
            encoding = 'utf8';
          } else {
            encoding = detectedEncoding;
          }
        }
      }
      
      // Декодируем с правильной кодировкой
      try {
        htmlString = iconv.decode(Buffer.from(response.data), encoding);
        
        // Проверяем качество декодирования - если много символов замены, пробуем другую кодировку
        const replacementCount = (htmlString.match(/\uFFFD/g) || []).length;
        if (replacementCount > htmlString.length * 0.1 && encoding === 'utf8') {
          // Если больше 10% символов замены при UTF-8, пробуем Windows-1251
          htmlString = iconv.decode(Buffer.from(response.data), 'win1251');
        } else if (replacementCount > htmlString.length * 0.1 && encoding === 'win1251') {
          // Если больше 10% символов замены при Windows-1251, пробуем UTF-8
          htmlString = iconv.decode(Buffer.from(response.data), 'utf8');
        }
      } catch (error) {
        // Если ошибка декодирования, пробуем UTF-8
        console.warn(`Ошибка декодирования с ${encoding}, пробую UTF-8:`, error);
        htmlString = iconv.decode(Buffer.from(response.data), 'utf8');
      }
      
      const $ = cheerio.load(htmlString);
      const games: Game[] = [];

      console.log(`Найдено блоков div.base: ${$('div.base').length}`);
      
      // Отладка: сохраняем первый блок для анализа (только при первой загрузке)
      if ($('div.base').length > 0 && games.length === 0) {
        const firstBlock = $('div.base').first();
        const firstBlockHtml = firstBlock.html() || '';
        console.log(`[DEBUG] Первый блок div.base (первые 500 символов): ${firstBlockHtml.substring(0, 500)}...`);
        console.log(`[DEBUG] Найдено в первом блоке: header-h1=${firstBlock.find('div.header-h1').length}, h1=${firstBlock.find('h1').length}, a=${firstBlock.find('a').length}`);
      }

      // Парсим блоки с классом "base" - каждый блок это одна игра
      $('div.base').each((index: number, element: any) => {
        if (games.length >= limit) {
          return false; // Прекратить итерацию
        }

        try {
          const $el = $(element);
          
          // Пробуем разные варианты селекторов для заголовка
          let $header = $el.find('div.header-h1 h1 a');
          let title = '';
          let url = '';
          
          // Если не нашли, пробуем другие варианты
          if ($header.length === 0) {
            $header = $el.find('div.header-h1 a');
          }
          if ($header.length === 0) {
            $header = $el.find('.header-h1 a');
          }
          if ($header.length === 0) {
            $header = $el.find('h1 a');
          }
          if ($header.length === 0) {
            // Пробуем найти любую ссылку в header-h1
            const $headerDiv = $el.find('div.header-h1');
            if ($headerDiv.length > 0) {
              $header = $headerDiv.find('a').first();
            }
          }
          
          if ($header.length > 0) {
            title = $header.text().trim();
            url = $header.attr('href') || '';
          } else {
            // Альтернативный способ: ищем ссылку на страницу игры (содержит /po-seti/ или /games/)
            const $allLinks = $el.find('a[href*="/po-seti/"], a[href*="/games/"]');
            if ($allLinks.length > 0) {
              const $firstLink = $allLinks.first();
              url = $firstLink.attr('href') || '';
              // Пробуем получить заголовок из разных мест
              title = $firstLink.text().trim();
              if (!title) {
                // Ищем заголовок в родительском элементе
                title = $firstLink.closest('div.header-h1').text().trim();
              }
              if (!title) {
                // Ищем в h1 рядом со ссылкой
                title = $firstLink.find('h1').text().trim() || $firstLink.siblings('h1').text().trim();
              }
            } else {
              // Последняя попытка: ищем любую ссылку в блоке, которая выглядит как ссылка на игру
              const $anyLink = $el.find('a').first();
              if ($anyLink.length > 0) {
                url = $anyLink.attr('href') || '';
                title = $anyLink.text().trim() || $anyLink.find('h1').text().trim();
              }
              
              // Отладка: выводим HTML блока для анализа
              if (!title || !url) {
                const headerHtml = $el.find('div.header-h1').html() || '';
                const allLinks = $el.find('a').length;
                console.log(`[DEBUG ${index}] Найдено ссылок в блоке: ${allLinks}`);
                if (headerHtml) {
                  console.log(`[DEBUG ${index}] HTML header-h1: ${headerHtml.substring(0, 300)}...`);
                } else {
                  console.log(`[DEBUG ${index}] div.header-h1 не найден, весь HTML блока: ${$el.html()?.substring(0, 400)}...`);
                }
              }
            }
          }

          // Убираем &nbsp; и лишние пробелы из заголовка
          title = title.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

          if (!title || !url) {
            console.log(`Пропуск игры ${index}: нет заголовка или ссылки (title: "${title}", url: "${url}")`);
            console.log(`[DEBUG ${index}] Найдено div.header-h1: ${$el.find('div.header-h1').length}, найдено h1: ${$el.find('h1').length}, найдено a: ${$el.find('a').length}`);
            return; // Пропускаем, если нет заголовка или ссылки
          }

          // Генерируем ID из URL (извлекаем число из пути)
          const idMatch = url.match(/\/(\d+)-/);
          const id = idMatch ? idMatch[1] : url.replace(/[^0-9]/g, '') || `game-${index}`;

          // Извлекаем дату обновления (ищем в div с красным фоном)
          let updateDateText = '';
          const $updateDiv = $el.find('div[style*="background-color: red"], div[style*="background-color:red"]');
          if ($updateDiv.length > 0) {
            updateDateText = $updateDiv.find('span, p').first().text().trim();
          }
          
          // Если не нашли, пробуем найти в другом месте
          if (!updateDateText) {
            const $updateSpan = $el.find('div[style*="red"] span');
            if ($updateSpan.length > 0) {
              updateDateText = $updateSpan.text().trim();
            }
          }

          const updateDate = updateDateText ? this.parseDate(updateDateText) : 'Дата не указана';

          // Извлекаем описание (ищем в div.short-story)
          let description = '';
          const $description = $el.find('div.short-story p, div.short-story div.maincont p');
          if ($description.length > 0) {
            // Берем первый параграф с описанием
            $description.each((i, el) => {
              const text = $(el).text().trim();
              // Пропускаем пустые параграфы и те, что содержат только теги
              if (text && text.length > 20 && !text.match(/^(Способ|Категория|Автор)/i)) {
                description = text.replace(/\s+/g, ' ');
                return false; // Прекратить итерацию
              }
            });
          }

          // Если описание не найдено, пробуем другой селектор
          if (!description) {
            description = $el.find('div.short-story').text().trim().replace(/\s+/g, ' ');
            // Убираем лишнее из начала
            description = description.replace(/^(Способ|Категория|Автор).*?$/m, '').trim();
          }

          // Извлекаем автора из блока mlink
          const categoryText = $el.find('p.lcol.argcat').text().trim();
          let author = 'Неизвестно';
          let publishDate = updateDate;

          if (categoryText) {
            // Ищем автора (может быть в ссылке или тексте)
            const authorLink = $el.find('p.lcol.argcat a[href*="/user/"]');
            if (authorLink.length > 0) {
              author = authorLink.text().trim() || 'Неизвестно';
            } else {
              const authorMatch = categoryText.match(/user\/([^\/\s"']+)/);
              author = authorMatch ? authorMatch[1] : 'Неизвестно';
            }

            // Ищем дату публикации
            const publishDateMatch = categoryText.match(/(\d{1,2}-\d{1,2}-\d{4},\s*\d{1,2}:\d{1,2})|(Вчера,\s*\d{1,2}:\d{1,2})/);
            if (publishDateMatch) {
              publishDate = publishDateMatch[0];
            }
          }

          // Формируем полный URL, если он относительный
          const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

          // Получаем жанры со страницы игры (по умолчанию пустой массив)
          const genres: string[] = ['Загрузка...'];
          
          games.push({
            id,
            title,
            url: fullUrl,
            updateDate,
            description: description.substring(0, 500), // Ограничиваем длину описания
            genres,
            author,
            publishDate
          });

          console.log(`✓ Парсинг игры ${games.length}: ${title.substring(0, 50)}...`);
        } catch (error) {
          console.error(`Ошибка при парсинге игры ${index}:`, error);
        }
      });

      console.log(`Всего распарсено игр: ${games.length}`);
      
      // Жанры будут загружены в фоне после возврата результата
      // Это позволяет отправить сообщение сразу
      
      return games;
    } catch (error) {
      console.error('Ошибка при парсинге сайта:', error);
      throw new Error(`Не удалось распарсить сайт: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Загрузка жанров и обновление через callback
   */
  async loadGenresAndUpdate(games: Game[], onAllGenresLoaded: (games: Game[]) => void): Promise<void> {
    console.log('Начата фоновая загрузка жанров для всех игр...');
    
    // Используем Promise.allSettled вместо Promise.all, чтобы ошибки в одном запросе не останавливали остальные
    // Также добавляем небольшую задержку между запросами, чтобы не перегружать сервер
    const genresPromises = games.map(async (game, index) => {
      // Добавляем задержку между запросами (100мс * индекс), чтобы не перегружать сервер
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 100 * index));
      }
      
      try {
        const parsedGenres = await this.parseGenres(game.url);
        game.genres = parsedGenres;
        console.log(`✓ Жанры для игры ${index + 1}: ${parsedGenres.join(', ')}`);
        return { success: true, index, game };
      } catch (error: any) {
        const errorMessage = error.message || 'Неизвестная ошибка';
        console.error(`Ошибка при получении жанров для игры ${index + 1} (${game.title.substring(0, 30)}...): ${errorMessage}`);
        game.genres = ['Не указано'];
        return { success: false, index, game, error: errorMessage };
      }
    });
    
    // Используем allSettled, чтобы дождаться всех запросов, даже если некоторые упали
    const results = await Promise.allSettled(genresPromises);
    
    // Подсчитываем успешные и неуспешные загрузки
    let successCount = 0;
    let failCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        failCount++;
      }
    });
    
    console.log(`Все жанры загружены в фоне. Успешно: ${successCount}, Ошибок: ${failCount}`);
    
    // Вызываем callback после загрузки всех жанров
    onAllGenresLoaded(games);
  }

  /**
   * Парсинг жанров со страницы игры
   */
  async parseGenres(gameUrl: string): Promise<string[]> {
    const maxRetries = 2;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(gameUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'identity', // Отключаем сжатие для правильной обработки кодировки
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 20000, // Увеличиваем таймаут до 20 секунд
          responseType: 'arraybuffer', // Получаем как бинарные данные
          maxRedirects: 5, // Разрешаем редиректы
          validateStatus: (status) => status < 500 // Не бросать ошибку для 4xx статусов, только для 5xx
        });

      // Определяем кодировку и конвертируем
      let htmlString: string;
      const contentType = response.headers['content-type'] || '';
      
      let encoding = 'win1251'; // По умолчанию Windows-1251 для русских сайтов
      if (contentType.includes('charset=')) {
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        if (charsetMatch) {
          const detectedEncoding = charsetMatch[1].toLowerCase().trim();
          if (detectedEncoding.includes('1251') || detectedEncoding.includes('windows-1251')) {
            encoding = 'win1251';
          } else if (detectedEncoding.includes('utf-8') || detectedEncoding.includes('utf8')) {
            encoding = 'utf8';
          } else {
            encoding = detectedEncoding;
          }
        }
      }
      
      // Декодируем с правильной кодировкой
      try {
        htmlString = iconv.decode(Buffer.from(response.data), encoding);
        
        // Проверяем качество декодирования
        const replacementCount = (htmlString.match(/\uFFFD/g) || []).length;
        if (replacementCount > htmlString.length * 0.1 && encoding === 'utf8') {
          htmlString = iconv.decode(Buffer.from(response.data), 'win1251');
        } else if (replacementCount > htmlString.length * 0.1 && encoding === 'win1251') {
          htmlString = iconv.decode(Buffer.from(response.data), 'utf8');
        }
      } catch (error) {
        console.warn(`Ошибка декодирования с ${encoding}, пробую UTF-8:`, error);
        htmlString = iconv.decode(Buffer.from(response.data), 'utf8');
      }
      
      const $ = cheerio.load(htmlString);
      const genres: string[] = [];

      // Ищем блок с жанрами: <p><span style="text-decoration: underline;">Жанр:</span>&nbsp;Экшены, Приключенческие игры, Казуальные игры, Инди.</p>
      // Ищем в блоке maincont.gg или просто в параграфах
      $('p').each((index, element) => {
        const $p = $(element);
        const html = $p.html() || '';
        const text = $p.text();
        
        // Проверяем, содержит ли параграф "Жанр:" в HTML или тексте
        if (html.includes('Жанр:') || html.includes('жанр:') || text.includes('Жанр:') || text.includes('жанр:')) {
          // Пробуем найти через span с underline
          const $span = $p.find('span[style*="underline"]');
          if ($span.length > 0 && ($span.text().includes('Жанр') || $span.text().includes('жанр'))) {
            // Получаем весь текст параграфа
            let genresText = $p.text();
            // Убираем "Жанр:" и всё до него
            genresText = genresText.replace(/.*?[Жж]анр:\s*/, '').trim();
            // Убираем комментарии и лишнее в конце
            genresText = genresText.replace(/<!--.*?-->/, '').trim();
            genresText = genresText.replace(/\.$/, '').trim(); // Убираем точку в конце
            
            if (genresText) {
              // Разбиваем по запятым и очищаем
              const genresList = genresText
                .split(',')
                .map(g => g.trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '))
                .filter(g => g.length > 0 && !g.match(/^<!--/)); // Фильтруем комментарии
              
              if (genresList.length > 0) {
                genres.push(...genresList);
                return false; // Прекратить итерацию после нахождения
              }
            }
          } else {
            // Альтернативный способ: ищем через регулярное выражение в тексте
            const genreMatch = text.match(/[Жж]анр:\s*([^<]+?)(?:\.|<!--|$)/);
            if (genreMatch) {
              let genresText = genreMatch[1].trim();
              genresText = genresText.replace(/<!--.*?-->/, '').trim();
              
              if (genresText) {
                const genresList = genresText
                  .split(',')
                  .map(g => g.trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '))
                  .filter(g => g.length > 0 && !g.match(/^<!--/));
                
                if (genresList.length > 0) {
                  genres.push(...genresList);
                  return false;
                }
              }
            }
          }
        }
      });

      if (genres.length > 0) {
        console.log(`[DEBUG] Найдены жанры для ${gameUrl}: ${genres.join(', ')}`);
        return genres;
      }

      // Если не нашли, пробуем поискать в другом формате
      const allText = $('div.maincont').text();
      const genreMatchAlt = allText.match(/[Жж]анр[:\s]+([^<\.]+?)(?:\.|<!--|$)/);
      if (genreMatchAlt) {
        let genresText = genreMatchAlt[1].trim();
        const genresList = genresText
          .split(',')
          .map(g => g.trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '))
          .filter(g => g.length > 0);
        
        if (genresList.length > 0) {
          console.log(`[DEBUG] Найдены жанры (альтернативный способ) для ${gameUrl}: ${genresList.join(', ')}`);
          return genresList;
        }
      }

        console.log(`[DEBUG] Жанры не найдены для ${gameUrl}`);
        return ['Не указано'];
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message || 'Неизвестная ошибка';
        const isRetryable = errorMessage.includes('stream has been aborted') || 
                          errorMessage.includes('ECONNRESET') || 
                          errorMessage.includes('ETIMEDOUT') ||
                          errorMessage.includes('timeout') ||
                          error.code === 'ECONNRESET' ||
                          error.code === 'ETIMEDOUT' ||
                          error.code === 'ECONNABORTED';
        
        if (attempt < maxRetries && isRetryable) {
          const waitTime = attempt * 500; // 500мс, 1000мс
          console.warn(`Попытка ${attempt}/${maxRetries} не удалась для ${gameUrl}, повтор через ${waitTime}мс: ${errorMessage}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Повторяем попытку
        } else {
          // Если это последняя попытка или ошибка не подлежит повтору, выбрасываем ошибку
          throw error;
        }
      }
    }
    
    // Если все попытки исчерпаны, возвращаем ошибку
    console.error(`Все попытки исчерпаны для ${gameUrl}:`, lastError);
    return ['Не указано'];
  }

  /**
   * Парсинг даты из текста
   * Формат: "27-12-2025, 16:59 | обновлено до последней версии"
   * Или: "Вчера, 11:15 | обновлено до последней версии"
   */
  private parseDate(dateText: string): string {
    if (!dateText) {
      return 'Дата не указана';
    }

    // Пытаемся найти стандартный формат даты
    let match = dateText.match(/(\d{1,2}-\d{1,2}-\d{4},\s*\d{1,2}:\d{1,2})/);
    if (match) {
      return match[1];
    }

    // Обрабатываем "Вчера"
    if (dateText.includes('Вчера')) {
      const timeMatch = dateText.match(/Вчера,\s*(\d{1,2}:\d{1,2})/);
      if (timeMatch) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toLocaleDateString('ru-RU', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        return `${dateStr}, ${timeMatch[1]}`;
      }
    }

    // Если ничего не найдено, возвращаем исходный текст или текущую дату
    return dateText.trim() || new Date().toLocaleString('ru-RU');
  }
}
