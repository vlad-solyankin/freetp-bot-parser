## Задача

Настроить GitHub Action, который при пуше в репозиторий на GitHub будет заходить на сервер и выполнять пересборку Docker-окружения проекта (`docker compose down`, `docker compose build --no-cache`, `docker compose up -d`).

## План

1. Добавить GitHub Actions workflow в `.github/workflows/deploy.yml`.
2. Настроить workflow на запуск при пуше в основную ветку.
3. Реализовать шаг подключения по SSH к серверу с использованием GitHub Secrets.
4. В SSH-сессии выполнить команды: переход в директорию проекта, `git pull`, `docker compose down`, `docker compose build --no-cache`, `docker compose up -d`.
5. Описать, какие секреты нужно создать в GitHub и что нужно настроить на сервере.

## Результат

Автоматический деплой: при каждом пуше в репозиторий (в нужную ветку) на сервере будет автоматически обновляться код и пересобираться Docker-образ/контейнеры с полным перезапуском через `docker compose`.
