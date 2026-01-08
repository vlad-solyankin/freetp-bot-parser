import TelegramBot from 'node-telegram-bot-api';
import * as cron from 'node-cron';
import * as dotenv from 'dotenv';
import { FreetpParser } from './parser';
import { GameStorage } from './storage';
import { Game } from './types';

// Загружаем переменные окружения
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FREETP_URL = process.env.FREETP_URL || 'https://freetp.org';
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || '*/30 * * * * *'; // Каждые 30 секунд (формат с секундами)
const NOTIFICATION_CHAT_ID = process.env.NOTIFICATION_CHAT_ID;
const NOTIFICATION_TOPIC_ID = process.env.NOTIFICATION_TOPIC_ID;

if (!BOT_TOKEN) {
  console.error('Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env файле');
  process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const parser = new FreetpParser(FREETP_URL);
const storage = new GameStorage();

// Хранилище состояния пагинации (chatId -> {games, currentPage})
const paginationState = new Map<number, { games: Game[]; currentPage: number }>();

/**
 * Экранирование HTML символов для безопасной отправки
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Форматирование игры для отправки в Telegram
 */
function formatGame(game: Game): string {
  // Если жанры еще загружаются, показываем "Загрузка..."
  const genresText = game.genres && game.genres.length > 0 && !game.genres.includes('Загрузка...')
    ? game.genres.join(', ') 
    : (game.genres && game.genres.includes('Загрузка...') ? 'Загрузка...' : 'Не указано');
  
  // Экранируем HTML символы в тексте, но оставляем теги
  const safeTitle = escapeHtml(game.title);
  const safeUpdateDate = escapeHtml(game.updateDate);
  const safeGenres = escapeHtml(genresText);
  const safeAuthor = escapeHtml(game.author);
  const safeDescription = game.description 
    ? escapeHtml(game.description.substring(0, 200)) + (game.description.length > 200 ? '...' : '')
    : '';
  
  return `🎮 <b>${safeTitle}</b>

📅 Обновлено: ${safeUpdateDate}
🎯 Жанры: ${safeGenres}
👤 Автор: ${safeAuthor}

${safeDescription ? `📝 ${safeDescription}` : ''}

🔗 <a href="${game.url}">Подробнее</a>`;
}

/**
 * Форматирование сообщения с пагинацией
 */
function formatGamesPage(games: Game[], currentPage: number, gamesPerPage: number = 1): string {
  const startIndex = currentPage * gamesPerPage;
  const endIndex = Math.min(startIndex + gamesPerPage, games.length);
  const currentGame = games[startIndex];
  
  if (!currentGame) {
    return '❌ Игра не найдена';
  }
  
  const pageInfo = `\n\n📄 Страница ${currentPage + 1} из ${Math.ceil(games.length / gamesPerPage)}`;
  
  return formatGame(currentGame) + pageInfo;
}

/**
 * Создание клавиатуры с пагинацией
 */
function createPaginationKeyboard(games: Game[], currentPage: number, gamesPerPage: number = 1): TelegramBot.InlineKeyboardMarkup {
  const totalPages = Math.ceil(games.length / gamesPerPage);
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Кнопки навигации
  const navButtons: TelegramBot.InlineKeyboardButton[] = [];
  
  if (currentPage > 0) {
    navButtons.push({
      text: '◀️ Назад',
      callback_data: `page_${currentPage - 1}`
    });
  }
  
  navButtons.push({
    text: `${currentPage + 1}/${totalPages}`,
    callback_data: 'page_info'
  });
  
  if (currentPage < totalPages - 1) {
    navButtons.push({
      text: 'Вперёд ▶️',
      callback_data: `page_${currentPage + 1}`
    });
  }
  
  keyboard.push(navButtons);
  
  return {
    inline_keyboard: keyboard
  };
}

/**
 * Отправка сообщения с повторными попытками
 * Не бросает исключения, всегда возвращает результат
 */
async function sendMessageWithRetry(
  chatId: number, 
  text: string, 
  options: TelegramBot.SendMessageOptions = {},
  maxRetries: number = 3
): Promise<boolean> {
  // Добавляем message_thread_id если указан в опциях или используем глобальный для уведомлений
  const finalOptions: TelegramBot.SendMessageOptions = { ...options };
  // Если message_thread_id не указан в options, но есть глобальный NOTIFICATION_TOPIC_ID
  // и это уведомление в указанный чат, используем глобальный topic_id
  if (!finalOptions.message_thread_id && NOTIFICATION_TOPIC_ID && NOTIFICATION_CHAT_ID) {
    const targetChatId = parseInt(NOTIFICATION_CHAT_ID);
    const topicId = parseInt(NOTIFICATION_TOPIC_ID);
    if (!isNaN(targetChatId) && !isNaN(topicId) && topicId > 0 && chatId === targetChatId) {
      finalOptions.message_thread_id = topicId;
    }
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.sendMessage(chatId, text, finalOptions);
      return true;
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error.message || 'Неизвестная ошибка';
      const errorCode = error.response?.statusCode || error.code || '';
      const response = error.response;
      
      // Логируем детали ошибки
      if (!isLastAttempt) {
        console.warn(`Попытка ${attempt}/${maxRetries} отправки сообщения не удалась: ${errorMessage} (код: ${errorCode})`);
      } else {
        console.error(`Все попытки отправки исчерпаны. Последняя ошибка: ${errorMessage} (код: ${errorCode})`);
        if (response?.data) {
          console.error('Детали ошибки от Telegram:', JSON.stringify(response.data));
        }
      }
      
      // Если это последняя попытка, возвращаем false, но не бросаем исключение
      if (isLastAttempt) {
        return false;
      }
      
      // Определяем время ожидания в зависимости от типа ошибки
      let waitTime = attempt * 1000; // По умолчанию: 1, 2, 3 секунды
      
      // Rate limit - ждем дольше
      if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        waitTime = attempt * 2000; // 2, 4, 6 секунд
        console.log(`Rate limit обнаружен, ожидание ${waitTime}мс...`);
      } 
      // Ошибки соединения - ждем дольше и увеличиваем время между попытками
      else if (errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ENOTFOUND')) {
        waitTime = attempt * 2000; // 2, 4, 6 секунд (увеличено)
        console.log(`Ошибка соединения, ожидание ${waitTime}мс...`);
      }
      // Ошибки валидации (например, слишком длинное сообщение)
      else if (errorCode === 400 || errorMessage.includes('Bad Request')) {
        console.error('Ошибка валидации сообщения. Возможно, сообщение слишком длинное или содержит недопустимые символы.');
        // Не повторяем при ошибке валидации
        return false;
      }
      // Для других ошибок используем стандартное время
      
      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  return false;
}

/**
 * Отправка списка игр с пагинацией
 */
async function sendGamesList(chatId: number, games: Game[], page: number = 0): Promise<void> {
  if (games.length === 0) {
    await sendMessageWithRetry(chatId, '❌ Игры не найдены');
    return;
  }

  // Сохраняем состояние пагинации
  paginationState.set(chatId, { games, currentPage: page });

  const messageText = formatGamesPage(games, page);
  const keyboard = createPaginationKeyboard(games, page);

  // Проверяем размер сообщения (Telegram ограничивает до 4096 символов)
  const messageLength = messageText.length;
  console.log(`Размер сообщения: ${messageLength} символов`);
  
  if (messageLength > 4096) {
    console.warn(`Сообщение слишком большое (${messageLength} символов), обрезаем...`);
    // Обрезаем описание игры, если сообщение слишком большое
    const currentGame = games[page];
    if (currentGame) {
      const maxDescLength = 4096 - (messageText.length - currentGame.description.length) - 100; // Запас
      const shortDesc = currentGame.description.substring(0, Math.max(0, maxDescLength));
      const shortMessage = formatGame({ ...currentGame, description: shortDesc }) + 
        `\n\n📄 Страница ${page + 1} из ${Math.ceil(games.length / 1)}`;
      
      const success = await sendMessageWithRetry(chatId, shortMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: keyboard
      }, 5); // Увеличиваем количество попыток до 5
      
      if (!success) {
        console.error(`Не удалось отправить список игр в чат ${chatId} даже после обрезки`);
        // Пробуем отправить упрощенную версию без HTML
        try {
          await bot.sendMessage(chatId, `🎮 ${currentGame.title}\n\n🔗 ${currentGame.url}`, {
            reply_markup: keyboard
          });
        } catch (fallbackError) {
          console.error('Не удалось отправить даже упрощенную версию:', fallbackError);
        }
      }
      return;
    }
  }

  // Увеличиваем количество попыток для важных сообщений
  const success = await sendMessageWithRetry(chatId, messageText, {
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: keyboard
  }, 5); // 5 попыток вместо 3

  if (!success) {
    console.error(`Не удалось отправить список игр в чат ${chatId} после 5 попыток`);
    // Пробуем отправить упрощенную версию без HTML форматирования
    try {
      const currentGame = games[page];
      const simpleMessage = `🎮 ${currentGame.title}\n\n📅 Обновлено: ${currentGame.updateDate}\n🎯 Жанры: ${currentGame.genres.join(', ')}\n👤 Автор: ${currentGame.author}\n\n🔗 ${currentGame.url}\n\n📄 Страница ${page + 1} из ${Math.ceil(games.length / 1)}`;
      
      await bot.sendMessage(chatId, simpleMessage, {
        reply_markup: keyboard
      });
      console.log('Упрощенная версия сообщения отправлена успешно');
    } catch (fallbackError: any) {
      console.error('Не удалось отправить даже упрощенную версию:', fallbackError.message);
    }
  }
}

