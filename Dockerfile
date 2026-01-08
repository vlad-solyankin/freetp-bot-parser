# Используем официальный образ Node.js
FROM node:18-alpine

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
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Открываем порт (если понадобится в будущем)
# EXPOSE 3000

# Команда запуска
CMD ["node", "dist/bot.js"]
