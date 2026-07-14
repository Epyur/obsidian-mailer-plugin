// src/main.ts
import { App, Plugin, PluginSettingTab, Setting, Notice, WorkspaceLeaf, SecretComponent } from 'obsidian';
import { EmailsView, VIEW_TYPE_EMAILS } from './views/emails.view';
import { DocumentService } from './services/document.service';
import { LLMService } from './services/llm.service';
import { LocalDatabase } from './database/db';
import { SyncService } from './services/sync.service';

interface MailerPluginSettings {
  tokenSecret: string;
  llmApiKeySecret: string;
  token?: string;
  llmApiKey?: string;
  apiUrl: string;
  defaultAuthor: string;
  templatePath: string;
  placeholders: string;
  llmApiUrl: string;
  llmModel: string;
  llmSystemPrompt: string;
  syncEnabled: boolean;
  syncInterval: number;
}

const DEFAULT_SETTINGS: MailerPluginSettings = {
  tokenSecret: '',
  llmApiKeySecret: '',
  token: '',
  llmApiKey: '',
  apiUrl: 'http://localhost:5000',
  defaultAuthor: 'Иванов И.И.',
  templatePath: '',
  placeholders: JSON.stringify({
    '{{Номер}}': 'number',
    '{{Тема}}': 'subject',
    '{{Текст}}': 'text',
    '{{Автор}}': 'author',
    '{{Дата}}': 'date'
  }, null, 2),
  llmApiUrl: 'https://ask.chadgpt.ru/api/v1/chat/completions',
  llmModel: 'gpt-5-mini',
  llmSystemPrompt: `Ты — эксперт по пожарной безопасности строительных материалов и систем TECHNONICOL.

Отвечай на русском языке естественно и человечно, как опытный специалист, а не как структурированный отчет.
Избегай маркдауна, звездочек, заголовков и четких структурных разделов.
Используй плавные переходы между мыслями, абзацы для удобства чтения.
Если информации недостаточно — честно скажи об этом, но предложи, где можно уточнить.
Не выдумывай факты, которых нет в базе.
Отвечай дружелюбно и профессионально.`,
  syncEnabled: true,
  syncInterval: 300
};

export default class MailerPlugin extends Plugin {
  settings!: MailerPluginSettings;
  documentService!: DocumentService;
  llmService!: LLMService;
  db!: LocalDatabase;
  syncService!: SyncService;

  // ===== WORK WITH SECRETS =====

  /**
   * Get secret value from SecretStorage
   * Uses try-catch to handle different API versions
   */
  getSecretValue(secretName: string): string | null {
    if (!secretName) {
      console.warn('⚠️ Secret name is empty');
      return null;
    }

    try {
      // @ts-ignore - SecretStorage API may vary
      const storage = this.app.secretStorage;

      if (!storage) {
        console.warn('⚠️ SecretStorage is null/undefined');
        // FALLBACK: check old settings
        if (this.settings.llmApiKey) {
          console.log('🔄 Using llmApiKey from old settings');
          return this.settings.llmApiKey;
        }
        if (this.settings.token) {
          console.log('🔄 Using token from old settings');
          return this.settings.token;
        }
        return null;
      }

      // 🔥 SIMPLE APPROACH: try different methods
      let value: string | null = null;

      try {
        // Try getSecret (documentation)
        // @ts-ignore
        value = storage.getSecret(secretName);
        console.log('✅ Used getSecret method');
      } catch {
        try {
          // Try get (alternative)
          // @ts-ignore
          value = storage.get(secretName) as string;
          console.log('✅ Used get method');
        } catch {
          try {
            // Try direct property access
            // @ts-ignore
            value = storage[secretName] as string;
            console.log('✅ Used property access');
          } catch {
            console.warn('⚠️ Could not retrieve secret');
          }
        }
      }

      console.log(`🔑 Secret "${secretName}":`, value ? '✅ found' : '❌ not found');
      return value || null;

    } catch (error: unknown) {
      console.error('❌ Error getting secret:', error);
      // FALLBACK: check old settings
      if (this.settings.llmApiKey) {
        console.log('🔄 Using llmApiKey from old settings (fallback)');
        return this.settings.llmApiKey;
      }
      if (this.settings.token) {
        console.log('🔄 Using token from old settings (fallback)');
        return this.settings.token;
      }
      return null;
    }
  }

