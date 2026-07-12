// src/views/emails.view.ts
import { ItemView, WorkspaceLeaf, Notice, TFile, Modal } from 'obsidian';
import MailerPlugin from '../main';

export const VIEW_TYPE_EMAILS = 'mailer-emails-view';

// ===== БАЗОВЫЙ КЛАСС ДЛЯ МОДАЛЬНЫХ ОКОН С ИЗМЕНЯЕМЫМ РАЗМЕРОМ =====
class ResizableModal extends Modal {
  protected isFullscreen: boolean = false;
  protected modalContent: HTMLElement | null = null;
  protected previousWidth: string = '';
  protected previousHeight: string = '';

  constructor(app: any) {
    super(app);
  }

  protected makeResizable(contentEl: HTMLElement): void {
    this.modalContent = contentEl;
    
    const modalEl = contentEl.parentElement;
    if (modalEl) {
      (modalEl as HTMLElement).style.resize = 'both';
      (modalEl as HTMLElement).style.overflow = 'auto';
      (modalEl as HTMLElement).style.minWidth = '500px';
      (modalEl as HTMLElement).style.minHeight = '300px';
      (modalEl as HTMLElement).style.maxWidth = '95vw';
      (modalEl as HTMLElement).style.maxHeight = '95vh';
    }
  }

  protected addFullscreenButton(headerEl: HTMLElement): void {
    const fullscreenBtn = headerEl.createEl('button', { cls: 'mailer-fullscreen-btn' });
    fullscreenBtn.textContent = '⛶';
    (fullscreenBtn as HTMLElement).style.cssText = `
      padding: 2px 8px;
      border: none;
      border-radius: 4px;
      background: var(--background-secondary);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      margin-left: 8px;
    `;
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
      
      modalElStyle.style.width = '95vw';
      modalElStyle.style.height = '95vh';
      modalElStyle.style.maxWidth = '95vw';
      modalElStyle.style.maxHeight = '95vh';
      modalElStyle.style.resize = 'none';
      
      this.isFullscreen = true;
      
      const btn = modalEl.querySelector('.mailer-fullscreen-btn');
      if (btn) {
        btn.textContent = '⛶';
        btn.setAttribute('title', 'Вернуть обычный размер');
      }
    } else {
      modalElStyle.style.width = this.previousWidth || '';
      modalElStyle.style.height = this.previousHeight || '';
      modalElStyle.style.maxWidth = '95vw';
      modalElStyle.style.maxHeight = '95vh';
      modalElStyle.style.resize = 'both';
      
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
    (resizeHint as HTMLElement).style.cssText = `
      position: absolute;
      bottom: 4px;
      right: 8px;
      font-size: 10px;
      color: var(--text-muted);
      opacity: 0.5;
      pointer-events: none;
      user-select: none;
    `;
    resizeHint.textContent = '↘︎ тяните для изменения размера';
  }
}

// ===== МОДАЛЬНОЕ ОКНО ДЛЯ СОЗДАНИЯ ПИСЬМА =====
class CreateEmailModal extends ResizableModal {
  plugin: MailerPlugin;
  onSubmit: (email: any) => void;
  onCancel: () => void;
  images: { path: string; fileName: string }[] = [];

