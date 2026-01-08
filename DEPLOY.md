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

### 1.5 Настройка Git аутентификации

**Важно:** GitHub и другие сервисы больше не поддерживают пароли для Git операций. Необходимо использовать токен доступа.

#### Для GitHub:

1. **Создание токена доступа:**
   - Перейдите на https://github.com/settings/tokens
   - Нажмите "Generate new token" → "Generate new token (classic)"
   - Выберите срок действия (например, "No expiration" или "90 days")
   - Отметьте права доступа: `repo` (для приватных репозиториев) или `public_repo` (для публичных)
   - Нажмите "Generate token"
   - **Скопируйте токен сразу** (он больше не будет показан)

2. **Использование токена при клонировании:**
   ```bash
   git clone https://<YOUR_TOKEN>@github.com/username/repository.git
   ```
   Или используйте SSH (рекомендуется):
   ```bash
   # Генерация SSH ключа (если еще нет)
   ssh-keygen -t ed25519 -C "your_email@example.com"
   
   # Добавление ключа в ssh-agent
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   
   # Скопируйте публичный ключ
   cat ~/.ssh/id_ed25519.pub
   ```
   Затем добавьте ключ в GitHub: Settings → SSH and GPG keys → New SSH key

3. **Настройка Git credentials (для HTTPS):**
   ```bash
   git config --global credential.helper store
   ```
   При следующем `git pull` или `git push` введите:
   - Username: ваш GitHub username
   - Password: ваш токен доступа (не пароль!)

#### Для GitLab:

1. **Создание токена:**
   - Перейдите в Settings → Access Tokens
   - Создайте токен с правами `read_repository` и `write_repository`
   - Скопируйте токен

2. **Использование токена:**
   ```bash
   git clone https://oauth2:<YOUR_TOKEN>@gitlab.com/username/repository.git
   ```

#### Для Bitbucket:

1. **Создание App Password:**
   - Перейдите в Personal settings → App passwords
   - Создайте новый пароль с правами `Repositories: Read, Write`
   - Используйте его как пароль при Git операциях

## Шаг 2: Загрузка проекта на сервер

### 2.1 Клонирование репозитория (если используете Git)

**С использованием HTTPS и токена:**
```bash
cd ~
git clone https://<YOUR_TOKEN>@github.com/username/repository.git freetp-coop-bot
cd freetp-coop-bot
```

**С использованием SSH (рекомендуется):**
```bash
cd ~
git clone git@github.com:username/repository.git freetp-coop-bot
cd freetp-coop-bot
```

**Если уже клонировали и нужно обновить credentials:**
```bash
# Удалите старый remote
git remote remove origin

# Добавьте новый с токеном
git remote add origin https://<YOUR_TOKEN>@github.com/username/repository.git

# Или используйте SSH
git remote add origin git@github.com:username/repository.git
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

# Если возникла ошибка аутентификации:
# 1. Проверьте, что используете токен, а не пароль
# 2. Обновите remote URL с токеном:
#    git remote set-url origin https://<YOUR_TOKEN>@github.com/username/repository.git
# 3. Или используйте SSH:
#    git remote set-url origin git@github.com:username/repository.git

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

### Ошибка Git аутентификации: "Invalid username or token"

Если вы видите ошибку:
```
remote: Invalid username or token. Password authentication is not supported for Git operations.
```

**Решения:**

1. **Проверьте, что используете токен, а не пароль:**
   - GitHub/GitLab/Bitbucket больше не принимают пароли
   - Используйте Personal Access Token (PAT)

2. **Обновите remote URL с токеном:**
   ```bash
   # Для HTTPS
   git remote set-url origin https://<YOUR_TOKEN>@github.com/username/repository.git
   
   # Или используйте SSH (рекомендуется)
   git remote set-url origin git@github.com:username/repository.git
   ```

3. **Проверьте текущий remote URL:**
   ```bash
   git remote -v
   ```

4. **Очистите сохраненные credentials:**
   ```bash
   git config --global --unset credential.helper
   git credential-cache exit
   # Или удалите сохраненные credentials:
   rm ~/.git-credentials
   ```

5. **Используйте SSH вместо HTTPS (рекомендуется):**
   ```bash
   # Генерация SSH ключа (если еще нет)
   ssh-keygen -t ed25519 -C "your_email@example.com"
   
   # Добавьте публичный ключ в настройки вашего Git сервиса
   cat ~/.ssh/id_ed25519.pub
   ```

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
# Для systemd
sudo journalctl -u freetp-bot.service | grep -i error

# Для Docker
docker-compose logs | grep -i error
```

### Проблемы с Docker

#### Контейнер не запускается

1. **Проверьте логи:**
   ```bash
   docker-compose logs
   ```