  /**
   * Save secret to SecretStorage
   */
  async saveSecret(secretName: string, value: string): Promise<boolean> {
    if (!secretName || !value) {
      console.warn('⚠️ Secret name or value is empty');
      return false;
    }

    try {
      // @ts-ignore
      const storage = this.app.secretStorage;

      if (!storage) {
        console.warn('⚠️ SecretStorage not available');
        return false;
      }

      // Try different methods
      try {
        // @ts-ignore
        await storage.setSecret(secretName, value);
        console.log('✅ Used setSecret method');
      } catch {
        try {
          // @ts-ignore
          await storage.set(secretName, value);
          console.log('✅ Used set method');
        } catch {
          // @ts-ignore
          storage[secretName] = value;
          console.log('✅ Used property assignment');
        }
      }

      console.log(`✅ Secret "${secretName}" saved`);
      return true;

    } catch (error: unknown) {
      console.error('❌ Error saving secret:', error);
      return false;
    }
  }

  getLLMApiKey(): string | null {
    return this.getSecretValue(this.settings.llmApiKeySecret);
  }

  getToken(): string | null {
    return this.getSecretValue(this.settings.tokenSecret);
  }

  async onload() {
    console.log('🔌 Loading plugin Technical Assistant TECHNONICOL');

    await this.loadSettings();

    this.db = new LocalDatabase(this.app);

    try {
      await this.db.init();
      console.log('✅ Local storage initialized successfully');
      const stats = this.db.getStats();
      console.log(`📊 Local storage: ${stats.emails} emails, ${stats.directions} directions`);
    } catch (error: unknown) {
      console.error('❌ Storage initialization error:', error);
      new Notice('❌ Error initializing local storage');
    }

    this.documentService = new DocumentService();
    this.llmService = new LLMService(this.settings, this);
    this.syncService = new SyncService(this.db, this.settings, this);

    this.registerView(
      VIEW_TYPE_EMAILS,
      (leaf: WorkspaceLeaf) => new EmailsView(leaf, this)
    );

    this.addCommand({
      id: 'open-emails',
      name: '📧 Open emails',
      callback: async () => {
        await this.activateView(VIEW_TYPE_EMAILS);
      }
    });

    this.addCommand({
      id: 'sync-with-cloud',
      name: '🔄 Sync with cloud',
      callback: async () => {
        await this.syncService.syncWithCloud();
      }
    });

    this.addCommand({
      id: 'show-status',
      name: '📊 Local DB status',
      callback: () => {
        const stats = this.db.getStats();
        const pending = this.db.getPendingSync().length;
        new Notice(`📊 Local storage:\n📧 Emails: ${stats.emails}\n📂 Directions: ${stats.directions}\n⏳ Pending sync: ${pending}`);
      }
    });

    this.addRibbonIcon('mail', '📧 Technical emails', async () => {
      await this.activateView(VIEW_TYPE_EMAILS);
    });

    this.addRibbonIcon('sync', '🔄 Sync', async () => {
      await this.syncService.syncWithCloud();
    });

    this.addSettingTab(new MailerSettingTab(this.app, this));
  }

  async activateView(viewType: string) {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(viewType)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: viewType,
          active: true,
        });
      } else {
        const leftLeaf = workspace.getLeftLeaf(false);
        if (leftLeaf) {
          leaf = leftLeaf;
          await leaf.setViewState({
            type: viewType,
            active: true,
          });
        }
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    const savedData: Record<string, unknown> = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);

    if (this.llmService) {
      this.llmService.updateSettings(this.settings);
    }
    if (this.syncService) {
      this.syncService.updateSettings(this.settings);
    }
  }
}

// ===== SETTINGS TAB =====
class MailerSettingTab extends PluginSettingTab {
  plugin: MailerPlugin;

