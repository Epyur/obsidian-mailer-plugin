// src/database/db.ts
import { Notice, App } from 'obsidian';

export type SyncStatus = 'local' | 'synced' | 'conflict';

export interface Email {
  id: number;
  number: string;
  subject: string;
  text: string;
  author: string;
  date: string;
  direction_id: number;
  images: string[];
  mdFilePath: string;
  mdFileHash: string;
  lastSyncTime: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface Direction {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface DbData {
  emails: Email[];
  directions: Direction[];
  chat_history: unknown[];
  documents: unknown[];
}

export interface Stats {
  emails: number;
  directions: number;
}

export class LocalDatabase {
  private app: App;
  private data: DbData = {
    emails: [],
    directions: [],
    chat_history: [],
    documents: []
  };
  private initialized: boolean = false;
  private dataPath: string = 'mailer_data.json';

  constructor(app: App) {
    this.app = app;
  }

  async init(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const fileExists = await adapter.exists(this.dataPath);
      
      if (fileExists) {
        console.log('📂 Найден существующий файл:', this.dataPath);
        const content = await adapter.read(this.dataPath);
        const parsedData = JSON.parse(content);
        
        // 🔥 ЗАЩИТА: убеждаемся, что все поля существуют
        this.data = {
          emails: parsedData.emails || [],
          directions: parsedData.directions || [],
          chat_history: parsedData.chat_history || [],
          documents: parsedData.documents || []
        };
        
        console.log('✅ Данные загружены из существующего файла');
        console.log(`📊 Загружено писем: ${this.data.emails.length}`);
        console.log(`📊 Загружено направлений: ${this.data.directions.length}`);
        this.initialized = true;
        return;
      } else {
        console.log('📂 Файл не найден, создаем новый:', this.dataPath);
        await adapter.write(this.dataPath, JSON.stringify(this.data, null, 2));
        console.log('✅ Создан новый файл данных');
        this.initialized = true;
        return;
      }
      
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Ошибка инициализации хранилища:', err.message);
      
      // 🔥 ПЫТАЕМСЯ ВОССТАНОВИТЬ ДАННЫЕ
      try {
        const adapter = this.app.vault.adapter;
        const backupExists = await adapter.exists('mailer_data_backup.json');
        if (backupExists) {
          const backupContent = await adapter.read('mailer_data_backup.json');
          const parsedBackup = JSON.parse(backupContent);
          this.data = {
            emails: parsedBackup.emails || [],
            directions: parsedBackup.directions || [],
            chat_history: parsedBackup.chat_history || [],
            documents: parsedBackup.documents || []
          };
          console.log('🔄 Данные восстановлены из бэкапа');
          console.log(`📊 Восстановлено писем: ${this.data.emails.length}`);
          this.initialized = true;
          await adapter.write(this.dataPath, JSON.stringify(this.data, null, 2));
          console.log('✅ Основной файл восстановлен из бэкапа');
          return;
        }
      } catch (recoveryError: unknown) {
        console.error('❌ Не удалось восстановить данные:', recoveryError instanceof Error ? recoveryError.message : String(recoveryError));
      }
      
      // 🔥 ПОСЛЕДНЯЯ ПОПЫТКА — СОЗДАЕМ НОВЫЙ ФАЙЛ
      try {
        const adapter = this.app.vault.adapter;
        const backupPath = `mailer_data_emergency_${Date.now()}.json`;
        await adapter.write(backupPath, JSON.stringify(this.data, null, 2));
        console.log(`✅ Аварийный бэкап создан: ${backupPath}`);
        await adapter.write(this.dataPath, JSON.stringify(this.data, null, 2));
        this.initialized = true;
        console.log('✅ Создан новый файл данных');
      } catch (finalError: unknown) {
        console.error('❌ Критическая ошибка:', finalError instanceof Error ? finalError.message : String(finalError));
        new Notice('❌ Ошибка инициализации локального хранилища');
        throw error;
      }
    }
  }

  private async saveData(): Promise<void> {
    if (!this.initialized) {
      console.warn('⚠️ База данных не инициализирована, сохранение пропущено');
      return;
    }
    
    try {
      // 🔥 ЗАЩИТА: убеждаемся, что данные корректны перед сохранением
      if (!this.data.emails) this.data.emails = [];
      if (!this.data.directions) this.data.directions = [];
      if (!this.data.chat_history) this.data.chat_history = [];
      if (!this.data.documents) this.data.documents = [];
      
      const adapter = this.app.vault.adapter;
      await adapter.write(this.dataPath, JSON.stringify(this.data, null, 2));
      this.saveBackupIfNeeded();
      
    } catch (error: unknown) {
      console.error('❌ Ошибка сохранения данных:', error instanceof Error ? error.message : String(error));
    }
  }

  private saveCounter: number = 0;
  
  private async saveBackupIfNeeded(): Promise<void> {
    this.saveCounter++;
    if (this.saveCounter % 5 === 0) {
      try {
        const adapter = this.app.vault.adapter;
        await adapter.write('mailer_data_backup.json', JSON.stringify(this.data, null, 2));
        console.log('✅ Бэкап создан');
      } catch {
        console.warn('⚠️ Не удалось создать бэкап');
      }
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ===== EMAILS =====
  
  getAllEmails(): Email[] {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return [];
    }
    return this.data.emails || [];
  }

  getEmail(id: number): Email | null {
    if (!this.isReady()) return null;
    const emails = this.data.emails || [];
    return emails.find((e: Email) => e.id === id) || null;
  }

  async saveEmail(email: Partial<Email>): Promise<number> {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return -1;
    }
    
    try {
      if (!this.data.emails) {
        this.data.emails = [];
      }
      
      let existingIndex = -1;
      if (email.id) {
        existingIndex = this.data.emails.findIndex((e: Email) => e.id === email.id);
      }
      
      const newEmail: Email = {
        id: email.id ?? Date.now() + Math.floor(Math.random() * 1000),
        number: email.number ?? '',
        subject: email.subject ?? 'Без темы',
        text: email.text ?? '',
        author: email.author ?? 'Иванов И.И.',
        date: email.date ?? new Date().toISOString(),
        direction_id: email.direction_id ?? 0,
        images: email.images ?? [],
        mdFilePath: email.mdFilePath ?? '',
        mdFileHash: email.mdFileHash ?? '',
        lastSyncTime: email.lastSyncTime ?? '',
        sync_status: email.sync_status ?? 'local',
        created_at: email.created_at ?? new Date().toISOString()
      };
      
      // Логируем для отладки
      console.log('📝 Сохраняемый текст:', newEmail.text);
      console.log('📝 Длина текста:', newEmail.text.length);
      console.log('📝 Есть переносы:', newEmail.text.includes('\n') ? '✅ да' : '❌ нет');
      
      if (existingIndex > -1) {
        // 🔥 ОБНОВЛЯЕМ СУЩЕСТВУЮЩЕЕ ПИСЬМО — ПОЛНОСТЬЮ ЗАМЕНЯЕМ
        this.data.emails[existingIndex] = newEmail;
      } else {
        // Добавляем новое письмо
        this.data.emails.unshift(newEmail);
      }
      
      await this.saveData();
      console.log('✅ Письмо сохранено, ID:', newEmail.id);
      return newEmail.id;
    } catch (error: unknown) {
      console.error('❌ Ошибка сохранения письма:', error instanceof Error ? error.message : String(error));
      return -1;
    }
  }

  async deleteEmail(id: number): Promise<boolean> {
    if (!this.isReady()) return false;
    
    try {
      const emails = this.data.emails || [];
      this.data.emails = emails.filter((e: Email) => e.id !== id);
      await this.saveData();
      return true;
    } catch (error: unknown) {
      console.error('❌ Ошибка удаления письма:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  searchEmails(query: string): Email[] {
    if (!this.isReady()) return [];
    
    const q = query.toLowerCase();
    const emails = this.data.emails || [];
    return emails.filter((email: Email) => 
      (email.subject || '').toLowerCase().includes(q) ||
      (email.text || '').toLowerCase().includes(q) ||
      (email.number || '').toLowerCase().includes(q)
    );
  }

  // ===== СИНХРОНИЗАЦИЯ =====
  
  getPendingSync(): Email[] {
    if (!this.isReady()) return [];
    const emails = this.data.emails || [];
    return emails.filter((e: Email) => 
      e.sync_status === 'local' || e.sync_status === 'conflict'
    );
  }

  async markAsSynced(emailId: number): Promise<void> {
    if (!this.isReady()) return;
    
    const emails = this.data.emails || [];
    const email = emails.find((e: Email) => e.id === emailId);
    if (email) {
      email.sync_status = 'synced';
      await this.saveData();
    }
  }

  async markAllAsSynced(): Promise<void> {
    if (!this.isReady()) return;
    
    const emails = this.data.emails || [];
    for (const email of emails) {
      if (email.sync_status === 'local' || email.sync_status === 'conflict') {
        email.sync_status = 'synced';
      }
    }
    await this.saveData();
  }

  async addCloudEmails(cloudEmails: Email[]): Promise<number> {
    if (!this.isReady()) return 0;
    
    if (!this.data.emails) {
      this.data.emails = [];
    }
    
    let added = 0;
    const existingIds = new Set(this.data.emails.map((e: Email) => e.id));
    
    for (const cloudEmail of cloudEmails) {
      if (!existingIds.has(cloudEmail.id)) {
        const newEmail: Email = {
          ...cloudEmail,
          sync_status: 'synced'
        };
        this.data.emails.unshift(newEmail);
        added++;
      }
    }
    
    if (added > 0) {
      await this.saveData();
    }
    
    return added;
  }

  // ===== НАПРАВЛЕНИЯ =====
  
  getDirectionByName(name: string): Direction | null {
    if (!this.isReady()) return null;
    const directions = this.data.directions || [];
    return directions.find((d: Direction) => d.name === name) || null;
  }

  getDirections(): Direction[] {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return [];
    }
    return this.data.directions || [];
  }

  async saveDirection(name: string, description: string = ''): Promise<number> {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return -1;
    }
    
    try {
      // 🔥 ЗАЩИТА: убеждаемся, что directions существует
      if (!this.data.directions) {
        this.data.directions = [];
      }
      
      // Проверяем, не существует ли уже такое направление
      const exists = this.data.directions.some((d: Direction) => d.name === name);
      if (exists) {
        console.warn('⚠️ Направление уже существует:', name);
        return -1;
      }
      
      const newDir: Direction = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: name,
        description: description,
        created_at: new Date().toISOString()
      };
      
      this.data.directions.push(newDir);
      await this.saveData();
      console.log('✅ Создано направление:', name, 'ID:', newDir.id);
      return newDir.id;
    } catch (error: unknown) {
      console.error('❌ Ошибка сохранения направления:', error instanceof Error ? error.message : String(error));
      return -1;
    }
  }

