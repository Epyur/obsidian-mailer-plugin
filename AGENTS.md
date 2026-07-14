# AGENTS.md — Состояние проекта Obsidian Mailer Plugin

## Общая информация

- **Плагин**: Technical Assistant TECHNONICOL (obsidian-mailer-plugin)
- **Версия**: 1.0.0
- **Автор**: Полищук Евгений
- **Obsidian**: Desktop-only, minAppVersion 1.11.4 (цель: 1.12.7)
- **Сборка**: esbuild CJS, `npm run build` / `npm run dev`
- **Тесты**: отсутствуют
- **Статус публикации**: ПОДГОТОВКА (см. план ниже)

## Структура файлов

```
src/
  main.ts                   — Точка входа, настройки, жизненный цикл
  views/emails.view.ts      — Все UI: ItemView + 8 модальных окон
  database/db.ts            — Локальная БД в mailer_data.json
  services/
    document.service.ts     — Экспорт в DOCX с поддержкой изображений
    llm.service.ts          — Клиент LLM (OpenAI-совместимый API)
    sync.service.ts         — Облачная синхронизация
```

## Модель данных

- `Email`: id, number, subject, text, author, date, direction_id, **images[]**, mdFilePath, mdFileHash, lastSyncTime, sync_status, created_at
- `Direction`: id, name, description, created_at
- Хранилище: `mailer_data.json` (emails, directions, chat_history, documents)
- Изображения: `Технические письма/Изображения/` (файлы копируются через vault.adapter)
- Резервное копирование: `mailer_data_backup.json` (каждые 5 сохранений)

## Ключевые зависимости

- `obsidian` (API)
- `docx`, `jszip` (генерация DOCX)
- esbuild для сборки

## Интерфейс пользователя

- **ItemView** в боковой панели: поиск, группировка по направлениям, коллапс групп
- **8 модальных окон**: CreateEmail (с изображениями), EditEmail (с изображениями), DirectionsManager, ChatLLM, ImportJSON, ExportJSON, ResizableModal (базовый)
- **Ribbon**: 2 иконки (открыть письма, синхронизация)
- **Команды**: 3 команды (открыть письма, синхронизация, статус БД)
- **Настройки**: облачная синхронизация, локальные настройки, шаблоны DOCX, LLM

## Импорт/экспорт

- `db.exportData()` — полный дамп БД в JSON
- `db.importData(json)` — полная замена БД из JSON
- `db.exportEmailsByDirection(ids)` — экспорт писем по выбранным направлениям в импорт-совместимый JSON
- `db.addCloudEmails(emails)` — добавление писем из облака (дедупликация по id)
- `syncEmailToMd()` — экспорт каждого письма в `.md` файл (с заменой `{IMG_N}` на `![[path]]`)
- `exportToWord()` — экспорт в DOCX (через шаблон JSZip или docx lib)
- `db.saveImage(fileName, data)` — сохранение изображения в vault
- `db.deleteImage(path)` — удаление изображения из vault
- **ImportModal** — импорт JSON с маппингом направлений (создать/сопоставить/пропустить)
- **ExportModal** — экспорт писем по одному или нескольким направлениям в JSON-файл (в папку `Технические письма/Экспорт/`)

## Работа с изображениями

- Пользователь загружает изображение через диалог выбора файлов в CreateEmailModal/EditEmailModal
- Файл копируется в `Технические письма/Изображения/`
- В JSON сохраняется относительный путь в поле `images[]`
- В тексте письма используется плейсхолдер `{IMG_N}` (вставляется автоматически в позицию курсора)
- При экспорте в `.md` — замена на `![[path]]` (Obsidian wikilink, работает без ошибок)
- При экспорте в `.docx` — замена только текстовых плейсхолдеров `{{}}`, плейсхолдеры `{IMG_N}` остаются

## Экспорт в DOCX — хронология решения проблем с изображениями

### Попытка 1 — ручной XML `wp:inline` с фиксированным размером 4572000x3048000 EMU
- **Проблема**: Word выдавал "проблемы в содержимом" (corrupted), открывался после восстановления. Изображение растянуто.
- **Причина**: отсутствие namespace `xmlns:wp`, `xmlns:a`, `xmlns:pic` в корне `<w:document>`.

### Попытка 2 — ручной XML с `mc:AlternateContent` + `wp:anchor`
- **Проблема**: Word совсем не открывал файл.
- **Причина**: сложная вложенность с `mc:Choice`/`mc:Fallback` требует дополнительных namespace.

### Попытка 3 — через docx библиотеку (`Packer`/`ImageRun`)
- **Результат**: Word открывает без ошибок, изображение правильного масштаба.
- **Проблема**: полностью игнорирует шаблон — теряется оформление.

### Попытка 4 — шаблон JSZip + изображения через `wp:inline` с добавлением namespace в корень
- **Проблема**: Word не открывает файл совсем.
- **Причина**: динамический `await import('jszip')` создаёт несовместимый экземпляр.

### Попытка 5 — шаблон JSZip (статический импорт) + namespace + единый проход rels
- **Проблема**: Word не открывает файл совсем.
- **Причина**: вероятно, неполный набор namespace или несоответствие схеме OOXML.

### Попытка 6 — разделение: изображения → docx lib, без изображений → шаблон JSZip
- **Проблема**: пользователь требует использования шаблона при любых условиях.