  constructor(app: App, plugin: MailerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setHeading().setName('Technical Assistant TECHNONICOL');

    const stats = this.plugin.db.getStats();
    const pending = this.plugin.db.getPendingSync().length;

    const statusContainer = containerEl.createDiv({ cls: 'mailer-status-container' });
    statusContainer.createEl('p', { text: `📊 Local storage: ${stats.emails} emails, ${stats.directions} directions` });
    statusContainer.createEl('p', { text: `⏳ Pending sync: ${pending}` });

    // ===== CLOUD SETTINGS =====
    new Setting(containerEl).setHeading().setName('Cloud sync');

    new Setting(containerEl)
      .setName('API URL')
      .setDesc('Cloud API URL for sync')
      .addText(text => text
        .setPlaceholder('http://localhost:5000')
        .setValue(this.plugin.settings.apiUrl)
        .onChange(async (value) => {
          this.plugin.settings.apiUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Access Token')
      .setDesc('Token for cloud sync. Stored in Obsidian Secure Storage.')
      .addComponent(el => new SecretComponent(this.app, el)
        .setValue(this.plugin.settings.tokenSecret)
        .onChange(async (value) => {
          this.plugin.settings.tokenSecret = value;
          await this.plugin.saveSettings();
          new Notice('✅ Token saved in secure storage');
        }));

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc('Force sync with cloud')
      .addButton(button => button
        .setButtonText('🔄 Sync')
        .onClick(async () => {
          await this.plugin.syncService.syncWithCloud();
        }));

    // ===== LOCAL SETTINGS =====
    new Setting(containerEl).setHeading().setName('Local settings');

    new Setting(containerEl)
      .setName('Default author')
      .setDesc('Author that will be used by default')
      .addText(text => text
        .setPlaceholder('Ivanov I.I.')
        .setValue(this.plugin.settings.defaultAuthor)
        .onChange(async (value) => {
          this.plugin.settings.defaultAuthor = value || 'Ivanov I.I.';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Placeholders')
      .setDesc('JSON mapping of placeholders to fields')
      .addTextArea(text => text
        .setPlaceholder('{"{{Number}}": "number", "{{Subject}}": "subject"}')
        .setValue(this.plugin.settings.placeholders)
        .onChange(async (value) => {
          this.plugin.settings.placeholders = value;
          await this.plugin.saveSettings();
        }));

    // ===== TEMPLATES =====
    new Setting(containerEl).setHeading().setName('Export templates');

    new Setting(containerEl)
      .setName('Path to Word template')
      .setDesc('Relative path to .docx template file in Obsidian vault. Leave empty to use standard template.')
      .addText(text => {
        text
          .setPlaceholder('Templates/Standard template.docx')
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            this.plugin.settings.templatePath = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('mailer-input-fullwidth');
      });

    new Setting(containerEl)
      .setName('Create default template')
      .setDesc('Create a standard template in "Templates" folder')
      .addButton(button => button
        .setButtonText('📄 Create template')
        .onClick(async () => {
          try {
            const path = await this.plugin.documentService.createDefaultTemplate();
            this.plugin.settings.templatePath = path;
            await this.plugin.saveSettings();
            new Notice(`✅ Template created: ${path}`);
            this.display();
          } catch (error: unknown) {
            new Notice(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }));

    new Setting(containerEl)
      .setName('Check template')
      .setDesc('Check if the specified template exists')
      .addButton(button => button
        .setButtonText('🔍 Check')
        .onClick(async () => {
          const path = this.plugin.settings.templatePath;
          if (!path || path.trim() === '') {
            new Notice('⚠️ Template path not specified');
            return;
          }

          const result = await this.plugin.documentService.testTemplate(path);
          if (result.valid) {
            new Notice('✅ Template found and available');
          } else {
            new Notice(`❌ Error: ${result.error || 'Template not found'}`);
          }
        }));

    // ===== LLM =====
    new Setting(containerEl).setHeading().setName('AI Assistant');

    new Setting(containerEl)
      .setName('LLM API URL')
      .setDesc('API URL for LLM (supports OpenAI-compatible APIs)')
      .addText(text => text
        .setPlaceholder('https://ask.chadgpt.ru/api/v1/chat/completions')
        .setValue(this.plugin.settings.llmApiUrl || 'https://ask.chadgpt.ru/api/v1/chat/completions')
        .onChange(async (value) => {
          this.plugin.settings.llmApiUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('LLM API Key')
      .setDesc('API key for LLM. Stored in Obsidian Secure Storage.')
      .addComponent(el => new SecretComponent(this.app, el)
        .setValue(this.plugin.settings.llmApiKeySecret)
        .onChange(async (value) => {
          this.plugin.settings.llmApiKeySecret = value;
          await this.plugin.saveSettings();
          new Notice('✅ LLM API key saved in secure storage');
        }));

    new Setting(containerEl)
      .setName('LLM Model')
      .setDesc('Model name')
      .addText(text => text
        .setPlaceholder('gpt-5-mini')
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value || 'gpt-5-mini';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('System prompt for LLM')
      .setDesc('Instruction for LLM that defines style and character of responses')
      .addTextArea(text => {
        text
          .setPlaceholder('Enter system prompt...')
          .setValue(this.plugin.settings.llmSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.llmSystemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('mailer-textarea-fullwidth');
      });
  }
}