/**
 * Обновление сообщения с пагинацией
 */
async function updateGamesPage(chatId: number, messageId: number, games: Game[], page: number): Promise<void> {
  const messageText = formatGamesPage(games, page);
  const keyboard = createPaginationKeyboard(games, page);

  try {
    await bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: keyboard
    });
    
    // Обновляем состояние
    paginationState.set(chatId, { games, currentPage: page });
  } catch (error: any) {
    const errorMessage = error.message || 'Неизвестная ошибка';
    console.error('Ошибка при обновлении сообщения:', errorMessage);
    
    // Если сообщение не изменилось, это нормально - игнорируем
    if (errorMessage.includes('message is not modified')) {
      return; // Не критично, просто выходим
    }
    
    // Для других ошибок логируем, но не падаем
    console.warn('Не удалось обновить сообщение с пагинацией, но бот продолжает работу');
    // Не бросаем исключение, чтобы бот продолжал работать
  }
}

/**
 * Проверка новых игр и отправка уведомлений
 */
async function checkNewGames(): Promise<void> {
  const targetChatId = NOTIFICATION_CHAT_ID ? parseInt(NOTIFICATION_CHAT_ID) : null;
  const checkTime = new Date().toLocaleString('ru-RU');
  
  try {
    console.log(`[${checkTime}] Проверка новых игр...`);
    
    // Отправляем сообщение о начале проверки
    if (targetChatId) {
      await sendMessageWithRetry(targetChatId, `🔍 <b>Автоматическая проверка новых игр</b>\n\n⏰ Время: ${checkTime}\n\n⏳ Начинаю парсинг сайта...`, {
        parse_mode: 'HTML'
      });
    }
    
    const games = await parser.parseGames(10);
    const newGames = storage.findNewGames(games);

    if (newGames.length > 0) {
      console.log(`Найдено новых игр: ${newGames.length}`);
      
      // Сохраняем новые игры
      storage.addGames(newGames);

      // Отправляем сообщение о результате проверки
      if (targetChatId) {
        const resultMessage = `✅ <b>Проверка завершена!</b>\n\n🆕 Найдено новых игр: <b>${newGames.length}</b>\n⏰ Время: ${checkTime}`;
        await sendMessageWithRetry(targetChatId, resultMessage, {
          parse_mode: 'HTML'
        });
      }

      // Отправляем уведомления о каждой новой игре
      for (const game of newGames) {
        const message = `🆕 <b>Новая игра на freetp.org!</b>\n\n${formatGame(game)}`;
        
        if (targetChatId) {
          // Отправляем в указанный чат
          const success = await sendMessageWithRetry(targetChatId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
          
          if (!success) {
            console.warn(`Не удалось отправить уведомление о новой игре ${game.id}, но бот продолжает работу`);
          }
        } else {
          // Если чат не указан, сохраняем для отправки при следующей команде /newgames
          console.log('NOTIFICATION_CHAT_ID не установлен, уведомления не отправлены');
        }
      }
    } else {
      console.log('Новых игр не найдено');
      
      // Отправляем сообщение о том, что новых игр не найдено
      if (targetChatId) {
        const resultMessage = `✅ <b>Проверка завершена</b>\n\n📭 Новых игр не найдено\n⏰ Время: ${checkTime}`;
        await sendMessageWithRetry(targetChatId, resultMessage, {
          parse_mode: 'HTML'
        });
      }
    }
  } catch (error) {
    console.error('Ошибка при проверке новых игр:', error);
    
    // Отправляем сообщение об ошибке
    if (targetChatId) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      await sendMessageWithRetry(targetChatId, `❌ <b>Ошибка при проверке новых игр</b>\n\n⏰ Время: ${checkTime}\n\n🔴 ${errorMessage}`, {
        parse_mode: 'HTML'
      });
    }
  }
}

