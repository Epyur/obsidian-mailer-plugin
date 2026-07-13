// src/views/emails.view.ts
import { ItemView, WorkspaceLeaf, Notice, TFile, Modal, App } from 'obsidian';
import MailerPlugin from '../main';
import { Email, Direction, DbData, Stats } from '../database/db';
import { DatabaseData } from '../services/llm.service';

export const VIEW_TYPE_EMAILS = 'mailer-emails-view';

// ===== БАЗОВЫЙ КЛАСС ДЛЯ МОДАЛЬНЫХ ОКОН С ИЗМЕНЯЕМЫМ РАЗМЕРОМ =====
class ResizableModal extends Modal {
  protected isFullscreen: boolean = false;
  protected modalContent: HTMLElement | null = null;
  protected previousWidth: string = '';
  protected previousHeight: string = '';

  constructor(app: App) {
    super(app);
  }

  protected makeResizable(contentEl: HTMLElement): void {
    this.modalContent = contentEl;
    
    const modalEl = contentEl.parentElement;
    if (modalEl) {
      (modalEl as HTMLElement).addClass('mailer-modal-resizable');
    }
  }

  protected addFullscreenButton(headerEl: HTMLElement): void {
    const fullscreenBtn = headerEl.createEl('button', { cls: 'mailer-fullscreen-btn' });
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = 'Развернуть на весь экран';

    fullscreenBtn.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    const headerContainer = headerEl.parentElement;
    if (headerContainer) {
      const h2 = headerContainer.querySelector('h2');
      if (h2) {
        h2.after(fullscreenBtn);
      }
    }
  }

  protected toggleFullscreen(): void {
    const modalEl = this.modalContent?.parentElement;
    if (!modalEl) return;

    const modalElStyle = modalEl as HTMLElement;
    
    if (!this.isFullscreen) {
      this.previousWidth = modalElStyle.style.width || '';
      this.previousHeight = modalElStyle.style.height || '';
      
      modalElStyle.addClass('mailer-modal-fullscreen');
      
      this.isFullscreen = true;
      
      const btn = modalEl.querySelector('.mailer-fullscreen-btn');
      if (btn) {
        btn.textContent = '⛶';
        btn.setAttribute('title', 'Вернуть обычный размер');
      }
    } else {
      modalElStyle.removeClass('mailer-modal-fullscreen');
      
      this.isFullscreen = false;
      
      const btn = modalEl.querySelector('.mailer-fullscreen-btn');
      if (btn) {
        btn.textContent = '⛶';
        btn.setAttribute('title', 'Развернуть на весь экран');
      }
    }
  }

  protected setupResizeHandle(contentEl: HTMLElement): void {
    const resizeHint = contentEl.createEl('div', { cls: 'mailer-resize-hint' });
    resizeHint.textContent = '↘︎ тяните для изменения размера';
  }
}

// ===== МОДАЛЬНОЕ ОКНО ДЛЯ СОЗДАНИЯ ПИСЬМА =====
class CreateEmailModal extends ResizableModal {
  plugin: MailerPlugin;
  onSubmit: (email: Partial<Email>) => void;
  onCancel: () => void;
  images: ({ path: string; fileName: string } | null)[] = [];