  constructor(plugin: MailerPlugin, onSubmit: (email: any) => void, onCancel: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    (contentEl as HTMLElement).style.cssText = 'max-width: 100%; padding: 20px; display: flex; flex-direction: column; height: 100%;';
    
    this.makeResizable(contentEl);

    const headerContainer = contentEl.createDiv({ cls: 'mailer-modal-header' });
    (headerContainer as HTMLElement).style.cssText = 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;';
    
    const titleEl = headerContainer.createEl('h2', { text: '📝 Новое письмо' });
    (titleEl as HTMLElement).style.cssText = 'margin: 0;';
    
    this.addFullscreenButton(headerContainer);
    
    contentEl.createEl('p', { text: 'Заполните поля и сохраните письмо в локальную базу', cls: 'mailer-modal-desc' });

    const formContainer = contentEl.createDiv({ cls: 'mailer-modal-form' });
    (formContainer as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 14px; margin-top: 16px; flex: 1; overflow-y: auto;';

    // Поле: Номер
    const numberGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (numberGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    numberGroup.createEl('label', { text: '№ исходящего:', cls: 'mailer-form-label' });
    const numberInput = numberGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: 'Например: 00268' });
    (numberInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';

    // Поле: Тема
    const subjectGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (subjectGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    subjectGroup.createEl('label', { text: 'Тема:', cls: 'mailer-form-label' });
    const subjectInput = subjectGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: 'Краткое описание письма' });
    (subjectInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';

    // Поле: Автор
    const authorGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (authorGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    authorGroup.createEl('label', { text: 'Автор:', cls: 'mailer-form-label' });
    const authorInput = authorGroup.createEl('input', { type: 'text', cls: 'mailer-form-input', placeholder: this.plugin.settings.defaultAuthor });
    (authorInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    authorInput.value = this.plugin.settings.defaultAuthor;

    // Поле: Направление
    const dirGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (dirGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    dirGroup.createEl('label', { text: 'Направление:', cls: 'mailer-form-label', attr: { for: 'email-direction-select' } });
    
    const dirSelect = dirGroup.createEl('select', { 
      cls: 'mailer-form-input',
      attr: { id: 'email-direction-select' }
    });
    (dirSelect as HTMLSelectElement).style.cssText = 'width: 100%; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px; cursor: pointer;';
    
    this.updateDirectionSelect(dirSelect);

    // Поле: Изображения
    const imagesGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (imagesGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;';
    imagesGroup.createEl('label', { text: '🖼️ Изображения:', cls: 'mailer-form-label' });

    const imagesToolbar = imagesGroup.createDiv({ cls: 'mailer-images-toolbar' });
    (imagesToolbar as HTMLElement).style.cssText = 'display: flex; gap: 6px; align-items: center; flex-wrap: wrap;';

    const addImageBtn = imagesToolbar.createEl('button', { cls: 'mailer-btn' });
    addImageBtn.textContent = '📎 Добавить изображение';
    (addImageBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 12px;';

    const imageFileInput = imagesToolbar.createEl('input', { type: 'file', attr: { accept: 'image/*' } });
    (imageFileInput as HTMLInputElement).style.cssText = 'display: none;';

    const imagesList = imagesGroup.createDiv({ cls: 'mailer-images-list' });
    (imagesList as HTMLElement).style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;';

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
    const textGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (textGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
    textGroup.createEl('label', { text: 'Текст письма:', cls: 'mailer-form-label' });
    const textArea = textGroup.createEl('textarea', { cls: 'mailer-form-textarea', placeholder: 'Введите текст письма...' });
    (textArea as HTMLTextAreaElement).style.cssText = 'width: 100%; min-height: 200px; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: inherit; font-size: 14px; resize: vertical; flex: 1;';

    // Кнопки
    const btnGroup = formContainer.createDiv({ cls: 'mailer-form-buttons' });
    (btnGroup as HTMLElement).style.cssText = 'display: flex; gap: 10px; margin-top: 8px; justify-content: flex-end; flex-shrink: 0;';
    
    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn' });
    cancelBtn.textContent = 'Отмена';
    (cancelBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 14px;';
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    
    const saveBtn = btnGroup.createEl('button', { cls: 'mailer-btn mailer-btn-success' });
    saveBtn.textContent = '💾 Сохранить письмо';
    (saveBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-size: 14px; font-weight: bold;';
    saveBtn.addEventListener('click', async () => {
      const email = {
        number: numberInput.value.trim(),
        subject: subjectInput.value.trim(),
        author: authorInput.value.trim() || this.plugin.settings.defaultAuthor,
        text: textArea.value,
        direction_id: parseInt(dirSelect.value) || 0,
        images: this.images.map(img => img.path)
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
    (tag as HTMLElement).style.cssText = 'padding: 2px 10px; background: var(--background-secondary); border-radius: 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--background-modifier-border);';
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;

    const removeBtn = tag.createEl('span', { text: '✕' });
    (removeBtn as HTMLElement).style.cssText = 'cursor: pointer; font-size: 10px; opacity: 0.6; margin-left: 2px;';
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
    directions.forEach((d: any) => {
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
  email: any;
  onSubmit: (updatedEmail: any) => void;
  onCancel: () => void;
  images: { path: string; fileName: string }[] = [];

  constructor(plugin: MailerPlugin, email: any, onSubmit: (updatedEmail: any) => void, onCancel: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.email = email;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    (contentEl as HTMLElement).style.cssText = 'max-width: 100%; padding: 20px; display: flex; flex-direction: column; height: 100%;';
    
    this.makeResizable(contentEl);

    const headerContainer = contentEl.createDiv({ cls: 'mailer-modal-header' });
    (headerContainer as HTMLElement).style.cssText = 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;';
    
    const titleEl = headerContainer.createEl('h2', { text: '✏️ Редактирование письма' });
    (titleEl as HTMLElement).style.cssText = 'margin: 0;';
    
    this.addFullscreenButton(headerContainer);
    
    contentEl.createEl('p', { text: 'Измените поля и сохраните изменения', cls: 'mailer-modal-desc' });

    const formContainer = contentEl.createDiv({ cls: 'mailer-modal-form' });
    (formContainer as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 14px; margin-top: 16px; flex: 1; overflow-y: auto;';

    // Поле: Номер
    const numberGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (numberGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    numberGroup.createEl('label', { text: '№ исходящего:', cls: 'mailer-form-label' });
    const numberInput = numberGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    (numberInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    numberInput.value = this.email.number || '';

    // Поле: Тема
    const subjectGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (subjectGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    subjectGroup.createEl('label', { text: 'Тема:', cls: 'mailer-form-label' });
    const subjectInput = subjectGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    (subjectInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    subjectInput.value = this.email.subject || '';

    // Поле: Автор
    const authorGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (authorGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    authorGroup.createEl('label', { text: 'Автор:', cls: 'mailer-form-label' });
    const authorInput = authorGroup.createEl('input', { type: 'text', cls: 'mailer-form-input' });
    (authorInput as HTMLInputElement).style.cssText = 'padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    authorInput.value = this.email.author || this.plugin.settings.defaultAuthor;

    // Поле: Направление
    const dirGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (dirGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    dirGroup.createEl('label', { text: 'Направление:', cls: 'mailer-form-label', attr: { for: 'email-direction-select-edit' } });
    
    const dirSelect = dirGroup.createEl('select', { 
      cls: 'mailer-form-input',
      attr: { id: 'email-direction-select-edit' }
    });
    (dirSelect as HTMLSelectElement).style.cssText = 'width: 100%; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px; cursor: pointer;';
    
    const directions = this.plugin.db.getDirections();
    const defaultOption = dirSelect.createEl('option', { value: '0' });
    defaultOption.textContent = 'Без направления';
    directions.forEach((d: any) => {
      const option = dirSelect.createEl('option', { value: String(d.id) });
      option.textContent = d.name;
    });
    dirSelect.value = String(this.email.direction_id || 0);

    // Поле: Изображения
    const imagesGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (imagesGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;';
    imagesGroup.createEl('label', { text: '🖼️ Изображения:', cls: 'mailer-form-label' });

    const imagesToolbar = imagesGroup.createDiv({ cls: 'mailer-images-toolbar' });
    (imagesToolbar as HTMLElement).style.cssText = 'display: flex; gap: 6px; align-items: center; flex-wrap: wrap;';

    const addImageBtn = imagesToolbar.createEl('button', { cls: 'mailer-btn' });
    addImageBtn.textContent = '📎 Добавить изображение';
    (addImageBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 12px;';

    const imageFileInput = imagesToolbar.createEl('input', { type: 'file', attr: { accept: 'image/*' } });
    (imageFileInput as HTMLInputElement).style.cssText = 'display: none;';

    const imagesList = imagesGroup.createDiv({ cls: 'mailer-images-list' });
    (imagesList as HTMLElement).style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;';

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
    const textGroup = formContainer.createDiv({ cls: 'mailer-form-group' });
    (textGroup as HTMLElement).style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
    textGroup.createEl('label', { text: 'Текст письма:', cls: 'mailer-form-label' });
    const textArea = textGroup.createEl('textarea', { cls: 'mailer-form-textarea' });
    (textArea as HTMLTextAreaElement).style.cssText = 'width: 100%; min-height: 250px; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: inherit; font-size: 14px; resize: vertical; flex: 1;';
    textArea.value = this.email.text || '';

    // Кнопки
    const btnGroup = formContainer.createDiv({ cls: 'mailer-form-buttons' });
    (btnGroup as HTMLElement).style.cssText = 'display: flex; gap: 10px; margin-top: 8px; justify-content: flex-end; flex-shrink: 0;';
    
    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn' });
    cancelBtn.textContent = 'Отмена';
    (cancelBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 14px;';
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    
    const saveBtn = btnGroup.createEl('button', { cls: 'mailer-btn mailer-btn-success' });
    saveBtn.textContent = '💾 Сохранить изменения';
    (saveBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-size: 14px; font-weight: bold;';
    saveBtn.addEventListener('click', async () => {
      const updatedEmail = {
        ...this.email,
        number: numberInput.value.trim(),
        subject: subjectInput.value.trim(),
        author: authorInput.value.trim() || this.plugin.settings.defaultAuthor,
        text: textArea.value,
        direction_id: parseInt(dirSelect.value) || 0,
        images: this.images.filter(img => img !== null).map(img => (img as any).path)
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
    (tag as HTMLElement).style.cssText = 'padding: 2px 10px; background: var(--background-secondary); border-radius: 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--background-modifier-border);';
    const fileName = imgPath.split('/').pop() || imgPath;
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;
    return tag;
  }

  renderImageTag(container: HTMLElement, fileName: string, index: number) {
    const tag = container.createEl('span', { cls: 'mailer-image-tag' });
    (tag as HTMLElement).style.cssText = 'padding: 2px 10px; background: var(--background-secondary); border-radius: 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--background-modifier-border);';
    tag.textContent = `🖼️ {IMG_${index}} ${fileName.substring(0, 20)}`;

    const removeBtn = tag.createEl('span', { text: '✕' });
    (removeBtn as HTMLElement).style.cssText = 'cursor: pointer; font-size: 10px; opacity: 0.6; margin-left: 2px;';
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
    (contentEl as HTMLElement).style.cssText = 'max-width: 500px; margin: 0 auto; padding: 20px;';

    contentEl.createEl('h2', { text: '📂 Управление направлениями' });
    contentEl.createEl('p', { text: 'Создавайте и удаляйте направления', cls: 'mailer-modal-desc' });

    const createContainer = contentEl.createDiv({ cls: 'dir-create-container' });
    (createContainer as HTMLElement).style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px;';
    
    const newDirInput = createContainer.createEl('input', {
      type: 'text',
      placeholder: 'Название нового направления...',
      cls: 'dir-input'
    });
    (newDirInput as HTMLInputElement).style.cssText = 'flex: 1; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    
    const addBtn = createContainer.createEl('button', { cls: 'dir-btn-primary' });
    addBtn.textContent = '➕ Создать';
    (addBtn as HTMLButtonElement).style.cssText = 'padding: 8px 16px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-weight: bold;';
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
    let listContainer = contentEl.querySelector('.dir-list-container');
    if (!listContainer) {
      listContainer = contentEl.createDiv({ cls: 'dir-list-container' });
      (listContainer as HTMLElement).style.cssText = 'margin-top: 8px;';
    } else {
      listContainer.empty();
    }

    const directions = this.plugin.db.getDirections();
    
    if (directions.length === 0) {
      const emptyEl = listContainer.createEl('p', { text: '📭 Нет созданных направлений', cls: 'dir-empty' });
      (emptyEl as HTMLElement).style.cssText = 'color: var(--text-muted); font-style: italic; text-align: center; padding: 20px;';
      return;
    }

    directions.forEach((dir: any) => {
      const item = listContainer.createEl('div', { cls: 'dir-item' });
      (item as HTMLElement).style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--background-modifier-border);';
      
      const nameSpan = item.createEl('span', { text: `📂 ${dir.name}` });
      (nameSpan as HTMLElement).style.cssText = 'font-size: 14px;';
      
      const actions = item.createEl('div', { cls: 'dir-actions' });
      (actions as HTMLElement).style.cssText = 'display: flex; gap: 6px;';
      
      const deleteBtn = actions.createEl('button', { cls: 'dir-btn-danger' });
      deleteBtn.textContent = '🗑️';
      (deleteBtn as HTMLButtonElement).style.cssText = 'padding: 2px 8px; border: none; border-radius: 4px; background: var(--background-modifier-error); color: white; cursor: pointer; font-size: 12px;';
      deleteBtn.addEventListener('click', async () => {
        const emails = this.plugin.db.getAllEmails();
        const hasEmails = emails.some((e: any) => e.direction_id === dir.id);
        if (hasEmails) {
          new Notice(`⚠️ Нельзя удалить "${dir.name}" - есть письма с этим направлением`);
          return;
        }
        
        try {
          const allData = JSON.parse(this.plugin.db.exportData());
          allData.directions = allData.directions.filter((d: any) => d.id !== dir.id);
          const success = this.plugin.db.importData(JSON.stringify(allData));
          
          if (success) {
            new Notice(`🗑️ Направление "${dir.name}" удалено`);
            this.renderDirectionsList(contentEl);
            this.onUpdate();
          } else {
            new Notice('❌ Ошибка удаления направления');
          }
        } catch (error) {
          console.error('Ошибка удаления направления:', error);
          new Notice(`❌ Ошибка: ${(error as Error).message}`);
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
    (contentEl as HTMLElement).style.cssText = 'max-width: 900px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; height: 90vh;';

    const header = contentEl.createDiv({ cls: 'chat-header' });
    (header as HTMLElement).style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-shrink: 0; flex-wrap: wrap; gap: 8px;';
    header.createEl('h2', { text: '🤖 Чат с AI помощником' });
    
    const headerActions = header.createDiv({ cls: 'chat-header-actions' });
    (headerActions as HTMLElement).style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    
    const clearBtn = headerActions.createEl('button', { cls: 'chat-btn' });
    clearBtn.textContent = '🗑️ Очистить';
    (clearBtn as HTMLButtonElement).style.cssText = 'padding: 4px 12px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 12px;';
    clearBtn.addEventListener('click', () => {
      this.messages = [];
      this.uploadedFiles = [];
      this.lastAnswer = '';
      this.lastQuestion = '';
      if (this.chatContainer) {
        this.chatContainer.empty();
        const welcomeMsg = this.chatContainer.createDiv({ cls: 'chat-message chat-message-assistant' });
        (welcomeMsg as HTMLElement).style.cssText = 'padding: 12px 16px; margin-bottom: 8px; background: var(--background-secondary); border-radius: 8px; border-left: 3px solid var(--interactive-accent);';
        welcomeMsg.textContent = '👋 Здравствуйте! Я AI-помощник по пожарной безопасности TECHNONICOL. Задайте мне вопрос по базе писем или загрузите документ для анализа.';
      }
      this.updateInfoBar();
      new Notice('🗑️ История чата очищена');
    });
    
    const createEmailBtn = headerActions.createEl('button', { cls: 'chat-btn chat-btn-primary' });
    createEmailBtn.textContent = '📝 Создать письмо';
    (createEmailBtn as HTMLButtonElement).style.cssText = 'padding: 4px 12px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-size: 12px; font-weight: bold;';
    createEmailBtn.addEventListener('click', () => {
      if (!this.lastAnswer) {
        new Notice('⚠️ Сначала получите ответ от AI');
        return;
      }
      this.close();
      this.openCreateEmailFromLLM(this.lastAnswer, this.lastQuestion);
    });
    
    const closeBtn = headerActions.createEl('button', { cls: 'chat-btn' });
    closeBtn.textContent = '✕ Закрыть';
    (closeBtn as HTMLButtonElement).style.cssText = 'padding: 4px 12px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 12px;';
    closeBtn.addEventListener('click', () => this.close());

    const infoBar = contentEl.createDiv({ cls: 'chat-info' });
    (infoBar as HTMLElement).style.cssText = 'padding: 8px 12px; background: var(--background-secondary); border-radius: 4px; margin-bottom: 12px; font-size: 12px; color: var(--text-muted); flex-shrink: 0;';
    this.updateInfoBar(infoBar);

    this.chatContainer = contentEl.createDiv({ cls: 'chat-messages' });
    (this.chatContainer as HTMLElement).style.cssText = 'flex: 1; overflow-y: auto; padding: 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); min-height: 200px; margin-bottom: 12px;';

    const welcomeMsg = this.chatContainer.createDiv({ cls: 'chat-message chat-message-assistant' });
    (welcomeMsg as HTMLElement).style.cssText = 'padding: 12px 16px; margin-bottom: 8px; background: var(--background-secondary); border-radius: 8px; border-left: 3px solid var(--interactive-accent);';
    welcomeMsg.textContent = '👋 Здравствуйте! Я AI-помощник по пожарной безопасности TECHNONICOL. Задайте мне вопрос по базе писем или загрузите документ для анализа.';

    const fileArea = contentEl.createDiv({ cls: 'chat-file-area' });
    (fileArea as HTMLElement).style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center;';
    
    const fileInput = fileArea.createEl('input', { type: 'file', attr: { multiple: 'true' } });
    (fileInput as HTMLInputElement).style.cssText = 'display: none;';
    fileInput.accept = '.pdf,.docx,.doc,.txt,.json,.md,.csv,.xlsx,.xls';
    
    const uploadBtn = fileArea.createEl('button', { cls: 'chat-btn' });
    uploadBtn.textContent = '📎 Загрузить документ';
    (uploadBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 13px;';
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    const fileList = fileArea.createDiv({ cls: 'chat-file-list' });
    (fileList as HTMLElement).style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; flex: 1;';
    
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
          
          const tag = fileList.createEl('span', { cls: 'chat-file-tag' });
          (tag as HTMLElement).style.cssText = 'padding: 2px 10px; background: var(--background-secondary); border-radius: 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;';
          tag.textContent = `📄 ${file.name}`;
          
          const removeBtn = tag.createEl('span', { text: '✕' });
          (removeBtn as HTMLElement).style.cssText = 'cursor: pointer; font-size: 10px; opacity: 0.6;';
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
        } catch (error) {
          new Notice(`❌ Ошибка загрузки ${file.name}: ${(error as Error).message}`);
        }
      }
      fileInput.value = '';
    });

    const inputContainer = contentEl.createDiv({ cls: 'chat-input-container' });
    (inputContainer as HTMLElement).style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';
    
    this.inputArea = inputContainer.createEl('textarea', { cls: 'chat-input' });
    (this.inputArea as HTMLTextAreaElement).style.cssText = 'flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: inherit; font-size: 14px; resize: none; min-height: 50px; max-height: 100px;';
    this.inputArea.placeholder = 'Введите вопрос... (Shift+Enter для переноса, Enter для отправки)';
    this.inputArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    const sendBtn = inputContainer.createEl('button', { cls: 'chat-btn chat-btn-send' });
    sendBtn.textContent = '✉️ Отправить';
    (sendBtn as HTMLButtonElement).style.cssText = 'padding: 10px 20px; border: none; border-radius: 8px; background: var(--interactive-accent); color: white; cursor: pointer; font-weight: bold; font-size: 14px;';
    sendBtn.addEventListener('click', () => this.sendMessage());
  }

  updateInfoBar(infoBar?: HTMLElement) {
    const stats = this.plugin.db.getStats();
    const bar = infoBar || this.contentEl.querySelector('.chat-info');
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
      
    } catch (error) {
      new Notice(`❌ Ошибка: ${(error as Error).message}`);
      this.addMessage('assistant', `❌ Извините, произошла ошибка: ${(error as Error).message}`);
    }
    
    this.isProcessing = false;
  }

  addMessage(role: 'user' | 'assistant', content: string) {
    this.messages.push({ role, content });
    if (!this.chatContainer) return;
    
    const msgEl = this.chatContainer.createDiv({ cls: `chat-message chat-message-${role}` });
    (msgEl as HTMLElement).style.cssText = `
      padding: 12px 16px;
      margin-bottom: 8px;
      background: ${role === 'user' ? 'var(--background-primary)' : 'var(--background-secondary)'};
      border-radius: 8px;
      border-left: 3px solid ${role === 'user' ? 'var(--text-accent)' : 'var(--interactive-accent)'};
      white-space: pre-wrap;
      word-wrap: break-word;
      max-width: 90%;
      ${role === 'user' ? 'margin-left: auto;' : ''}
      font-size: 14px;
      line-height: 1.6;
    `;
    
    const label = msgEl.createEl('div', { cls: 'chat-message-label' });
    (label as HTMLElement).style.cssText = 'font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;';
    label.textContent = role === 'user' ? '👤 Вы' : '🤖 AI помощник';
    
    const textEl = msgEl.createEl('div', { cls: 'chat-message-text' });
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

  private importedData: any = null;
  private fileDirections: any[] = [];
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
    (contentEl as HTMLElement).style.cssText = 'max-width: 700px; margin: 0 auto; padding: 20px;';

    contentEl.createEl('h2', { text: '📥 Импорт писем из JSON' });
    contentEl.createEl('p', { text: 'Выберите JSON-файл с письмами для импорта в локальную базу', cls: 'mailer-modal-desc' });

    const fileGroup = contentEl.createDiv({ cls: 'import-file-group' });
    (fileGroup as HTMLElement).style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 16px;';

    const fileBtn = fileGroup.createEl('button', { cls: 'mailer-btn' });
    fileBtn.textContent = '📂 Выбрать файл';
    (fileBtn as HTMLButtonElement).style.cssText = 'padding: 8px 16px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-weight: bold;';

    const fileLabel = fileGroup.createEl('span', { cls: 'import-file-label' });
    (fileLabel as HTMLElement).style.cssText = 'font-size: 13px; color: var(--text-muted);';

    const fileInput = fileGroup.createEl('input', { type: 'file', attr: { accept: '.json' } });
    (fileInput as HTMLInputElement).style.cssText = 'display: none;';

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
      } catch (err) {
        new Notice(`❌ Ошибка парсинга JSON: ${(err as Error).message}`);
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

    const contentDiv = contentEl.createDiv({ cls: 'import-content' });
    (contentDiv as HTMLElement).style.cssText = 'margin-top: 8px;';

    const totalEmails = this.importedData.emails.length;
    const totalDirs = this.fileDirections.length;

    const summary = contentDiv.createEl('div', { cls: 'import-summary' });
    (summary as HTMLElement).style.cssText = 'padding: 10px; background: var(--background-secondary); border-radius: 4px; margin-bottom: 14px;';
    summary.createEl('p', { text: `📊 Найдено в файле: ${totalEmails} писем, ${totalDirs} направлений` });

    if (totalDirs > 0) {
      contentDiv.createEl('h3', { text: '🔄 Настройка соответствия направлений' });
      contentDiv.createEl('p', { text: 'Для каждого направления из файла укажите, куда его отобразить:', cls: 'mailer-modal-desc' });
      (contentDiv.querySelector('.mailer-modal-desc') as HTMLElement).style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 10px;';

      const dbDirections = this.plugin.db.getDirections();

      this.fileDirections.forEach((fileDir: any) => {
        const row = contentDiv.createEl('div', { cls: 'import-mapping-row' });
        (row as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 6px 8px; margin-bottom: 4px; background: var(--background-primary); border-radius: 4px; border: 1px solid var(--background-modifier-border);';

        row.createEl('span', { text: `📂 ${fileDir.name}` });
        (row.lastChild as HTMLElement).style.cssText = 'min-width: 140px; font-weight: bold; font-size: 13px;';

        const arrow = row.createEl('span', { text: '→' });
        (arrow as HTMLElement).style.cssText = 'color: var(--text-muted); font-size: 14px;';

        const select = row.createEl('select', { cls: 'import-mapping-select' });
        (select as HTMLSelectElement).style.cssText = 'flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); font-size: 13px; cursor: pointer;';

        const createOpt = select.createEl('option', { value: `create:${fileDir.name}` });
        createOpt.textContent = `✨ Создать новое: "${fileDir.name}"`;

        if (dbDirections.length > 0) {
          const separator = select.createEl('option', { value: '', attr: { disabled: 'true' } });
          separator.textContent = '── Существующие ──';
          dbDirections.forEach((dbDir: any) => {
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

    const btnGroup = contentDiv.createEl('div', { cls: 'import-buttons' });
    (btnGroup as HTMLElement).style.cssText = 'display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end;';

    const cancelBtn = btnGroup.createEl('button', { cls: 'mailer-btn' });
    cancelBtn.textContent = '✕ Отмена';
    (cancelBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 14px;';
    cancelBtn.addEventListener('click', () => this.close());

    const importBtn = btnGroup.createEl('button', { cls: 'mailer-btn mailer-btn-success' });
    importBtn.textContent = '📥 Запустить импорт';
    (importBtn as HTMLButtonElement).style.cssText = 'padding: 10px 24px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-size: 14px; font-weight: bold;';
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
          const fileDir = this.fileDirections.find((d: any) => d.id === fileDirId);
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
    } catch (error) {
      new Notice(`❌ Ошибка импорта: ${(error as Error).message}`);
    }
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
  selectedEmail: any = null;
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
    (this.container as HTMLElement).style.cssText = 'padding: 12px; height: 100%; overflow: hidden; display: flex; flex-direction: column;';
    
    this.render();
    this.loadEmailsFromLocal();
  }

  render() {
    if (!this.container) return;
    
    const header = this.container.createEl('div', { cls: 'mailer-header' });
    (header as HTMLElement).style.cssText = 'flex-shrink: 0;';
    header.createEl('h2', { text: '📧 Технические письма' });
    
    // ===== ПОИСКОВАЯ СТРОКА =====
    const searchContainer = this.container.createEl('div', { cls: 'mailer-search-container' });
    (searchContainer as HTMLElement).style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; flex-shrink: 0; align-items: center;';
    
    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: '🔍 Поиск по письмам (тема, текст, номер, автор)...'
    });
    (this.searchInput as HTMLInputElement).style.cssText = 'flex: 1; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 14px;';
    this.searchInput.addEventListener('input', () => {
      this.loadEmailsFromLocal();
    });
    
    const clearSearchBtn = searchContainer.createEl('button', { cls: 'mailer-btn' });
    clearSearchBtn.textContent = '✕';
    (clearSearchBtn as HTMLButtonElement).style.cssText = 'padding: 4px 12px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 16px; line-height: 1;';
    clearSearchBtn.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        this.loadEmailsFromLocal();
        this.searchInput.focus();
      }
    });
    
    const resultCounter = searchContainer.createEl('span', { cls: 'mailer-search-count' });
    (resultCounter as HTMLElement).style.cssText = 'font-size: 12px; color: var(--text-muted); white-space: nowrap; min-width: 60px; text-align: right;';
    resultCounter.textContent = '';
    
    const toolbar = this.container.createEl('div', { cls: 'mailer-toolbar' });
    (toolbar as HTMLElement).style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; flex-shrink: 0;';
    
    const refreshBtn = toolbar.createEl('button', { cls: 'mailer-btn' });
    refreshBtn.textContent = '🔄 Обновить';
    (refreshBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer;';
    refreshBtn.addEventListener('click', () => this.loadEmailsFromLocal());
    
    const newBtn = toolbar.createEl('button', { cls: 'mailer-btn mailer-btn-primary' });
    newBtn.textContent = '➕ Новое письмо';
    (newBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer; font-weight: bold;';
    newBtn.addEventListener('click', () => this.openCreateModal());
    
    const dirBtn = toolbar.createEl('button', { cls: 'mailer-btn' });
    dirBtn.textContent = '📂 Направления';
    (dirBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer;';
    dirBtn.addEventListener('click', () => this.openDirectionsManager());
    
    const syncBtn = toolbar.createEl('button', { cls: 'mailer-btn mailer-btn-success' });
    syncBtn.textContent = '🔄 Синхронизировать';
    (syncBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--interactive-accent); color: white; cursor: pointer;';
    syncBtn.addEventListener('click', () => this.syncWithCloud());
    
    const exportBtn = toolbar.createEl('button', { cls: 'mailer-btn' });
    exportBtn.textContent = '📄 Экспорт в Word';
    (exportBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer;';
    exportBtn.addEventListener('click', () => this.exportToWord());
    
    const importBtn = toolbar.createEl('button', { cls: 'mailer-btn' });
    importBtn.textContent = '📥 Импорт';
    (importBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer;';
    importBtn.addEventListener('click', () => this.openImportModal());

    const chatBtn = toolbar.createEl('button', { cls: 'mailer-btn mailer-btn-llm' });
    chatBtn.textContent = '💬 Чат с AI';
    (chatBtn as HTMLButtonElement).style.cssText = 'padding: 6px 14px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer;';
    chatBtn.addEventListener('click', () => this.openChatModal());
    
    this.emailList = this.container.createEl('div', { cls: 'mailer-email-list' });
    (this.emailList as HTMLElement).style.cssText = 'flex: 1; overflow: hidden; min-height: 0;';
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

  sanitizeFileName(name: string): string {
    if (!name) return 'без_названия';
    return name.replace(/[\\/:*?"<>|/]/g, '_').replace(/_+/g, '_').trim();
  }

  // ===== СИНХРОНИЗАЦИЯ ПИСЬМА С MD ФАЙЛОМ =====
  async syncEmailToMd(email: any): Promise<void> {
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
      
    } catch (error) {
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
  formatEmailAsMd(email: any): string {
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
    (scrollContainer as HTMLElement).style.cssText = 'height: 100%; overflow-y: auto; padding-right: 4px;';
    
    let emails = this.plugin.db.getAllEmails();
    const directions = this.plugin.db.getDirections();
    
    // ПОИСК
    const query = this.searchInput?.value?.toLowerCase() || '';
    let filteredEmails = emails;
    
    if (query) {
      filteredEmails = emails.filter((email: any) => {
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
      const emptyEl = scrollContainer.createEl('p', { text: query ? '📭 Ничего не найдено' : '📭 Нет писем в локальном хранилище' });
      (emptyEl as HTMLElement).style.cssText = 'color: var(--text-muted); text-align: center; padding: 20px;';
      return;
    }
    
    const dirMap = new Map<number, string>();
    directions.forEach((d: any) => dirMap.set(d.id, d.name));
    
    const grouped: { [key: string]: any[] } = {
      'Без направления': []
    };
    
    filteredEmails.forEach((email: any) => {
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
      (groupContainer as HTMLElement).style.cssText = 'margin-bottom: 4px;';
      
      const groupHeader = groupContainer.createEl('div', { cls: 'mailer-group-header' });
      (groupHeader as HTMLElement).style.cssText = `
        padding: 8px 12px;
        background: var(--background-secondary);
        font-weight: bold;
        font-size: 0.9em;
        margin-top: 4px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        transition: background 0.15s;
        position: sticky;
        top: 0;
        z-index: 5;
      `;
      groupHeader.addEventListener('mouseenter', () => {
        (groupHeader as HTMLElement).style.background = 'var(--background-modifier-hover)';
      });
      groupHeader.addEventListener('mouseleave', () => {
        (groupHeader as HTMLElement).style.background = 'var(--background-secondary)';
      });
      
      const titleSpan = groupHeader.createEl('span');
      titleSpan.textContent = `📂 ${dirName} (${dirEmails.length})`;
      
      const arrowSpan = groupHeader.createEl('span');
      arrowSpan.textContent = '▶';
      (arrowSpan as HTMLElement).style.cssText = 'font-size: 12px; transition: transform 0.2s;';
      
      const emailsContainer = groupContainer.createEl('div', { cls: 'mailer-group-emails' });
      (emailsContainer as HTMLElement).style.cssText = 'overflow: hidden; transition: max-height 0.3s ease;';
      
      let isExpanded = false;
      const maxHeight = dirEmails.length * 100 + 20;
      
      (emailsContainer as HTMLElement).style.maxHeight = '0px';
      (emailsContainer as HTMLElement).style.opacity = '0';
      
      dirEmails.forEach((email: any) => {
        const card = emailsContainer.createEl('div', { cls: 'mailer-email-card', attr: { 'data-id': String(email.id) } });
        (card as HTMLElement).style.cssText = `
          padding: 10px 14px;
          margin: 4px 0 4px 12px;
          background: var(--background-primary);
          border-radius: 4px;
          cursor: pointer;
          border-left: 3px solid var(--interactive-accent);
          transition: background 0.2s;
        `;
        
        card.addEventListener('mouseenter', () => {
          (card as HTMLElement).style.background = 'var(--background-secondary)';
        });
        card.addEventListener('mouseleave', () => {
          (card as HTMLElement).style.background = 'var(--background-primary)';
        });
        
        const statusIcon = email.sync_status === 'synced' ? '☁️' : '📝';
        const subjectEl = card.createEl('div', { cls: 'mailer-email-subject', text: `${statusIcon} ${email.subject || 'Без темы'}` });
        (subjectEl as HTMLElement).style.fontWeight = 'bold';
        
        card.createEl('div', { cls: 'mailer-email-meta', text: `№ ${email.number || '-'} | ${email.author || 'Неизвестный'} | ${email.date || ''}` });
        card.createEl('div', { cls: 'mailer-email-preview', text: (email.text || '').substring(0, 120) + '...' });
        
        // КНОПКА РЕДАКТИРОВАНИЯ
        const actionsRow = card.createEl('div', { cls: 'mailer-email-actions' });
        (actionsRow as HTMLElement).style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';
        
        const editBtn = actionsRow.createEl('button', { cls: 'mailer-btn-edit' });
        editBtn.textContent = '✏️ Редактировать';
        (editBtn as HTMLButtonElement).style.cssText = 'padding: 2px 10px; border: none; border-radius: 4px; background: var(--background-secondary); cursor: pointer; font-size: 11px;';
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

  openEditModal(email: any) {
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

  async openEmailAsMd(email: any) {
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
      
    } catch (error) {
      console.error('Ошибка открытия письма:', error);
      new Notice(`❌ Ошибка открытия: ${(error as Error).message}`);
    }
  }

  selectEmail(email: any) {
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
    } catch (error) {
      new Notice(`❌ Ошибка экспорта: ${(error as Error).message}`);
    }
  }

  async onClose() {
    // Очистка при закрытии
  }
}