  // ===== 🔥 НОВЫЙ МЕТОД: УДАЛЕНИЕ НАПРАВЛЕНИЯ =====
  async deleteDirection(id: number): Promise<boolean> {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return false;
    }
    
    try {
      const directions = this.data.directions || [];
      const filtered = directions.filter((d: Direction) => d.id !== id);
      
      if (filtered.length === directions.length) {
        console.warn('⚠️ Направление не найдено:', id);
        return false;
      }
      
      this.data.directions = filtered;
      await this.saveData();
      console.log('✅ Направление удалено, ID:', id);
      return true;
    } catch (error: unknown) {
      console.error('❌ Ошибка удаления направления:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // ===== СТАТИСТИКА =====
  
  getStats(): Stats {
    if (!this.isReady()) {
      console.warn('⚠️ База данных не инициализирована');
      return { emails: 0, directions: 0 };
    }
    return { 
      emails: (this.data.emails || []).length, 
      directions: (this.data.directions || []).length 
    };
  }

  // ===== ИМПОРТ/ЭКСПОРТ =====
  
  exportData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  async importData(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData) as DbData;
      this.data = {
        emails: data.emails || [],
        directions: data.directions || [],
        chat_history: data.chat_history || [],
        documents: data.documents || []
      };
      await this.saveData();
      return true;
    } catch (error: unknown) {
      console.error('❌ Ошибка импорта:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // ===== ЭКСПОРТ ПИСЕМ ПО НАПРАВЛЕНИЯМ =====

  exportEmailsByDirection(directionIds: number[]): string {
    if (!this.isReady()) return '{}';

    const filteredEmails = (this.data.emails || []).filter((e: Email) =>
      directionIds.includes(e.direction_id || 0)
    );

    const relatedDirections = (this.data.directions || []).filter((d: Direction) =>
      directionIds.includes(d.id)
    );

    const exportData: DbData = {
      emails: filteredEmails,
      directions: relatedDirections,
      chat_history: [],
      documents: []
    };

    return JSON.stringify(exportData, null, 2);
  }

  // ===== ИЗОБРАЖЕНИЯ =====

  getImageDirectory(): string {
    return 'Технические письма/Изображения';
  }

  async ensureImageDirectory(): Promise<void> {
    const dir = this.getImageDirectory();
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(dir)) {
      await this.app.vault.createFolder(dir);
    }
  }

  async saveImage(fileName: string, data: ArrayBuffer): Promise<string | null> {
    try {
      await this.ensureImageDirectory();
      const dir = this.getImageDirectory();
      let filePath = `${dir}/${fileName}`;
      const adapter = this.app.vault.adapter;
      let counter = 1;
      while (await adapter.exists(filePath)) {
        const ext = fileName.split('.').pop() || '';
        const base = fileName.substring(0, fileName.length - ext.length - 1);
        filePath = `${dir}/${base}_${counter}.${ext}`;
        counter++;
      }
      const uint8 = new Uint8Array(data);
      await adapter.writeBinary(filePath, uint8.buffer);
      console.log('✅ Изображение сохранено:', filePath);
      return filePath;
    } catch (error: unknown) {
      console.error('❌ Ошибка сохранения изображения:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async deleteImage(imagePath: string): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(imagePath)) {
        await adapter.remove(imagePath);
        console.log('🗑️ Изображение удалено:', imagePath);
      }
    } catch (error: unknown) {
      console.error('❌ Ошибка удаления изображения:', error instanceof Error ? error.message : String(error));
    }
  }
}