2. **Проверьте, что .env файл существует и заполнен:**
   ```bash
   ls -la .env
   cat .env
   ```

3. **Проверьте статус контейнера:**
   ```bash
   docker-compose ps
   docker ps -a
   ```

4. **Пересоберите образ:**
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

#### Контейнер постоянно перезапускается

1. **Проверьте логи на ошибки:**
   ```bash
   docker-compose logs --tail=100
   ```

2. **Проверьте, что все переменные окружения установлены:**
   ```bash
   docker-compose exec freetp-bot env | grep TELEGRAM
   ```

3. **Проверьте права доступа к директории data:**
   ```bash
   ls -la data/
   sudo chown -R $USER:$USER data/
   ```

#### Проблемы с памятью

Если контейнер падает из-за нехватки памяти:

1. **Увеличьте лимиты в docker-compose.yml:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 1G  # Увеличьте до 1GB
   ```

2. **Перезапустите контейнер:**
   ```bash
   docker-compose up -d
   ```

#### Очистка Docker

Если нужно очистить все данные Docker:

```bash
# Остановка и удаление контейнера
docker-compose down

# Удаление образа
docker-compose down --rmi all

# Очистка неиспользуемых ресурсов
docker system prune -a
```

## Дополнительные настройки

### Настройка firewall (если используется)

Бот не требует открытых портов, так как использует polling. Но если используете webhook, откройте нужный порт:

```bash
sudo ufw allow 8443/tcp
```

### Использование Docker (рекомендуется)

Docker обеспечивает изоляцию, упрощает управление и автоматический перезапуск.

#### Установка Docker и Docker Compose

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER
# Выйдите и войдите снова, чтобы изменения вступили в силу

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка установки
docker --version
docker-compose --version
```

#### Настройка и запуск бота через Docker

1. **Клонирование репозитория:**
   ```bash
   cd ~
   git clone https://github.com/vlad-solyankin/freetp-bot-parser.git freetp-coop-bot
   cd freetp-coop-bot
   ```

2. **Создание .env файла:**
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
   NOTIFICATION_TOPIC_ID=your_topic_id_here
   ```

3. **Сборка и запуск контейнера:**
   ```bash
   # Сборка образа
   docker-compose build
   
   # Запуск контейнера (с автозапуском)
   docker-compose up -d
   
   # Проверка статуса
   docker-compose ps
   
   # Просмотр логов
   docker-compose logs -f
   ```

4. **Управление контейнером:**
   ```bash
   # Остановка
   docker-compose stop
   
   # Запуск
   docker-compose start
   
   # Перезапуск
   docker-compose restart
   
   # Остановка и удаление контейнера
   docker-compose down
   
   # Пересборка после изменений
   docker-compose up -d --build
   ```

5. **Просмотр логов:**
   ```bash
   # Все логи
   docker-compose logs
   
   # Логи в реальном времени
   docker-compose logs -f
   
   # Последние 100 строк
   docker-compose logs --tail=100
   
   # Логи за последний час
   docker-compose logs --since 1h
   ```

6. **Автозапуск при перезагрузке сервера:**
   
   Docker Compose автоматически использует политику `restart: unless-stopped`, что означает:
   - Контейнер автоматически запустится при перезагрузке сервера
   - Контейнер автоматически перезапустится при сбое
   
   Для проверки автозапуска Docker:
   ```bash
   # Проверка, что Docker запускается при загрузке
   sudo systemctl enable docker
   sudo systemctl status docker
   ```

#### Обновление бота через Docker

```bash
cd ~/freetp-coop-bot

# Получение обновлений
git pull

# Пересборка образа
docker-compose build

# Перезапуск контейнера
docker-compose up -d

# Проверка логов
docker-compose logs -f
```

#### Преимущества Docker

- ✅ Изоляция окружения
- ✅ Автоматический перезапуск при сбоях
- ✅ Простое обновление
- ✅ Консистентность на разных серверах
- ✅ Управление ресурсами (CPU, память)
- ✅ Ротация логов встроена

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

## Выбор способа деплоя

У вас есть три варианта:

1. **Docker (рекомендуется)** - изоляция, простое управление, автозапуск
2. **systemd** - нативный способ для Linux, полный контроль
3. **PM2** - удобно для разработки, простой мониторинг

Для продакшена рекомендуется использовать **Docker**, так как он обеспечивает:
- Автоматический перезапуск при сбоях
- Изоляцию от системы
- Простое обновление
- Управление ресурсами

## Готово!

Ваш бот теперь работает на VPS сервере и будет автоматически запускаться при перезагрузке сервера. Бот будет проверять новые игры каждый час и отправлять уведомления в указанный чат.