  constructor(plugin: MailerPlugin, onSubmit: (email: Partial<Email>) => void, onCancel: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-modal-content');
    
    this.makeResizable(contentEl);

    const headerContainer = contentEl.createDiv({ cls: 'mailer-modal-header' });
    
    const titleEl = headerContainer.createEl('h2', { text: '📝 Новое письмо' });
    
    this.addFullscreenButton(headerContainer);
    
    contentEl.createEl('p', { text: 'Заполните поля и сохраните письмо в локальную базу', cls: 'mailer-modal-desc' });

    const formContainer = contentEl.createDiv({ cls: 'mailer-modal-form' });

    // Поле: Номер
    const numberGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    numberGroup.createEl('label', { text: '№ исходящего:', cls: 'mailer-form-label' });
    const numberInput = numberGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: 'Например: 00268' });

    // Поле: Тема
    const subjectGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    subjectGroup.createEl('label', { text: 'Тема:', cls: 'mailer-form-label' });
    const subjectInput = subjectGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: 'Краткое описание письма' });

    // Поле: Автор
    const authorGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    authorGroup.createEl('label', { text: 'Автор:', cls: 'mailer-form-label' });
    const authorInput = authorGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: this.plugin.settings.defaultAuthor });
    authorInput.value = this.plugin.settings.defaultAuthor;

    // Поле: Направление
    const dirGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    dirGroup.createEl('label', { text: 'Направление:', cls: 'mailer-form-label', attr: { for: 'email-direction-select' } });
    
    const dirSelect = dirGroup.createEl('select', { 
      cls: 'mailer-form-input-wide',
      attr: { id: 'email-direction-select' }
    });
    
    this.updateDirectionSelect(dirSelect);

    // Поле: Изображения
    const imagesGroup = formContainer.createDiv({ cls: 'mailer-form-group-shrink' });
    imagesGroup.createEl('label', { text: '🖼️ Изображения:', cls: 'mailer-form-label' });

    const imagesToolbar = imagesGroup.createDiv({ cls: 'mailer-images-toolbar' });

    const addImageBtn = imagesToolbar.createEl('button', { cls: 'mailer-btn-image' });
    addImageBtn.textContent = '📎 Добавить изображение';

    const imageFileInput = imagesToolbar.createEl('input', { type: 'file', attr: { accept: 'image/*' }, cls: 'mailer-form-hidden' });

    const imagesList = imagesGroup.createDiv({ cls: 'mailer-images-list' });

    addImageBtn.addEventListener('click', () => imageFileInput.click());

    imageFileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const imgIndex = this.images.length + 1;
        const fileName = `${Date.now()}_${file.name}`;
        const savedPath = await this.plugin.db.saveImage(fileName, buffer);
        if (savedPath) {
          this.images.push({ path: savedPath, fileName: file.name });
          this.renderImageTag(imagesList, file.name, imgIndex);
          this.insertPlaceholder(textArea, imgIndex);
        }
      }
      imageFileInput.value = '';
    });

    // Поле: Текст
    const textGroup = formContainer.createDiv({ cls: 'mailer-form-group-flex' });
    textGroup.createEl('label', { text: 'Текст письма:', cls: 'mailer-form-label' });
    const textArea = textGroup.createEl('textarea', { cls: 'mailer-form-textarea', placeholder: 'Введите текст письма...' });

    // Кнопки
    const btnGroup = formContainer.createDiv({ cls: 'mailer-form-buttons' });
    
    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn-default' });
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    
    const saveBtn = btnGroup.createEl('button', { cls: 'mailer-btn-primary' });
    saveBtn.textContent = '💾 Сохранить письмо';
    saveBtn.addEventListener('click', async () => {
      const email = {
        number: numberInput.value.trim(),
        subject: subjectInput.value.trim(),
        author: authorInput.value.trim() || this.plugin.settings.defaultAuthor,
        text: textArea.value,
        direction_id: parseInt(dirSelect.value) || 0,
        images: this.images.filter((img): img is { path: string; fileName: string } => img !== null).map(img => img.path)
      };
      
      if (!email.subject || !email.text) {
        new Notice('⚠️ Заполните тему и текст письма');
        return;
      }
      
      this.close();
      this.onSubmit(email);
    });

    textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveBtn.click();
      }
    });

    this.setupResizeHandle(contentEl);

    setTimeout(() => subjectInput.focus(), 100);
  }

  renderImageTag(container: HTMLElement, fileName: string, index: number) {
    const tag = container.createEl('span', { cls: 'mailer-image-tag' });
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;

    const removeBtn = tag.createEl('span', { cls: 'mailer-image-remove', text: '✕' });
    removeBtn.addEventListener('click', () => {
      const img = this.images[index - 1];
      if (img) {
        this.plugin.db.deleteImage(img.path);
        this.images[index - 1] = null as any;
      }
      tag.remove();
    });
  }

  insertPlaceholder(textArea: HTMLTextAreaElement, index: number) {
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const placeholder = `{IMG_${index}}`;
    const text = textArea.value;
    textArea.value = text.substring(0, start) + placeholder + text.substring(end);
    const pos = start + placeholder.length;
    textArea.selectionStart = pos;
    textArea.selectionEnd = pos;
    textArea.focus();
  }

  updateDirectionSelect(dirSelect: HTMLSelectElement) {
    const directions = this.plugin.db.getDirections();
    dirSelect.empty();
    const defaultOption = dirSelect.createEl('option', { value: '0' });
    defaultOption.textContent = 'Без направления';
    directions.forEach((d: Direction) => {
      const option = dirSelect.createEl('option', { value: String(d.id) });
      option.textContent = d.name;
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПИСЬМА =====
class EditEmailModal extends ResizableModal {
  plugin: MailerPlugin;
  email: Email;
  onSubmit: (updatedEmail: Partial<Email>) => void;
  onCancel: () => void;
  images: ({ path: string; fileName: string } | null)[] = [];

  constructor(plugin: MailerPlugin, email: Email, onSubmit: (updatedEmail: Partial<Email>) => void, onCancel: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.email = email;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-modal-content');
    
    this.makeResizable(contentEl);

    const headerContainer = contentEl.createDiv({ cls: 'mailer-modal-header' });
    
    const titleEl = headerContainer.createEl('h2', { text: '✏️ Редактирование письма' });
    
    this.addFullscreenButton(headerContainer);
    
    contentEl.createEl('p', { text: 'Измените поля и сохраните изменения', cls: 'mailer-modal-desc' });

    const formContainer = contentEl.createDiv({ cls: 'mailer-modal-form' });

    // Поле: Номер
    const numberGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    numberGroup.createEl('label', { text: '№ исходящего:', cls: 'mailer-form-label' });
    const numberInput = numberGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    numberInput.value = this.email.number || '';

    // Поле: Тема
    const subjectGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    subjectGroup.createEl('label', { text: 'Тема:', cls: 'mailer-form-label' });
    const subjectInput = subjectGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    subjectInput.value = this.email.subject || '';

    // Поле: Автор
    const authorGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    authorGroup.createEl('label', { text: 'Автор:', cls: 'mailer-form-label' });
    const authorInput = authorGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    authorInput.value = this.email.author || this.plugin.settings.defaultAuthor;

    // Поле: Направление
    const dirGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    dirGroup.createEl('label', { text: 'Направление:', cls: 'mailer-form-label', attr: { for: 'email-direction-select-edit' } });
    
    const dirSelect = dirGroup.createEl('select', { 
      cls: 'mailer-form-input-wide',
      attr: { id: 'email-direction-select-edit' }
    });
    
    const directions = this.plugin.db.getDirections();
    const defaultOption = dirSelect.createEl('option', { value: '0' });
    defaultOption.textContent = 'Без направления';
    directions.forEach((d: Direction) => {
      const option = dirSelect.createEl('option', { value: String(d.id) });
      option.textContent = d.name;
    });
    dirSelect.value = String(this.email.direction_id || 0);

    // Поле: Изображения
    const imagesGroup = formContainer.createDiv({ cls: 'mailer-form-group-shrink' });
    imagesGroup.createEl('label', { text: '🖼️ Изображения:', cls: 'mailer-form-label' });

    const imagesToolbar = imagesGroup.createDiv({ cls: 'mailer-images-toolbar' });

    const addImageBtn = imagesToolbar.createEl('button', { cls: 'mailer-btn-image' });
    addImageBtn.textContent = '📎 Добавить изображение';

    const imageFileInput = imagesToolbar.createEl('input', { type: 'file', attr: { accept: 'image/*' }, cls: 'mailer-form-hidden' });

    const imagesList = imagesGroup.createDiv({ cls: 'mailer-images-list' });

    // Загружаем существующие изображения
    const existingImages: string[] = this.email.images || [];
    let nextImgIndex = 1;
    for (const imgPath of existingImages) {
      this.images.push({ path: imgPath, fileName: imgPath.split('/').pop() || imgPath });
      const tag = this.renderExistingImageTag(imagesList, imgPath, nextImgIndex);
      this.images[nextImgIndex - 1] = { path: imgPath, fileName: imgPath.split('/').pop() || imgPath };
      nextImgIndex++;
    }

    addImageBtn.addEventListener('click', () => imageFileInput.click());

    imageFileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const imgIndex = this.images.length + 1;
        const fileName = `${Date.now()}_${file.name}`;
        const savedPath = await this.plugin.db.saveImage(fileName, buffer);
        if (savedPath) {
          this.images.push({ path: savedPath, fileName: file.name });
          this.renderImageTag(imagesList, file.name, imgIndex);
          this.insertPlaceholder(textArea, imgIndex);
        }
      }
      imageFileInput.value = '';
    });

    // Поле: Текст
    const textGroup = formContainer.createDiv({ cls: 'mailer-form-group-flex' });
    textGroup.createEl('label', { text: 'Текст письма:', cls: 'mailer-form-label' });
    const textArea = textGroup.createEl('textarea', { cls: 'mailer-form-textarea-tall' });
    textArea.value = this.email.text || '';

    // Кнопки
    const btnGroup = formContainer.createDiv({ cls: 'mailer-form-buttons' });
    
    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn-default' });
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    
    const saveBtn = btnGroup.createEl('button', { cls: 'mailer-btn-primary' });
    saveBtn.textContent = '💾 Сохранить изменения';
    saveBtn.addEventListener('click', async () => {
      const updatedEmail = {
        ...this.email,
        number: numberInput.value.trim(),
        subject: subjectInput.value.trim(),
        author: authorInput.value.trim() || this.plugin.settings.defaultAuthor,
        text: textArea.value,
        direction_id: parseInt(dirSelect.value) || 0,
        images: this.images.filter((img): img is { path: string; fileName: string } => img !== null).map(img => img.path)
      };
      
      if (!updatedEmail.subject || !updatedEmail.text) {
        new Notice('⚠️ Заполните тему и текст письма');
        return;
      }
      
      this.close();
      this.onSubmit(updatedEmail);
    });

    textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveBtn.click();
      }
    });

    this.setupResizeHandle(contentEl);

    setTimeout(() => subjectInput.focus(), 100);
  }

  renderExistingImageTag(container: HTMLElement, imgPath: string, index: number): HTMLSpanElement {
    const tag = container.createEl('span', { cls: 'mailer-image-tag' });
    const fileName = imgPath.split('/').pop() || imgPath;
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;
    return tag;
  }

  renderImageTag(container: HTMLElement, fileName: string, index: number) {
    const tag = container.createEl('span', { cls: 'mailer-image-tag' });
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;

    const removeBtn = tag.createEl('span', { cls: 'mailer-image-remove', text: '✕' });
    removeBtn.addEventListener('click', () => {
      const img = this.images[index - 1];
      if (img) {
        this.plugin.db.deleteImage(img.path);
        this.images[index - 1] = null as any;
      }
      tag.remove();
    });
  }

  insertPlaceholder(textArea: HTMLTextAreaElement, index: number) {
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const placeholder = `{IMG_${index}}`;
    const text = textArea.value;
    textArea.value = text.substring(0, start) + placeholder + text.substring(end);
    const pos = start + placeholder.length;
    textArea.selectionStart = pos;
    textArea.selectionEnd = pos;
    textArea.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== МОДАЛЬНОЕ ОКНО УПРАВЛЕНИЯ НАПРАВЛЕНИЯМИ =====
class DirectionsManagerModal extends Modal {
  plugin: MailerPlugin;
  onUpdate: () => void;

  constructor(plugin: MailerPlugin, onUpdate: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onUpdate = onUpdate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-dir-modal');

    contentEl.createEl('h2', { text: '📂 Управление направлениями' });
    contentEl.createEl('p', { text: 'Создавайте и удаляйте направления', cls: 'mailer-modal-desc' });

    const createContainer = contentEl.createDiv({ cls: 'mailer-dir-create' });
    
    const newDirInput = createContainer.createEl('input', {
      type: 'text',
      placeholder: 'Название нового направления...',
      cls: 'mailer-dir-input'
    });
    
    const addBtn = createContainer.createEl('button', { cls: 'mailer-btn-create-dir' });
    addBtn.textContent = '➕ Создать';
    addBtn.addEventListener('click', async () => {
      const name = newDirInput.value.trim();
      if (!name) {
        new Notice('⚠️ Введите название направления');
        return;
      }
      const id = this.plugin.db.saveDirection(name);
      if (id > 0) {
        new Notice(`✅ Направление "${name}" создано`);
        newDirInput.value = '';
        this.renderDirectionsList(contentEl);
        this.onUpdate();
      }
    });
    newDirInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
    });

    this.renderDirectionsList(contentEl);
    setTimeout(() => newDirInput.focus(), 100);
  }

  renderDirectionsList(contentEl: HTMLElement) {
    let listContainer = contentEl.querySelector('.mailer-dir-list');
    if (!listContainer) {
      listContainer = contentEl.createDiv({ cls: 'mailer-dir-list' });
    } else {
      listContainer.empty();
    }

    const directions = this.plugin.db.getDirections();
    
    if (directions.length === 0) {
      const emptyEl = listContainer.createEl('p', { text: '📭 Нет созданных направлений', cls: 'mailer-dir-empty' });
      return;
    }

    directions.forEach((dir: Direction) => {
      const item = listContainer.createEl('div', { cls: 'mailer-dir-item' });
      
      const nameSpan = item.createEl('span', { cls: 'mailer-dir-name', text: `📂 ${dir.name}` });
      
      const actions = item.createEl('div', { cls: 'mailer-dir-actions' });
      
      const deleteBtn = actions.createEl('button', { cls: 'mailer-btn-danger' });
      deleteBtn.textContent = '🗑️';
      deleteBtn.addEventListener('click', async () => {
        const emails = this.plugin.db.getAllEmails();
        const hasEmails = emails.some((e: Email) => e.direction_id === dir.id);
        if (hasEmails) {
          new Notice(`⚠️ Нельзя удалить "${dir.name}" - есть письма с этим направлением`);
          return;
        }
        
        try {
          const allData: DbData = JSON.parse(this.plugin.db.exportData());
          allData.directions = allData.directions.filter((d: Direction) => d.id !== dir.id);
          const success = this.plugin.db.importData(JSON.stringify(allData));
          
          if (success) {
            new Notice(`🗑️ Направление "${dir.name}" удалено`);
            this.renderDirectionsList(contentEl);
            this.onUpdate();
          } else {
            new Notice('❌ Ошибка удаления направления');
          }
        } catch (error: unknown) {
          console.error('Ошибка удаления направления:', error);
          new Notice(`❌ Ошибка: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== МОДАЛЬНОЕ ОКНО ЧАТА С LLM =====
class ChatLLMModal extends Modal {
  plugin: MailerPlugin;
  messages: { role: 'user' | 'assistant'; content: string }[] = [];
  uploadedFiles: { name: string; content: string }[] = [];
  chatContainer: HTMLElement | null = null;
  inputArea: HTMLTextAreaElement | null = null;
  isProcessing: boolean = false;
  lastAnswer: string = '';
  lastQuestion: string = '';

  constructor(plugin: MailerPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-chat-modal');

    const header = contentEl.createDiv({ cls: 'mailer-chat-header' });
    header.createEl('h2', { text: '🤖 Чат с AI помощником' });
    
    const headerActions = header.createDiv({ cls: 'mailer-chat-header-actions' });
    
    const clearBtn = headerActions.createEl('button', { cls: 'mailer-btn-chat' });
    clearBtn.textContent = '🗑️ Очистить';
    clearBtn.addEventListener('click', () => {
      this.messages = [];
      this.uploadedFiles = [];
      this.lastAnswer = '';
      this.lastQuestion = '';
      if (this.chatContainer) {
        this.chatContainer.empty();
        const welcomeMsg = this.chatContainer.createDiv({ cls: 'mailer-chat-message mailer-chat-message-assistant' });
        welcomeMsg.textContent = '👋 Здравствуйте! Я AI-помощник по пожарной безопасности TECHNONICOL. Задайте мне вопрос по базе писем или загрузите документ для анализа.';
      }
      this.updateInfoBar();
      new Notice('🗑️ История чата очищена');
    });
    
    const createEmailBtn = headerActions.createEl('button', { cls: 'mailer-btn-chat-primary' });
    createEmailBtn.textContent = '📝 Создать письмо';
    createEmailBtn.addEventListener('click', () => {
      if (!this.lastAnswer) {
        new Notice('⚠️ Сначала получите ответ от AI');
        return;
      }
      this.close();
      this.openCreateEmailFromLLM(this.lastAnswer, this.lastQuestion);
    });
    
    const closeBtn = headerActions.createEl('button', { cls: 'mailer-btn-chat' });
    closeBtn.textContent = '✕ Закрыть';
    closeBtn.addEventListener('click', () => this.close());

    const infoBar = contentEl.createDiv({ cls: 'mailer-chat-info' });
    this.updateInfoBar(infoBar);

    this.chatContainer = contentEl.createDiv({ cls: 'mailer-chat-messages' });

    const welcomeMsg = this.chatContainer.createDiv({ cls: 'mailer-chat-message mailer-chat-message-assistant' });
    welcomeMsg.textContent = '👋 Здравствуйте! Я AI-помощник по пожарной безопасности TECHNONICOL. Задайте мне вопрос по базе писем или загрузите документ для анализа.';

    const fileArea = contentEl.createDiv({ cls: 'mailer-chat-file-area' });
    
    const fileInput = fileArea.createEl('input', { type: 'file', attr: { multiple: 'true' }, cls: 'mailer-form-hidden' });
    fileInput.accept = '.pdf,.docx,.doc,.txt,.json,.md,.csv,.xlsx,.xls';
    
    const uploadBtn = fileArea.createEl('button', { cls: 'mailer-btn-upload' });
    uploadBtn.textContent = '📎 Загрузить документ';
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    const fileList = fileArea.createDiv({ cls: 'mailer-chat-file-list' });
    
    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      
      for (const file of Array.from(files)) {
        try {
          let content = '';
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          
          if (['txt', 'json', 'md', 'csv'].includes(ext)) {
            content = await file.text();
          } else if (['docx', 'doc'].includes(ext)) {
            content = await file.text();
            content = `[Документ: ${file.name}]\n${content.substring(0, 5000)}...`;
          } else if (ext === 'pdf') {
            content = await file.text();
            content = `[PDF: ${file.name}]\n${content.substring(0, 5000)}...`;
          } else {
            content = `[Файл: ${file.name}] (бинарный файл)`;
          }
          
          this.uploadedFiles.push({ name: file.name, content: content });
          
          const tag = fileList.createEl('span', { cls: 'mailer-chat-file-tag' });
          tag.textContent = `📄 ${file.name}`;
          
          const removeBtn = tag.createEl('span', { cls: 'mailer-chat-file-remove', text: '✕' });
          removeBtn.addEventListener('click', () => {
            const idx = this.uploadedFiles.findIndex(f => f.name === file.name);
            if (idx > -1) {
              this.uploadedFiles.splice(idx, 1);
              tag.remove();
              this.updateInfoBar(infoBar);
            }
          });
          
          this.updateInfoBar(infoBar);
          new Notice(`✅ Загружен: ${file.name}`);
        } catch (error: unknown) {
          new Notice(`❌ Ошибка загрузки ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      fileInput.value = '';
    });

    const inputContainer = contentEl.createDiv({ cls: 'mailer-chat-input-container' });
    
    this.inputArea = inputContainer.createEl('textarea', { cls: 'mailer-chat-input' });
    this.inputArea.placeholder = 'Введите вопрос... (Shift+Enter для переноса, Enter для отправки)';
    this.inputArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    const sendBtn = inputContainer.createEl('button', { cls: 'mailer-btn-send' });
    sendBtn.textContent = '✉️ Отправить';
    sendBtn.addEventListener('click', () => this.sendMessage());
  }

  updateInfoBar(infoBar?: HTMLElement) {
    const stats = this.plugin.db.getStats();
    const bar = infoBar || this.contentEl.querySelector('.mailer-chat-info');
    if (bar) {
      bar.textContent = `📊 База знаний: ${stats.emails} писем | Направлений: ${stats.directions} | Загруженных файлов: ${this.uploadedFiles.length}`;
    }
  }

  async sendMessage() {
    if (!this.inputArea) return;
    if (this.isProcessing) return;
    
    const question = this.inputArea.value.trim();
    if (!question) {
      new Notice('⚠️ Введите вопрос');
      return;
    }
    
    this.lastQuestion = question;
    this.addMessage('user', question);
    this.inputArea.value = '';
    this.inputArea.style.height = 'auto';
    this.isProcessing = true;
    
    try {
      const allData = this.plugin.db.exportData();
      const database = JSON.parse(allData);
      
      let fileContext = '';
      if (this.uploadedFiles.length > 0) {
        fileContext = '\n\n## ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ:\n';
        for (const file of this.uploadedFiles) {
          fileContext += `\n--- ${file.name} ---\n${file.content}\n`;
        }
      }
      
      let historyContext = '\n\n## ИСТОРИЯ ЧАТА:\n';
      for (const msg of this.messages.slice(-6)) {
        historyContext += `\n${msg.role === 'user' ? '👤 Пользователь' : '🤖 AI'}: ${msg.content.substring(0, 300)}...\n`;
      }
      
      const answer = await this.plugin.llmService.askOnDatabaseWithContext(
        database,
        this.plugin.settings,
        question,
        fileContext,
        historyContext
      );
      
      this.lastAnswer = answer;
      this.addMessage('assistant', answer);
      
    } catch (error: unknown) {
      new Notice(`❌ Ошибка: ${error instanceof Error ? error.message : String(error)}`);
      this.addMessage('assistant', `❌ Извините, произошла ошибка: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    this.isProcessing = false;
  }

  addMessage(role: 'user' | 'assistant', content: string) {
    this.messages.push({ role, content });
    if (!this.chatContainer) return;
    
    const msgEl = this.chatContainer.createDiv({ cls: `mailer-chat-message mailer-chat-message-${role}` });
    
    const label = msgEl.createEl('div', { cls: 'mailer-chat-label' });
    label.textContent = role === 'user' ? '👤 Вы' : '🤖 AI помощник';
    
    const textEl = msgEl.createEl('div', { cls: 'mailer-chat-message-text' });
    textEl.textContent = content;
    
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  openCreateEmailFromLLM(answer: string, question: string) {
    const modal = new CreateEmailModal(
      this.plugin,
      async (email) => {
        const llmContent = `**Вопрос пользователя:**\n${question || 'Не указан'}\n\n**Ответ AI помощника:**\n\n${answer}\n\n---\n*Сгенерировано автоматически с помощью AI помощника*`;
        const fullEmail = {
          ...email,
          text: email.text ? `${email.text}\n\n---\n${llmContent}` : llmContent
        };
        const id = this.plugin.db.saveEmail(fullEmail);
        if (id > 0) {
          new Notice('✅ Письмо с ответом LLM сохранено!');
        } else {
          new Notice('❌ Ошибка сохранения письма');
        }
      },
      () => {
        console.log('📝 Создание письма из LLM отменено');
      }
    );
    modal.open();
    
    setTimeout(() => {
      const subjectInput = modal.contentEl.querySelector('input[type="text"]:nth-of-type(2)') as HTMLInputElement;
      const textArea = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
      
      if (subjectInput) {
        const shortQuestion = question.length > 50 ? question.substring(0, 50) + '...' : question;
        subjectInput.value = `Ответ AI: ${shortQuestion}`;
      }
      
      if (textArea) {
        const content = `**Вопрос пользователя:**\n${question || 'Не указан'}\n\n**Ответ AI помощника:**\n\n${answer}\n\n---\n*Сгенерировано автоматически с помощью AI помощника*`;
        textArea.value = content;
      }
    }, 200);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== МОДАЛЬНОЕ ОКНО ИМПОРТА ПИСЕМ ИЗ JSON =====
class ImportModal extends Modal {
  plugin: MailerPlugin;
  onUpdate: () => void;

  private importedData: DbData | null = null;
  private fileDirections: Direction[] = [];
  private mapping: Map<number, number> = new Map(); // fileDirId -> targetDirId
  private selectedFilePath: string = '';

  constructor(plugin: MailerPlugin, onUpdate: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onUpdate = onUpdate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-import-modal');

    contentEl.createEl('h2', { text: '📥 Импорт писем из JSON' });
    contentEl.createEl('p', { text: 'Выберите JSON-файл с письмами для импорта в локальную базу', cls: 'mailer-modal-desc' });

    const fileGroup = contentEl.createDiv({ cls: 'mailer-import-file-group' });

    const fileBtn = fileGroup.createEl('button', { cls: 'mailer-btn-file' });
    fileBtn.textContent = '📂 Выбрать файл';

    const fileLabel = fileGroup.createEl('span', { cls: 'mailer-import-file-label' });

    const fileInput = fileGroup.createEl('input', { type: 'file', attr: { accept: '.json' }, cls: 'mailer-form-hidden' });

    fileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const file = files[0];
      fileLabel.textContent = `📄 ${file.name}`;
      this.selectedFilePath = file.name;

      try {
        const raw = await file.text();
        const data = JSON.parse(raw);

        if (!data.emails || !Array.isArray(data.emails)) {
          new Notice('⚠️ В JSON не найден массив "emails"');
          return;
        }

        this.importedData = data;
        this.fileDirections = data.directions && Array.isArray(data.directions) ? data.directions : [];

        this.renderMappingStep(contentEl, fileInput);
      } catch (err: unknown) {
        new Notice(`❌ Ошибка парсинга JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    this.renderFileStep(contentEl, fileInput, fileBtn, fileLabel);
  }

  private renderFileStep(contentEl: HTMLElement, fileInput: HTMLInputElement, fileBtn: HTMLButtonElement, fileLabel: HTMLElement) {
    const existingContent = contentEl.querySelector('.import-content');
    if (existingContent) existingContent.remove();
  }

  private renderMappingStep(contentEl: HTMLElement, fileInput: HTMLInputElement) {
    const existingContent = contentEl.querySelector('.import-content');
    if (existingContent) existingContent.remove();

    const contentDiv = contentEl.createDiv({ cls: 'mailer-import-content' });

    if (!this.importedData) return;
    const totalEmails = this.importedData.emails.length;
    const totalDirs = this.fileDirections.length;

    const summary = contentDiv.createEl('div', { cls: 'mailer-import-summary' });
    summary.createEl('p', { text: `📊 Найдено в файле: ${totalEmails} писем, ${totalDirs} направлений` });

    if (totalDirs > 0) {
      contentDiv.createEl('h3', { text: '🔄 Настройка соответствия направлений' });
      contentDiv.createEl('p', { text: 'Для каждого направления из файла укажите, куда его отобразить:', cls: 'mailer-modal-desc' });

      const dbDirections = this.plugin.db.getDirections();

      this.fileDirections.forEach((fileDir: Direction) => {
        const row = contentDiv.createEl('div', { cls: 'mailer-import-mapping-row' });

        row.createEl('span', { cls: 'mailer-import-mapping-name', text: `📂 ${fileDir.name}` });

        const arrow = row.createEl('span', { cls: 'mailer-import-mapping-arrow', text: '→' });

        const select = row.createEl('select', { cls: 'mailer-import-mapping-select' });

        const createOpt = select.createEl('option', { value: `create:${fileDir.name}` });
        createOpt.textContent = `✨ Создать новое: "${fileDir.name}"`;

        if (dbDirections.length > 0) {
          const separator = select.createEl('option', { value: '', attr: { disabled: 'true' } });
          separator.textContent = '── Существующие ──';
          dbDirections.forEach((dbDir: Direction) => {
            const opt = select.createEl('option', { value: String(dbDir.id) });
            opt.textContent = `📂 ${dbDir.name}`;
          });
        }

        const skipOpt = select.createEl('option', { value: 'skip' });
        skipOpt.textContent = '⏭ Пропустить (без направления)';

        select.value = `create:${fileDir.name}`;

        select.addEventListener('change', () => {
          this.updateMapping();
        });

        this.mapping.set(fileDir.id, -1);
      });

      this.updateMapping();
    } else {
      contentDiv.createEl('p', { text: 'ℹ️ В файле нет направлений — все письма будут импортированы без направления.', cls: 'mailer-modal-desc' });
    }

    const btnGroup = contentDiv.createEl('div', { cls: 'mailer-import-buttons' });

    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn-default' });
    cancelBtn.textContent = '✕ Отмена';
    cancelBtn.addEventListener('click', () => this.close());

    const importBtn = btnGroup.createEl('button', { cls: 'mailer-btn-primary' });
    importBtn.textContent = '📥 Запустить импорт';
    importBtn.addEventListener('click', async () => {
      await this.executeImport();
    });
  }

  private updateMapping() {
    const selects = this.contentEl.querySelectorAll('.import-mapping-select') as NodeListOf<HTMLSelectElement>;
    this.mapping.clear();

    this.fileDirections.forEach((fileDir, idx) => {
      const select = selects[idx];
      if (!select) return;

      const val = select.value;
      if (val.startsWith('create:')) {
        this.mapping.set(fileDir.id, -1);
      } else if (val === 'skip') {
        this.mapping.set(fileDir.id, -2);
      } else {
        this.mapping.set(fileDir.id, parseInt(val));
      }
    });
  }

  private async executeImport() {
    try {
      if (!this.importedData) return;
      let created = 0;
      const dirNameToId: Map<string, number> = new Map();

      // Создаём новые направления
      for (const fileDir of this.fileDirections) {
        const targetId = this.mapping.get(fileDir.id);
        if (targetId === -1) {
          const newId = this.plugin.db.saveDirection(fileDir.name, fileDir.description || '');
          if (newId > 0) {
            dirNameToId.set(fileDir.name, newId);
            created++;
          }
        } else if (targetId && targetId > 0) {
          dirNameToId.set(fileDir.name, targetId);
        }
      }

      // Импортируем письма
      let imported = 0;
      let skipped = 0;

      for (const email of this.importedData.emails) {
        const fileDirId = email.direction_id || 0;
        let targetDirId = 0;

        if (fileDirId > 0) {
          const fileDir = this.fileDirections.find((d: Direction) => d.id === fileDirId);
          if (fileDir && dirNameToId.has(fileDir.name)) {
            targetDirId = dirNameToId.get(fileDir.name) || 0;
          } else {
            const mappedId = this.mapping.get(fileDirId);
            if (mappedId === -2) {
              targetDirId = 0;
            } else if (mappedId && mappedId > 0) {
              targetDirId = mappedId;
            }
          }
        }

        const newEmail = {
          number: email.number || '',
          subject: email.subject || 'Без темы',
          text: email.text || '',
          author: email.author || this.plugin.settings.defaultAuthor,
          date: email.date || new Date().toISOString(),
          direction_id: targetDirId,
        };

        const id = this.plugin.db.saveEmail(newEmail);
        if (id > 0) {
          imported++;
        } else {
          skipped++;
        }
      }

      this.close();
      new Notice(`✅ Импорт завершён!\n📧 Импортировано: ${imported}\n📂 Создано направлений: ${created}${skipped > 0 ? `\n⏭ Пропущено: ${skipped}` : ''}`);
      this.onUpdate();
    } catch (error: unknown) {
      new Notice(`❌ Ошибка импорта: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== МОДАЛЬНОЕ ОКНО ЭКСПОРТА ПИСЕМ ПО НАПРАВЛЕНИЯМ =====
class ExportModal extends Modal {
  plugin: MailerPlugin;
  onUpdate: () => void;

  constructor(plugin: MailerPlugin, onUpdate: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onUpdate = onUpdate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mailer-export-modal');

    contentEl.createEl('h2', { text: '📤 Экспорт писем в JSON' });
    contentEl.createEl('p', { text: 'Выберите одно или несколько направлений для экспорта', cls: 'mailer-modal-desc' });

    const directions = this.plugin.db.getDirections();
    const checkboxes: HTMLInputElement[] = [];
    const selectionInfo = contentEl.createEl('div', { cls: 'mailer-export-info' });

    if (directions.length === 0) {
      contentEl.createEl('p', { text: '📭 Нет созданных направлений. Сначала создайте направления в разделе "Направления".' });
      const closeBtn = contentEl.createEl('button', { cls: 'mailer-btn-danger-sm' });
      closeBtn.textContent = '✕ Закрыть';
      closeBtn.addEventListener('click', () => this.close());
      return;
    }

    const listContainer = contentEl.createDiv({ cls: 'mailer-export-dir-list' });

    // Select all / deselect all
    const selectAllRow = listContainer.createEl('div', { cls: 'mailer-export-dir-row' });
    const selectAllCheckbox = selectAllRow.createEl('input', { type: 'checkbox', cls: 'mailer-export-dir-checkbox', attr: { id: 'export-select-all' } });
    selectAllRow.createEl('label', { text: 'Выбрать все', attr: { for: 'export-select-all' } });

    const updateSelectionInfo = () => {
      const selected = checkboxes.filter(cb => cb.checked).length;
      selectionInfo.textContent = `✅ Выбрано направлений: ${selected} из ${directions.length}`;
    };

    selectAllCheckbox.addEventListener('change', () => {
      const checked = selectAllCheckbox.checked;
      checkboxes.forEach(cb => cb.checked = checked);
      updateSelectionInfo();
    });

    directions.forEach((dir: Direction) => {
      const row = listContainer.createEl('div', { cls: 'mailer-export-dir-row' });

      const cb = row.createEl('input', { type: 'checkbox', cls: 'mailer-export-dir-checkbox', attr: { id: `export-dir-${dir.id}` } });
      checkboxes.push(cb);

      const emailsCount = this.plugin.db.getAllEmails().filter((e: Email) => e.direction_id === dir.id).length;
      row.createEl('label', { text: `📂 ${dir.name} (${emailsCount} писем)`, attr: { for: `export-dir-${dir.id}` } });

      cb.addEventListener('change', () => {
        updateSelectionInfo();
        selectAllCheckbox.checked = checkboxes.every(c => c.checked);
      });

      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
      });
    });

    updateSelectionInfo();

    const btnGroup = contentEl.createEl('div', { cls: 'mailer-export-buttons' });

    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn-default' });
    cancelBtn.textContent = '✕ Отмена';
    cancelBtn.addEventListener('click', () => this.close());

    const exportBtn = btnGroup.createEl('button', { cls: 'mailer-btn-primary' });
    exportBtn.textContent = '📤 Экспортировать';
    exportBtn.addEventListener('click', async () => {
      const selectedIds: number[] = [];
      directions.forEach((dir: Direction, idx: number) => {
        if (checkboxes[idx].checked) {
          selectedIds.push(dir.id);
        }
      });

      if (selectedIds.length === 0) {
        new Notice('⚠️ Выберите хотя бы одно направление');
        return;
      }

      this.close();
      await this.executeExport(selectedIds);
    });
  }

  private async executeExport(directionIds: number[]) {
    try {
      const jsonContent = this.plugin.db.exportEmailsByDirection(directionIds);
      const data = JSON.parse(jsonContent);
      const totalEmails = data.emails.length;
      const totalDirs = data.directions.length;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const dirName = data.directions.length === 1
        ? this.sanitizeFileName(data.directions[0].name)
        : 'экспорт';
      const fileName = `Экспорт_писем_${dirName}_${timestamp}.json`;

      const adapter = this.app.vault.adapter;
      const exportFolder = 'Технические письма/Экспорт';
      if (!await adapter.exists(exportFolder)) {
        await this.app.vault.createFolder(exportFolder);
      }

      const filePath = `${exportFolder}/${fileName}`;
      await adapter.write(filePath, jsonContent);

      new Notice(`✅ Экспорт завершён!\n📧 Экспортировано: ${totalEmails} писем\n📂 Направлений: ${totalDirs}\n💾 Файл: ${fileName}`);
      this.onUpdate();
    } catch (error: unknown) {
      new Notice(`❌ Ошибка экспорта: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|/]/g, '_').replace(/_+/g, '_').trim().substring(0, 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ===== ОСНОВНОЙ ВИД =====
export class EmailsView extends ItemView {
  plugin: MailerPlugin;
  container: HTMLElement | null = null;
  emailList: HTMLElement | null = null;
  selectedEmail: Email | null = null;
  lastLLMAnswer: string = '';
  lastLLMQuestion: string = '';
  searchInput: HTMLInputElement | null = null;
  searchResultsCount: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: MailerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_EMAILS;
  }

  getDisplayText(): string {
    return '📧 Технические письма';
  }

  getIcon(): string {
    return 'mail';
  }

  async onOpen() {
    this.container = this.containerEl;
    this.container.empty();
    this.container.addClass('mailer-view');
    
    this.render();
    this.loadEmailsFromLocal();
  }

  render() {
    if (!this.container) return;
    
    const header = this.container.createEl('div', { cls: 'mailer-view-header' });
    header.createEl('h2', { text: '📧 Технические письма' });
    
    // ===== ПОИСКОВАЯ СТРОКА =====
    const searchContainer = this.container.createEl('div', { cls: 'mailer-search-container' });
    
    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'mailer-search-input',
      placeholder: '🔍 Поиск по письмам (тема, текст, номер, автор)...'
    });
    this.searchInput.addEventListener('input', () => {
      this.loadEmailsFromLocal();
    });
    
    const clearSearchBtn = searchContainer.createEl('button', { cls: 'mailer-btn-xs' });
    clearSearchBtn.textContent = '✕';
    clearSearchBtn.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        this.loadEmailsFromLocal();
        this.searchInput.focus();
      }
    });
    
    const resultCounter = searchContainer.createEl('span', { cls: 'mailer-search-count' });
    resultCounter.textContent = '';
    
    const toolbar = this.container.createEl('div', { cls: 'mailer-view-toolbar' });
    
    const refreshBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    refreshBtn.textContent = '🔄 Обновить';
    refreshBtn.addEventListener('click', () => this.loadEmailsFromLocal());
    
    const newBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm-primary' });
    newBtn.textContent = '➕ Новое письмо';
    newBtn.addEventListener('click', () => this.openCreateModal());
    
    const dirBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    dirBtn.textContent = '📂 Направления';
    dirBtn.addEventListener('click', () => this.openDirectionsManager());
    
    const syncBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    syncBtn.textContent = '🔄 Синхронизировать';
    syncBtn.addEventListener('click', () => this.syncWithCloud());
    
    const exportBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    exportBtn.textContent = '📄 Экспорт в Word';
    exportBtn.addEventListener('click', () => this.exportToWord());
    
    const importBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    importBtn.textContent = '📥 Импорт';
    importBtn.addEventListener('click', () => this.openImportModal());

    const exportJsonBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    exportJsonBtn.textContent = '📤 Экспорт JSON';
    exportJsonBtn.addEventListener('click', () => this.openExportModal());

    const chatBtn = toolbar.createEl('button', { cls: 'mailer-btn-sm' });
    chatBtn.textContent = '💬 Чат с AI';
    chatBtn.addEventListener('click', () => this.openChatModal());
    
    this.emailList = this.container.createEl('div', { cls: 'mailer-email-list' });
  }

  openChatModal() {
    if (!this.plugin.settings.llmApiKeySecret) {
      new Notice('⚠️ Введите API ключ LLM в настройках');
      return;
    }
    const modal = new ChatLLMModal(this.plugin);
    modal.open();
  }

  openCreateModal() {
    const modal = new CreateEmailModal(
      this.plugin,
      async (email) => {
        const id = this.plugin.db.saveEmail(email);
        if (id > 0) {
          new Notice('✅ Письмо сохранено локально!');
          const savedEmail = this.plugin.db.getEmail(id);
          if (savedEmail) {
            await this.syncEmailToMd(savedEmail);
          }
          this.loadEmailsFromLocal();
        } else {
          new Notice('❌ Ошибка сохранения письма');
        }
      },
      () => {
        console.log('📝 Создание письма отменено');
      }
    );
    modal.open();
  }

  openDirectionsManager() {
    const modal = new DirectionsManagerModal(
      this.plugin,
      () => {
        this.loadEmailsFromLocal();
      }
    );
    modal.open();
  }

  openImportModal() {
    const modal = new ImportModal(
      this.plugin,
      () => {
        this.loadEmailsFromLocal();
      }
    );
    modal.open();
  }

  openExportModal() {
    const modal = new ExportModal(
      this.plugin,
      () => {
        this.loadEmailsFromLocal();
      }
    );
    modal.open();
  }

  sanitizeFileName(name: string): string {
    if (!name) return 'без_названия';
    return name.replace(/[\\/:*?"<>|/]/g, '_').replace(/_+/g, '_').trim();
  }

  // ===== СИНХРОНИЗАЦИЯ ПИСЬМА С MD ФАЙЛОМ =====
  async syncEmailToMd(email: Email): Promise<void> {
    try {
      const folderPath = 'Технические письма';
      const adapter = this.app.vault.adapter;
      if (!await adapter.exists(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      
      const safeNumber = this.sanitizeFileName(email.number || 'Без номера');
      const safeSubject = this.sanitizeFileName(email.subject || 'Без темы');
      const fileName = `${safeNumber} - ${safeSubject}.md`;
      const filePath = `${folderPath}/${fileName}`;
      
      // 🔥 ФОРМИРУЕМ MD С СОХРАНЕНИЕМ ПЕРЕНОСОВ
      const content = this.formatEmailAsMd(email);
      
      if (await adapter.exists(filePath)) {
        await adapter.write(filePath, content);
        console.log(`🔄 Обновлен MD файл: ${filePath}`);
      } else {
        await this.app.vault.create(filePath, content);
        console.log(`✅ Создан MD файл: ${filePath}`);
      }
      
      email.mdFilePath = filePath;
      email.mdFileHash = await this.getFileHash(filePath);
      email.lastSyncTime = new Date().toISOString();
      this.plugin.db.saveEmail(email);
      
    } catch (error: unknown) {
      console.error('❌ Ошибка синхронизации с MD:', error);
    }
  }

  async getFileHash(filePath: string): Promise<string> {
    try {
      const adapter = this.app.vault.adapter;
      const content = await adapter.read(filePath);
      const hash = content.length + '_' + content.substring(0, 100);
      return hash;
    } catch {
      return '';
    }
  }

  // 🔥 ФОРМАТИРОВАНИЕ MD С СОХРАНЕНИЕМ ПЕРЕНОСОВ
  formatEmailAsMd(email: Email): string {
    const date = email.date ? new Date(email.date).toLocaleDateString('ru-RU') : 'Дата не указана';
    
    let textContent = email.text || 'Текст отсутствует';
    const images: string[] = email.images || [];
    images.forEach((imgPath: string, idx: number) => {
      const placeholder = `{IMG_${idx + 1}}`;
      const mdImage = `![[${imgPath}]]`;
      textContent = textContent.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), mdImage);
    });
    
    return `---
title: "${email.subject || 'Без темы'}"
number: "${email.number || ''}"
author: "${email.author || 'Неизвестный'}"
date: "${date}"
status: "${email.sync_status || 'local'}"
direction_id: ${email.direction_id || 0}
md_sync_time: "${new Date().toISOString()}"
---

# 📧 ${email.subject || 'Без темы'}

**№:** ${email.number || '-'}  
**Автор:** ${email.author || 'Неизвестный'}  
**Дата:** ${date}  
**Статус:** ${email.sync_status === 'synced' ? '☁️ Синхронизировано' : '📝 Локально'}

---

## 📝 Текст письма

${textContent}

---

*Создано автоматически из локальной базы писем*
`;
  }

  loadEmailsFromLocal() {
    if (!this.emailList) return;
    
    this.emailList.empty();
    
    const scrollContainer = this.emailList.createEl('div', { cls: 'mailer-email-scroll' });
    
    let emails = this.plugin.db.getAllEmails();
    const directions = this.plugin.db.getDirections();
    
    // ПОИСК
    const query = this.searchInput?.value?.toLowerCase() || '';
    let filteredEmails = emails;
    
    if (query) {
      filteredEmails = emails.filter((email: Email) => {
        const searchableText = [
          email.subject || '',
          email.text || '',
          email.number || '',
          email.author || '',
          email.date || ''
        ].join(' ').toLowerCase();
        return searchableText.includes(query);
      });
      
      const counter = this.container?.querySelector('.mailer-search-count');
      if (counter) {
        counter.textContent = `📊 ${filteredEmails.length} из ${emails.length}`;
      }
    } else {
      const counter = this.container?.querySelector('.mailer-search-count');
      if (counter) {
        counter.textContent = `📊 ${emails.length}`;
      }
    }
    
    if (!filteredEmails || filteredEmails.length === 0) {
      const emptyEl = scrollContainer.createEl('p', { cls: 'mailer-empty-text', text: query ? '📭 Ничего не найдено' : '📭 Нет писем в локальном хранилище' });
      return;
    }
    
    const dirMap = new Map<number, string>();
    directions.forEach((d: Direction) => dirMap.set(d.id, d.name));
    
    const grouped: { [key: string]: Email[] } = {
      'Без направления': []
    };
    
    filteredEmails.forEach((email: Email) => {
      const dirId = email.direction_id || 0;
      const dirName = dirMap.get(dirId) || 'Без направления';
      if (!grouped[dirName]) {
        grouped[dirName] = [];
      }
      grouped[dirName].push(email);
    });
    
    const sortedGroupNames = Object.keys(grouped).sort((a, b) => {
      if (a === 'Без направления') return 1;
      if (b === 'Без направления') return -1;
      return a.localeCompare(b);
    });
    
    for (const dirName of sortedGroupNames) {
      const dirEmails = grouped[dirName];
      if (dirEmails.length === 0) continue;
      
      const groupContainer = scrollContainer.createEl('div', { cls: 'mailer-group-container' });
      
      const groupHeader = groupContainer.createEl('div', { cls: 'mailer-group-header' });
      
      const titleSpan = groupHeader.createEl('span');
      titleSpan.textContent = `📂 ${dirName} (${dirEmails.length})`;
      
      const arrowSpan = groupHeader.createEl('span', { cls: 'mailer-group-arrow' });
      arrowSpan.textContent = '▶';
      
      const emailsContainer = groupContainer.createEl('div', { cls: 'mailer-group-emails' });
      
      let isExpanded = false;
      const maxHeight = dirEmails.length * 100 + 20;
      
      (emailsContainer as HTMLElement).style.maxHeight = '0px';
      (emailsContainer as HTMLElement).style.opacity = '0';
      
      dirEmails.forEach((email: Email) => {
        const card = emailsContainer.createEl('div', { cls: 'mailer-email-card', attr: { 'data-id': String(email.id) } });
        
        const statusIcon = email.sync_status === 'synced' ? '☁️' : '📝';
        const subjectEl = card.createEl('div', { cls: 'mailer-email-subject', text: `${statusIcon} ${email.subject || 'Без темы'}` });
        
        card.createEl('div', { cls: 'mailer-email-meta', text: `№ ${email.number || '-'} | ${email.author || 'Неизвестный'} | ${email.date || ''}` });
        card.createEl('div', { cls: 'mailer-email-preview', text: (email.text || '').substring(0, 120) + '...' });
        
        // КНОПКА РЕДАКТИРОВАНИЯ
        const actionsRow = card.createEl('div', { cls: 'mailer-email-actions' });
        
        const editBtn = actionsRow.createEl('button', { cls: 'mailer-btn-edit' });
        editBtn.textContent = '✏️ Редактировать';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditModal(email);
        });
        
        card.addEventListener('click', () => {
          this.selectEmail(email);
          this.openEmailAsMd(email);
        });
      });
      
      const toggleGroup = () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
          (emailsContainer as HTMLElement).style.maxHeight = maxHeight + 'px';
          (emailsContainer as HTMLElement).style.opacity = '1';
          arrowSpan.textContent = '▼';
        } else {
          (emailsContainer as HTMLElement).style.maxHeight = '0px';
          (emailsContainer as HTMLElement).style.opacity = '0';
          arrowSpan.textContent = '▶';
        }
      };
      
      groupHeader.addEventListener('click', toggleGroup);
    }
  }

  openEditModal(email: Email) {
    const modal = new EditEmailModal(
      this.plugin,
      email,
      async (updatedEmail) => {
        const success = this.plugin.db.saveEmail(updatedEmail);
        if (success > 0) {
          new Notice('✅ Письмо обновлено!');
          const savedEmail = this.plugin.db.getEmail(success);
          if (savedEmail) {
            await this.syncEmailToMd(savedEmail);
          }
          this.loadEmailsFromLocal();
        } else {
          new Notice('❌ Ошибка сохранения изменений');
        }
      },
      () => {
        console.log('✏️ Редактирование отменено');
      }
    );
    modal.open();
  }

  async openEmailAsMd(email: Email) {
    try {
      const folderPath = 'Технические письма';
      const adapter = this.app.vault.adapter;
      if (!await adapter.exists(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      
      const safeNumber = this.sanitizeFileName(email.number || 'Без номера');
      const safeSubject = this.sanitizeFileName(email.subject || 'Без темы');
      const fileName = `${safeNumber} - ${safeSubject}.md`;
      const filePath = `${folderPath}/${fileName}`;
      
      if (await adapter.exists(filePath)) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf().openFile(file);
          return;
        }
      }
      
      const content = this.formatEmailAsMd(email);
      const file = await this.app.vault.create(filePath, content);
      await this.app.workspace.getLeaf().openFile(file);
      
      email.mdFilePath = filePath;
      email.mdFileHash = await this.getFileHash(filePath);
      email.lastSyncTime = new Date().toISOString();
      this.plugin.db.saveEmail(email);
      
      new Notice(`📄 Открыто: ${fileName}`);
      
    } catch (error: unknown) {
      console.error('Ошибка открытия письма:', error);
      new Notice(`❌ Ошибка открытия: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  selectEmail(email: Email) {
    this.selectedEmail = email;
    new Notice(`📧 Выбрано: ${email.subject}`);
    console.log('📧 Выбрано письмо:', email);
  }

  async syncWithCloud() {
    await this.plugin.syncService.syncWithCloud();
    this.loadEmailsFromLocal();
  }

  async exportToWord() {
    if (!this.selectedEmail) {
      new Notice('⚠️ Сначала выберите письмо из списка');
      return;
    }
    
    try {
      const freshEmail = this.plugin.db.getEmail(this.selectedEmail.id) || this.selectedEmail;
      await this.plugin.documentService.exportToWord(
        freshEmail,
        this.plugin.settings
      );
    } catch (error: unknown) {
      new Notice(`❌ Ошибка экспорта: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onClose() {
    // Очистка при закрытии
  }
}