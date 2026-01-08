# Гайд по деплою бота на VPS сервер

Этот гайд поможет вам развернуть Telegram бота на VPS сервере с использованием systemd для автозапуска.

## Предварительные требования

- VPS сервер с Ubuntu/Debian (или другой Linux дистрибутив)
- Доступ по SSH
- Установленный Node.js (версия 18 или выше)
- Установленный npm или yarn

## Шаг 1: Подготовка сервера

### 1.1 Подключение к серверу

```bash
ssh user@your-server-ip
```

### 1.2 Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.3 Установка Node.js (если не установлен)

```bash
# Установка Node.js через nvm (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Или установка через пакетный менеджер
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 1.4 Установка Git (если не установлен)

```bash
sudo apt install git -y
```

## Шаг 2: Загрузка проекта на сервер

### 2.1 Клонирование репозитория (если используете Git)

```bash
cd ~
git clone <your-repo-url> freetp-coop-bot
cd freetp-coop-bot
```

### 2.2 Или загрузка файлов через SCP

На вашем локальном компьютере:

```bash
scp -r /path/to/freetp-coop-bot user@your-server-ip:~/
```

Затем на сервере:

```bash
cd ~/freetp-coop-bot
```

## Шаг 3: Установка зависимостей

```bash
npm install
```

## Шаг 4: Настройка конфигурации

### 4.1 Создание .env файла

```bash
cp env.example .env
nano .env
```

Заполните файл:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
FREETP_URL=https://freetp.org
CHECK_INTERVAL=0 * * * *
NOTIFICATION_CHAT_ID=your_chat_id_here
```

**Как получить CHAT_ID:**
1. Напишите боту [@userinfobot](https://t.me/userinfobot) в Telegram
2. Он вернет ваш Chat ID
3. Или добавьте бота в группу и используйте ID группы

### 4.2 Сохранение файла

В nano: `Ctrl+O` (сохранить), `Enter` (подтвердить), `Ctrl+X` (выйти)

## Шаг 5: Сборка проекта

```bash
npm run build
```

Проверьте, что папка `dist/` создана и содержит скомпилированные файлы:

```bash
ls -la dist/
```

## Шаг 6: Тестовый запуск

Проверьте, что бот работает:

```bash
npm start
```

Если всё работает, остановите бота (`Ctrl+C`) и переходите к следующему шагу.

## Шаг 7: Настройка systemd для автозапуска

### 7.1 Создание service файла

```bash
sudo nano /etc/systemd/system/freetp-bot.service
```

Вставьте следующий контент (замените `user` на ваше имя пользователя и `/home/user/freetp-coop-bot` на реальный путь):

```ini
[Unit]
Description=Freetp.org Telegram Bot
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/freetp-coop-bot
Environment="NODE_ENV=production"
ExecStart=/home/user/.nvm/versions/node/v18.0.0/bin/node /home/user/freetp-coop-bot/dist/bot.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=freetp-bot

[Install]
WantedBy=multi-user.target
```

**Важно:** Замените путь к Node.js на реальный. Узнать путь можно командой:
```bash
which node
```

### 7.2 Перезагрузка systemd

```bash
sudo systemctl daemon-reload
```

### 7.3 Включение автозапуска

```bash
sudo systemctl enable freetp-bot.service
```

### 7.4 Запуск сервиса

```bash
sudo systemctl start freetp-bot.service
```

### 7.5 Проверка статуса

```bash
sudo systemctl status freetp-bot.service
```

Вы должны увидеть статус `active (running)`.

## Шаг 8: Просмотр логов

### Просмотр последних логов

```bash
sudo journalctl -u freetp-bot.service -f
```

### Просмотр последних 100 строк

```bash
sudo journalctl -u freetp-bot.service -n 100
```

### Просмотр логов за сегодня

```bash
sudo journalctl -u freetp-bot.service --since today
```

## Управление сервисом

### Остановка бота

```bash
sudo systemctl stop freetp-bot.service
```

### Перезапуск бота

```bash
sudo systemctl restart freetp-bot.service
```

### Отключение автозапуска

```bash
sudo systemctl disable freetp-bot.service
```

### Удаление сервиса

```bash
sudo systemctl stop freetp-bot.service
sudo systemctl disable freetp-bot.service
sudo rm /etc/systemd/system/freetp-bot.service
sudo systemctl daemon-reload
```

## Обновление бота

Когда нужно обновить код бота:

```bash
cd ~/freetp-coop-bot

# Если используете Git
git pull

# Или загрузите новые файлы через SCP

# Установите новые зависимости (если есть)
npm install

# Пересоберите проект
npm run build

# Перезапустите сервис
sudo systemctl restart freetp-bot.service

# Проверьте логи
sudo journalctl -u freetp-bot.service -f
```

## Решение проблем

### Бот не запускается

1. Проверьте логи:
```bash
sudo journalctl -u freetp-bot.service -n 50
```

2. Проверьте путь к Node.js в service файле:
```bash
which node
```

3. Проверьте права доступа к файлам:
```bash
ls -la ~/freetp-coop-bot
```

### Бот не отвечает на команды

1. Проверьте, что токен бота правильный в `.env` файле
2. Проверьте, что бот запущен:
```bash
sudo systemctl status freetp-bot.service
```

3. Проверьте логи на наличие ошибок

### Проблемы с парсингом сайта

1. Проверьте доступность сайта:
```bash
curl https://freetp.org
```

2. Проверьте логи на ошибки парсинга:
```bash
sudo journalctl -u freetp-bot.service | grep -i error
```

## Дополнительные настройки

### Настройка firewall (если используется)

Бот не требует открытых портов, так как использует polling. Но если используете webhook, откройте нужный порт:

```bash
sudo ufw allow 8443/tcp
```

### Использование PM2 (альтернатива systemd)

Если предпочитаете PM2:

```bash
# Установка PM2
npm install -g pm2

# Запуск бота
pm2 start dist/bot.js --name freetp-bot

# Сохранение конфигурации
pm2 save

# Настройка автозапуска
pm2 startup
```

### Ротация логов

Для управления размером логов можно настроить logrotate:

```bash
sudo nano /etc/logrotate.d/freetp-bot
```

```conf
/var/log/freetp-bot/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 user user
    sharedscripts
}
```

## Безопасность

1. **Не храните .env файл в Git** - он уже в .gitignore
2. **Используйте сильные пароли** для SSH доступа
3. **Настройте firewall** для ограничения доступа
4. **Регулярно обновляйте систему** и зависимости

## Мониторинг

Для мониторинга работы бота можно использовать:

- `systemctl status` - проверка статуса
- `journalctl` - просмотр логов
- Настройка алертов через мониторинг системы (например, Monit, Nagios)

## Готово!

Ваш бот теперь работает на VPS сервере и будет автоматически запускаться при перезагрузке сервера. Бот будет проверять новые игры каждый час и отправлять уведомления в указанный чат.
