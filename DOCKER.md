# Docker: деплой Debately

## Почему один образ Next.js, а не «фронт + бэкенд»

В этом проекте **страницы и API** (`/api/ai/*`) — это одно приложение **Next.js App Router**: один Node-процесс отдаёт и UI, и маршруты API. Разнести «фронт» и «бэк» по разным контейнерам без переписывания API в отдельный сервер нельзя.

Схема деплоя:

| Сервис   | Роль |
|----------|------|
| **app**  | Next.js production (`next start` из standalone-сборки) |
| **nginx** (опционально) | Reverse proxy: **80** (и **443** при HTTPS) → `app:3000`, таймауты для длинных ответов AI |
| **certbot** (опционально) | Профиль `certbot`: выпуск/продление сертификатов Let's Encrypt в общие тома с nginx |

Если на сервере уже есть **Caddy / Traefik / внешний nginx** — можно поднять только контейнер **app** (`docker-compose.app-only.yml`) и проксировать на `:3000`.

---

## Локально (проверка образа)

Из корня репозитория:

```bash
docker build -t debately:latest .
docker run --rm -p 3000:3000 -e GEMINI_API_KEY="ваш_ключ" debately:latest
```

Открой `http://localhost:3000`.

---

## На сервере: пошагово

### 1. Установи Docker и Compose

Пример (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

(Перелогинься, чтобы группа `docker` применилась.)

### 2. Скопируй проект на сервер

Варианты:

- `git clone` + `git pull` на сервере;
- или `scp`/`rsync` архива с папкой проекта.

Нужны как минимум: `Dockerfile`, `docker-compose.yml` (или `docker-compose.app-only.yml`), `nginx/`, `package.json`, `package-lock.json`, исходники приложения.

### 3. Задай секреты на сервере

**Не коммить ключ в git.** На сервере создай файл `.env` рядом с compose (в той же директории):

```env
GEMINI_API_KEY=AIza...
# опционально:
# GEMINI_MODEL=gemini-2.5-flash
# GEMINI_API_KEY_SECRET_RESOURCE=projects/.../secrets/.../versions/latest
# после выпуска HTTPS-сертификата (см. раздел 6):
# NGINX_CONF=default-https.conf
```

Файл `.env` в каталоге с `docker-compose.yml` Compose подхватывает для подстановки переменных в compose (в том числе `NGINX_CONF`).

Подключи его в compose (добавь в `docker-compose.yml` или `docker-compose.app-only.yml` для сервиса `app`):

```yaml
env_file:
  - .env
```

Или экспортируй перед запуском:

```bash
export GEMINI_API_KEY="..."
```

### 4. Собери и запусти

**Вариант A — с nginx на порту 80** (файл `docker-compose.yml`):

```bash
cd /path/to/Debately
docker compose build
docker compose up -d
```

Сайт: `http://<IP_сервера>/` (порт 80).

**Вариант B — только Next на порту 3000** (без nginx в compose):

```bash
docker compose -f docker-compose.app-only.yml build
docker compose -f docker-compose.app-only.yml up -d
```

Сайт: `http://<IP_сервера>:3000`.

### 5. Логи и обновление

```bash
docker compose logs -f app
docker compose pull   # если образ из registry
docker compose up -d --build
```

### 6. HTTPS: что это и как включить в этом репозитории

#### Что такое «SSL», TLS и Let's Encrypt

- **TLS** (раньше часто говорили «SSL») — протокол, который **шифрует** HTTP-трафик между браузером и сервером и подтверждает **домен** по сертификату. В адресной строке это **HTTPS** и значок замка.
- **Сертификат** выдаёт **центр сертификации (CA)**. Браузер доверяет известным CA и проверяет, что сайт действительно контролирует домен.
- **[Let's Encrypt](https://letsencrypt.org/)** — бесплатный CA с короткоживущими сертификатами (~90 дней). Их обычно получают утилитой **[Certbot](https://certbot.eff.org/)** по протоколу **ACME** (часто метод **HTTP-01**: на порту 80 отдаётся секретный файл в `/.well-known/acme-challenge/`).

В **этом** проекте Next.js **не** слушает TLS: шифрование делается **перед** приложением — в **nginx** (или во внешнем прокси). Код приложения менять не нужно: nginx уже передаёт заголовки `X-Forwarded-Proto` и `Host` в upstream.

#### Вариант встроенный: nginx + certbot из `docker-compose.yml`

**Условия:** домен (например `debately.example.com`) в **DNS** указывает на IP сервера; открыт порт **80** (для выпуска и продления сертификата).

1. Запусти стек с **HTTP-only** конфигом по умолчанию (`NGINX_CONF` не задан или `default.conf`):

   ```bash
   docker compose up -d
   ```

2. В файле `nginx/default-https.conf` **замени все** `example.com` на свой домен (тот же, что будет в `-d` у certbot). Путь к ключам в контейнере: `/etc/letsencrypt/live/<домен>/`.

3. Выпусти сертификат (подставь домен и email):

   ```bash
   docker compose --profile certbot run --rm certbot certonly \
     --webroot --webroot-path=/var/www/certbot \
     -d debately.example.com \
     --email you@example.com \
     --agree-tos --non-interactive
   ```

   Несколько имён (например `www` и корень): добавь несколько `-d ...` и перечисли те же имена в `server_name` в `nginx/default-https.conf`.

4. Включи HTTPS-конфиг nginx: в `.env` добавь строку `NGINX_CONF=default-https.conf` и перезапусти nginx:

   ```bash
   docker compose up -d
   ```

   Сайт: `https://<домен>/`. Порт **443** уже проброшен в `docker-compose.yml`.

**Не** переключайся на `default-https.conf`, пока сертификаты не появились в томе `certbot-etc` — иначе nginx не сможет прочитать файлы и не запустится.

#### Продление (Let's Encrypt ~90 дней)

По **cron** на хосте (путь к проекту подставь свой):

```bash
0 3 * * * cd /path/to/Debately && docker compose --profile certbot run --rm certbot renew --webroot -w /var/www/certbot && docker compose exec nginx nginx -s reload
```

#### Другие варианты

- **Только приложение** (`docker-compose.app-only.yml`): TLS на **Caddy**, **Traefik**, **внешнем nginx** или у **облачного** балансировщика (Cloudflare, AWS ALB и т.д.) — проксируй на `:3000`.
- **Caddy** часто умеет сам получать Let's Encrypt — удобно, если не хочешь настраивать certbot вручную.

---

## Firewall

Открой нужные порты:

- nginx-стек: **80** и **443** (после включения `NGINX_CONF=default-https.conf` на HTTPS);
- app-only: **3000** (или только localhost, если снаружи проксирует nginx).

---

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `GEMINI_API_KEY` | Ключ Google AI Studio (обязательно, если не используешь Secret Manager) |
| `GEMINI_MODEL` | Необязательно, по умолчанию в коде `gemini-2.5-flash` |
| `GEMINI_API_KEY_SECRET_RESOURCE` | Полный путь к секрету в GCP Secret Manager (без `GEMINI_API_KEY`) |
| `NGINX_CONF` | Имя файла в каталоге `nginx/`, монтируемого как конфиг (по умолчанию `default.conf`; для HTTPS после выпуска сертификата — `default-https.conf`) |
