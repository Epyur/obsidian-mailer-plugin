# Правила разработки плагинов для Obsidian

## Архитектура и структура

- Точка входа: `main.ts` — жизненный цикл, настройки, ribbon, команды
- UI: `views/*.view.ts` — ItemView и модальные окна
- Данные: `database/db.ts` — локальная БД в JSON-файле
- Сервисы: `services/*.service.ts` — бизнес-логика (LLM, синхронизация, документы)
- Сборка: esbuild CJS, `npm run build` / `npm run dev`

## TypeScript

### Запрещено использовать `any`

- Каждое появление `any` должно быть заменено на конкретный тип или интерфейс
- Для параметров функций, возвращаемых значений, переменных — всегда явный тип
- `Record<string, any>` → `Record<string, unknown>` или конкретная сигнатура
- `catch(e: any)` запрещён

### `catch(e: unknown)` — обязателен

```ts
// Правильно
catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  new Notice(msg);
}

// Неправильно
catch (e) {
  new Notice(e.message);
}
catch (e: any) {
  new Notice(e.message);
}
```

### Избегать избыточных `as`-assertions

- Предпочитать `is`-проверки, type guards, сужение типов
- Использовать `as` только когда TypeScript не может вывести тип (например, `JSON.parse`)
- Проверять через `instanceof`, `typeof`, пользовательские type guards

### Асинхронные операции

- Все Promise должны быть завершены: `await` или `void promise.catch()`
- Запрещены `this.saveData()` без `await` и `.catch()`
- `setTimeout(...)` → `window.setTimeout(...)`
- `fetch(...)` → `requestUrl(...)`

## Obsidian API

- `minAppVersion` в `manifest.json` должен соответствовать используемому API
- `Setting.setHeading()` вместо `containerEl.createEl('hN')`
- `SecretComponent` — для токенов через `secretStorage`
- `addComponent()` — для кастомных компонентов настроек
- `requestUrl()` вместо `fetch()` (Obsidian-совместимость)
- `window.setTimeout()` вместо `setTimeout()` (избегать конфликтов)

## Рабочий процесс

- Один пункт плана за раз — не переключаться на следующий, пока текущий не завершён
- При завершении пункта плана — актуализировать статус в AGENTS.md (таблица в секции "План подготовки к публикации")

## Стилизация

- Запрещены инлайн-стили через `.style.cssText` или `.style.*`
- Все стили — в CSS классы в `styles.css`
- Префикс классов: `mailer-*`
- Избегать `!important` (кроме крайней необходимости для переопределения Obsidian)
- Использовать CSS-переменные Obsidian: `var(--background-secondary)`, `var(--interactive-accent)` и т.д.

## Настройки (Settings tab)

```ts
new Setting(containerEl)
  .setHeading()
  .setName('Section title');

new Setting(containerEl)
  .setName('Setting name')
  .setDesc('Description')
  .addText(text => text
    .setPlaceholder('Placeholder')
    .setValue(this.plugin.settings.someField)
    .onChange(async (value) => {
      this.plugin.settings.someField = value;
      await this.plugin.saveSettings();
    }));
```

## Импорт/экспорт

- Экспорт: `db.exportData()` — полный дамп; `db.exportEmailsByDirection(ids)` — по направлениям
- Импорт: `db.importData(json)` — полная замена; `db.addCloudEmails(emails)` — с дедупликацией
- JSON-файлы сохраняются в папку `Технические письма/Экспорт/`

## Изображения

- Хранятся в `Технические письма/Изображения/`
- В тексте — плейсхолдер `{IMG_N}`
- При экспорте в `.md` заменяются на `![[path]]`
- При экспорте в `.docx` — только текстовые плейсхолдеры `{{}}`
- Изображения в DOCX через шаблон JSZip — не работают. Fallback: `docx` библиотека

## Публикация (GitHub Release)

- `.gitignore`: исключить `node_modules/`, `main.js`, `manifest.json`, `styles.css`, `data.json`, `*.log`
- Собранные `main.js`, `manifest.json`, `styles.css` — assets релиза, не в репозитории
- Версионирование через `package.json` и `manifest.json`