// Обработчики команд бота

// Команда /start
bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 Привет! Я бот для отслеживания игр с freetp.org

📋 <b>Доступные команды:</b>
/games - Показать последние 10 игр с главной страницы
/games <номер> - Показать игры со страницы (например: /games 2)
/newgames - Проверить новые игры
/chatid - Показать ID чата для уведомлений
/help - Показать справку

Бот автоматически проверяет новые игры каждый час.`;

  await sendMessageWithRetry(chatId, welcomeMessage, { parse_mode: 'HTML' });
});

// Команда /help
bot.onText(/\/help/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const helpMessage = `📚 <b>Справка по командам:</b>

/games - Получить список из 10 последних игр с главной страницы freetp.org
/games <номер> - Получить список игр с указанной страницы (например: /games 2 для страницы freetp.org/page/2)

/newgames - Вручную проверить наличие новых игр (бот также делает это автоматически каждый час)

/chatid - Показать ID текущего чата (для настройки уведомлений)

/help - Показать эту справку

<b>Автоматические уведомления:</b>
Бот автоматически проверяет сайт каждый час. Если вы хотите получать уведомления о новых играх, установите переменную NOTIFICATION_CHAT_ID в .env файле.`;

  await sendMessageWithRetry(chatId, helpMessage, { parse_mode: 'HTML' });
});

// Команда /chatid - показать ID чата
bot.onText(/\/chatid/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const chatTitle = msg.chat.type === 'private' 
    ? (msg.from?.first_name || 'Пользователь')
    : (msg.chat.title || 'Чат');
  
  // Проверяем, есть ли message_thread_id (тема в группе)
  const topicId = (msg as any).message_thread_id;
  const isTopic = topicId !== undefined && topicId !== null;
  
  let chatInfo = `📋 <b>Информация о чате:</b>

