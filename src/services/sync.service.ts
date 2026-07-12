// src/services/sync.service.ts
import { Notice } from 'obsidian';
import { LocalDatabase } from '../database/db';
import MailerPlugin from '../main';

export class SyncService {
  private db: LocalDatabase;
  private settings: any;
  private plugin: MailerPlugin;

  constructor(db: LocalDatabase, settings: any, plugin: MailerPlugin) {
    this.db = db;
    this.settings = settings;
    this.plugin = plugin;
  }

  async syncWithCloud(): Promise<void> {
    // 🔥 ПОЛУЧАЕМ ТОКЕН ИЗ БЕЗОПАСНОГО ХРАНИЛИЩА
    const token = this.plugin.getToken();
    
    if (!token) {
      new Notice('❌ Токен не настроен. Настройте токен в настройках плагина.');
      return;
    }

    if (!this.settings.apiUrl) {
      new Notice('❌ API URL не настроен. Невозможно синхронизироваться.');
      return;
    }

    new Notice('🔄 Начинается синхронизация...');
    
    try {
      // ===== 1. PUSH: Отправляем локальные изменения =====
      const pending = this.db.getPendingSync();
      
      if (pending.length > 0) {
        console.log(`📤 Отправка ${pending.length} писем в облако...`);
        
        const pushResponse = await fetch(`${this.settings.apiUrl}/api/sync/push`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            emails: pending.map((email: any) => ({
              subject: email.subject,
              text: email.text,
              author: email.author || 'Иванов И.И.',
              number: email.number || '',
              date: email.date || new Date().toISOString()
            }))
          })
        });
        
        if (pushResponse.ok) {
          const result = await pushResponse.json();
          
          for (const email of pending) {
            this.db.markAsSynced(email.id);
          }
          
          new Notice(`✅ Отправлено ${pending.length} писем в облако`);
        } else {
          const error = await pushResponse.text();
          throw new Error(`HTTP ${pushResponse.status}: ${error}`);
        }
      } else {
        console.log('📭 Нет локальных изменений для отправки');
      }

      // ===== 2. PULL: Получаем новые письма из облака =====
      console.log('📥 Получение писем из облака...');
      
      const pullResponse = await fetch(`${this.settings.apiUrl}/api/sync/pull`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (pullResponse.ok) {
        const data = await pullResponse.json();
        const cloudEmails = data.emails || [];
        
        if (cloudEmails.length > 0) {
          const added = this.db.addCloudEmails(cloudEmails);
          new Notice(`✅ Получено ${added} новых писем из облака`);
        } else {
          console.log('📭 Нет новых писем в облаке');
        }
      } else {
        const error = await pullResponse.text();
        throw new Error(`HTTP ${pullResponse.status}: ${error}`);
      }
      
      new Notice('✅ Синхронизация завершена!');
      
    } catch (error) {
      const errMsg = (error as Error).message;
      new Notice(`❌ Ошибка синхронизации: ${errMsg}`);
      console.error('Ошибка синхронизации:', error);
    }
  }

  async syncNow(): Promise<void> {
    await this.syncWithCloud();
  }

  updateSettings(newSettings: any): void {
    this.settings = newSettings;
  }
}