### Текущее состояние (Попытка 7)
- Шаблон (JSZip): заменяются `{{Номер}}`, `{{Тема}}`, `{{Текст}}`, `{{Автор}}`, `{{Дата}}` и т.д.
- Плейсхолдеры `{IMG_N}` не обрабатываются и остаются в тексте как есть.
- Без шаблона: fallback через `docx` lib (тоже без изображений).

### Вывод
Ручная вставка `pic:blipFill`/`wp:inline` в OOXML через JSZip ненадёжна — Word чувствителен к отсутствию namespace, порядку тегов и схеме документа. Для 100% корректного DOCX с изображениями требуется либо:
- Полный отказ от шаблона в пользу `docx` библиотеки, либо
- Использование `docx` библиотеки для сборки документа с последующим извлечением/применением стилей из шаблона (не реализовано).

## Статус разработки

- Весь основной функционал реализован
- Все UI тексты на русском языке
- Добавлен импорт сторонних JSON-баз с UI и маппингом направлений
- Добавлена поддержка изображений (загрузка, плейсхолдеры, рендеринг в MD)
- Добавлен экспорт писем по направлениям в JSON для переноса между машинами
- Экспорт изображений в DOCX — НЕ РАБОТАЕТ (требует доработки)
- Нет тестов
- README и AGENTS.md в наличии

## Результаты code review (review.json)

### RELEASE — блокирует публикацию
- `main.js` и `manifest.json` должны быть прикреплены к GitHub Release как assets, не закоммичены в репозиторий

### API — minAppVersion не соответствует API
- Используются `SecretComponent` (1.11.1), `secretStorage` (1.11.4), `addComponent` (1.11.0), `revealLeaf` (1.7.2)
- Требуется поднять `minAppVersion` до `1.11.4`

### UI — createEl('hN') вместо Setting.setHeading()
- `src/main.ts:310,321,355,380,434` — 5 мест с `containerEl.createEl('hN')`

### STYLING — прямые style.* присвоения (2 файла, ~150 строк)
- `src/main.ts` — 3 места
- `src/views/emails.view.ts` — ~140 мест

### SECURITY/TYPING — any / unsafe access/call (все .ts файлы)
- `db.ts` — ~70 мест
- `llm.service.ts` — ~34 места
- `document.service.ts` — ~32 места
- `sync.service.ts` — ~10 мест
- `emails.view.ts` — ~38 мест
- `main.ts` — ~7 мест
- Избыточные `as`-assertions — ~85 мест
- `catch(e)` вместо `catch(e: unknown)` без проверки `instanceof Error`

### ASYNC — незавершённые Promise
- `db.ts` — 8 методов: переведены на async/await ✅
- `main.ts` — 3 места: async + await добавлены ✅
- `emails.view.ts` — 3 места: await добавлены ✅

### OBSIDIAN API — неправильные вызовы
- `setTimeout()` → `window.setTimeout()` (`emails.view.ts` — исправлено ✅, `llm.service.ts:63,86` — осталось)
- `fetch()` → `requestUrl()` (`sync.service.ts:40,76`)
- `display()` deprecated с 1.13.0 → `getSettingDefinitions()` (низкий приоритет)

### Warnings (рекомендуется)
- Отсутствует `LICENSE`
- manifest.json: описание без точки в конце
- README.md: заголовок не совпадает с manifest.json `name`
- `lodash` в зависимостях — не используется, удалить
- `styles.css:172` — `!important`

### Recommendations (чистка)
- Все неиспользуемые импорты и переменные удалены ✅

## План подготовки к публикации

| # | Категория | Действие | Файлы | Статус |
|---|---|---|---|---|
| 1 | RELEASE | `.gitignore` + GitHub Release с assets | корень | ✅ |
| 2 | MANIFEST | `minAppVersion` → `"1.11.4"`, описание с точкой | `manifest.json` | ✅ |
| 3 | DEPS | Удалить `lodash`, `@types/lodash` | `package.json` | ✅ |
| 4 | UI | `createEl('hN')` → `Setting.setHeading()` | `main.ts` | ✅ |
| 5 | STYLING | Инлайн-стили → CSS классы | `main.ts`, `emails.view.ts`, `styles.css` | ✅ |
| 6 | TYPING | `any` → конкретные интерфейсы | все `.ts` | ✅ |
| 7 | TYPING | `catch(e)` → `catch(e: unknown)` + `instanceof Error` | все `.ts` | ✅ |
| 8 | TYPING | Убрать избыточные `as`-assertions | все `.ts` | ✅ |
| 9 | ASYNC | `void` + `.catch()` для Promise | `main.ts`, `db.ts`, `emails.view.ts` | ✅ |
| 10 | OBSIDIAN API | `setTimeout` → `window.setTimeout` | `emails.view.ts` | ✅ |
| 11 | OBSIDIAN API | `fetch` → `requestUrl` | `sync.service.ts` | ✅ |
| 12 | LICENSE | Добавить MIT License | корень | ✅ |
| 13 | README | Заголовок = `name` из manifest.json | `README.md` | ✅ |
| 14 | CSS LINT | Убрать `!important` | `styles.css` | ✅ |
| 15 | CLEANUP | Удалить неиспользуемые импорты и переменные | все `.ts` | ✅ |

**Легенда статусов:** ⏳ — ожидает / ✅ — готово / ❌ — блокировано
