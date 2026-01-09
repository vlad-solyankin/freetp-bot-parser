# Используем официальный образ Node.js (версия 20+ для поддержки File API)
# Используем обычный образ вместо alpine для полной поддержки веб-API
FROM node:20-slim

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы конфигурации
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем все зависимости (включая dev для сборки)
RUN npm ci && npm cache clean --force

# Копируем исходный код
COPY src ./src

# Собираем проект
RUN npm run build

# Удаляем dev зависимости и исходники после сборки
RUN npm prune --production && \
    rm -rf src tsconfig.json && \
    npm cache clean --force

# Создаем директорию для данных
RUN mkdir -p /app/data

# Устанавливаем пользователя (не root для безопасности)
# В Debian-based образах используем groupadd/useradd вместо addgroup/adduser
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Открываем порт (если понадобится в будущем)
# EXPOSE 3000

# Команда запуска
CMD ["node", "dist/bot.js"]