🆔 <b>Chat ID:</b> <code>${chatId}</code>
👤 <b>Название:</b> ${chatTitle}
📝 <b>Тип:</b> ${chatType === 'private' ? 'Личный чат' : chatType === 'group' ? 'Группа' : 'Канал'}`;

  if (isTopic) {
    chatInfo += `\n\n📌 <b>Topic ID:</b> <code>${topicId}</code>
💬 <b>Тема:</b> ${(msg as any).reply_to_message?.forum_topic_created?.name || 'Без названия'}`;
  }

  chatInfo += `\n\n<b>Как использовать:</b>
Скопируйте Chat ID выше и добавьте его в файл .env:
<code>NOTIFICATION_CHAT_ID=${chatId}</code>`;

  if (isTopic) {
    chatInfo += `\n\nДля отправки в эту тему также добавьте:
<code>NOTIFICATION_TOPIC_ID=${topicId}</code>`;
  }

  chatInfo += `\n\nПосле этого перезапустите бота, и уведомления будут приходить${isTopic ? ' в эту тему' : ' в этот чат'}.`;

  await sendMessageWithRetry(chatId, chatInfo, { parse_mode: 'HTML' });
});

// Команда /games (с опциональным номером страницы: /games 2)
bot.onText(/\/games(?:\s+(\d+))?/, async (msg: TelegramBot.Message, match: RegExpMatchArray | null) => {
  const chatId = msg.chat.id;
  
  try {
    // Извлекаем номер страницы из команды (если указан)
    const pageNumber = match && match[1] ? parseInt(match[1]) : undefined;
    
    if (pageNumber !== undefined && (isNaN(pageNumber) || pageNumber < 1)) {
      await sendMessageWithRetry(chatId, '❌ Номер страницы должен быть положительным числом. Пример: /games 2');
      return;
    }
    
    const pageInfo = pageNumber ? ` страницы ${pageNumber}` : '';
    console.log(`[${new Date().toLocaleString('ru-RU')}] Запрос списка игр${pageInfo} от пользователя ${msg.from?.username || msg.from?.id}`);
    
    // Отправляем сообщение о загрузке (не ждем успешной отправки)
    const loadingMessage = pageNumber 
      ? `⏳ Загружаю список игр со страницы ${pageNumber}...`
      : '⏳ Загружаю список игр...';
    sendMessageWithRetry(chatId, loadingMessage).catch(() => {});
    
    const games = await parser.parseGames(10, pageNumber);
    
    if (games.length === 0) {
      await sendMessageWithRetry(chatId, '❌ Игры не найдены. Возможно, проблема с парсингом сайта.');
      console.error('Игры не найдены при парсинге');
      return;
    }
    
    console.log(`Успешно получено игр: ${games.length}`);
    
    // Сохраняем игры в хранилище
    storage.addGames(games);
    
    // Отправляем сообщение сразу, не дожидаясь загрузки жанров
    // Жанры загружаются в фоне и будут доступны при следующем обновлении сообщения
    await sendGamesList(chatId, games, 0);
    
    // Загружаем жанры в фоне (не блокируем отправку, не ждем завершения)
    parser.loadGenresAndUpdate(games, async (updatedGames: Game[]) => {
      // Обновляем игры в хранилище
      storage.addGames(updatedGames);
      console.log('Жанры загружены и обновлены в хранилище');
    }).catch((error: any) => {
      console.error('Ошибка при фоновой загрузке жанров:', error);
    });
    // Не ждем завершения загрузки жанров
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    await sendMessageWithRetry(chatId, `❌ Ошибка при получении списка игр: ${errorMessage}`);
    console.error('Ошибка в команде /games:', error);
  }
});

// Обработчик callback_query для пагинации
bot.on('callback_query', async (query: TelegramBot.CallbackQuery) => {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !messageId || !data) {
    return;
  }

  try {
    // Отвечаем на callback, чтобы убрать индикатор загрузки
    await bot.answerCallbackQuery(query.id);

    const state = paginationState.get(chatId);
    if (!state) {
      await bot.sendMessage(chatId, '❌ Сессия истекла. Используйте команду /games для получения списка игр.');
      return;
    }

    if (data === 'page_info') {
      // Просто обновляем информацию о странице
      return;
    }

    if (data.startsWith('page_')) {
      const page = parseInt(data.replace('page_', ''));
      if (isNaN(page) || page < 0 || page >= Math.ceil(state.games.length / 1)) {
        return;
      }

      await updateGamesPage(chatId, messageId, state.games, page);
    }
  } catch (error) {
    console.error('Ошибка при обработке callback_query:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка', show_alert: true });
  }
});

// Команда /newgames
bot.onText(/\/newgames/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  try {
    await sendMessageWithRetry(chatId, '🔍 Проверяю новые игры...');
    await checkNewGames();
    
    // Получаем последние игры для отображения
    const latestGames = storage.getLatestGames(10);
    if (latestGames.length > 0) {
      await sendMessageWithRetry(chatId, `✅ Проверка завершена. Последние игры:`, { parse_mode: 'HTML' });
      await sendGamesList(chatId, latestGames.slice(0, 5), 0); // Показываем только 5 последних
    } else {
      await sendMessageWithRetry(chatId, '✅ Проверка завершена. Новых игр не найдено.');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('Ошибка в команде /newgames:', error);
    
    // Пытаемся отправить сообщение об ошибке, но не падаем, если не получилось
    try {
      await sendMessageWithRetry(chatId, `❌ Ошибка при проверке новых игр: ${errorMessage}`);
    } catch (sendError) {
      console.error('Не удалось отправить сообщение об ошибке:', sendError);
      // Продолжаем работу, не падаем
    }
  }
});

// Обработка ошибок polling
bot.on('polling_error', (error: any) => {
  const errorMessage = error.message || 'Неизвестная ошибка';
  console.error('Ошибка polling:', errorMessage);
  
  // Если ошибка связана с конфликтом нескольких экземпляров
  if (errorMessage.includes('409 Conflict')) {
    console.error('⚠️ Обнаружен конфликт: другой экземпляр бота уже запущен!');
    console.error('Решение: остановите все другие экземпляры бота или используйте webhook вместо polling');
    console.error('Бот будет пытаться переподключиться автоматически...');
    // Бот автоматически попытается переподключиться, не нужно делать ничего дополнительно
  } else if (errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT')) {
    console.warn('⚠️ Ошибка соединения с Telegram API. Бот продолжит работу и попытается переподключиться...');
    // Бот автоматически переподключится
  } else {
    console.error('⚠️ Неизвестная ошибка polling. Бот продолжит работу...');
  }
  // Не падаем, бот должен продолжать работать
});

// Настройка автоматической проверки
console.log(`Настройка автоматической проверки с интервалом: ${CHECK_INTERVAL}`);
cron.schedule(CHECK_INTERVAL, checkNewGames, {
  scheduled: true,
  timezone: 'Europe/Moscow'
});

// Первоначальная проверка при запуске (опционально)
// Раскомментируйте, если хотите проверять сразу при старте
// checkNewGames();

// Обработка необработанных исключений
process.on('uncaughtException', (error: Error) => {
  console.error('⚠️ Необработанное исключение:', error);
  console.error('Бот продолжит работу, но рекомендуется перезапустить его');
  // Не завершаем процесс, бот должен продолжать работать
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('⚠️ Необработанное отклонение промиса:', reason);
  console.error('Бот продолжит работу');
  // Не завершаем процесс
});

console.log('🤖 Бот запущен и готов к работе!');
console.log(`📡 Проверка новых игр настроена на интервал: ${CHECK_INTERVAL}`);
