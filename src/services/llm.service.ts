// src/services/llm.service.ts
import { requestUrl } from 'obsidian';
import MailerPlugin from '../main';

export class LLMService {
  settings: any;
  plugin: MailerPlugin;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 2000;

  constructor(settings: any, plugin: MailerPlugin) {
    this.settings = settings;
    this.plugin = plugin;
  }

  updateSettings(newSettings: any) {
    this.settings = newSettings;
    console.log('🔄 LLM настройки обновлены');
  }

  private getApiKey(): string | null {
    const secretName = this.plugin.settings.llmApiKeySecret;
    console.log('🔑 Имя секрета LLM:', secretName || '(не задано)');

    const key = this.plugin.getLLMApiKey();
    
    if (key) {
      console.log('✅ API ключ получен через SecretStorage');
      return key;
    }

    // @ts-ignore
    const oldKey = this.plugin.settings.llmApiKey;
    if (oldKey) {
      console.log('🔄 Используем старый llmApiKey из настроек (fallback)');
      return oldKey;
    }

    console.warn('❌ API ключ не найден ни в SecretStorage, ни в старых настройках');
    return null;
  }

  // ===== 🔥 НОВЫЙ МЕТОД: ОЧИСТКА ТЕКСТА ДЛЯ LLM =====
  private cleanTextForLLM(text: string): string {
    if (!text) return '';
    
    // Заменяем переносы строк на пробелы, но сохраняем структуру
    // для лучшего понимания контекста
    return text
      .replace(/\n{3,}/g, '\n\n') // Множественные переносы -> два переноса
      .replace(/\n/g, ' ')        // Одиночные переносы -> пробел
      .replace(/\s{2,}/g, ' ')    // Множественные пробелы -> один пробел
      .trim();
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`⏳ Ожидание ${waitTime}мс перед следующим запросом...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  private async retryWithBackoff(
    fn: () => Promise<any>,
    maxRetries: number = 3,
    baseDelay: number = 3000
  ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        if (error.message?.includes('429') || error.status === 429) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`⚠️ Получена ошибка 429. Повторная попытка через ${delay}мс (попытка ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError || new Error('Превышено количество попыток');
  }

  private extractKeywords(query: string): string[] {
    const stopWords = ['это', 'как', 'так', 'вот', 'для', 'что', 'с', 'на', 'и', 'по', 'к', 'у', 'из', 'за', 'о', 'об', 'от', 'до', 'при', 'без', 'для', 'через', 'между', 'среди', 'вокруг', 'около', 'возле', 'перед', 'над', 'под', 'про', 'в', 'а', 'но', 'или', 'же', 'бы', 'да', 'нет', 'не', 'ни', 'то', 'со', 'же', 'какие', 'просто', 'перечисли', 'базе', 'подготовь', 'дай', 'представь'];
    
    const words = query
      .toLowerCase()
      .replace(/[^\w\s\u0400-\u04FF]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    return [...new Set(words)];
  }

  private findRelevantEmails(emails: any[], keywords: string[]): any[] {
    if (keywords.length === 0) {
      return emails;
    }

    const scoredEmails = emails.map((email) => {
      const text = (email.subject || '') + ' ' + (email.text || '');
      const lowerText = text.toLowerCase();
      
      let score = 0;
      let matchCount = 0;
      
      for (const keyword of keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = (lowerText.match(regex) || []).length;
        if (matches > 0) {
          matchCount++;
          score += matches;
        }
      }
      
      return { email, score, matchCount };
    });

    const sorted = scoredEmails
      .filter(item => item.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount || b.score - a.score);

    console.log(`🔍 Найдено ${sorted.length} релевантных писем из ${emails.length}`);
    
    return sorted.map(item => item.email);
  }

  // ===== МЕТОД ДЛЯ ЧАТА =====
  async askOnDatabaseWithContext(
    database: any,
    settings: any,
    userQuestion: string,
    fileContext: string = '',
    historyContext: string = ''
  ): Promise<string> {
    const { llmModel, llmApiUrl, llmSystemPrompt } = settings || this.settings;
    const llmApiKey = this.getApiKey();

    if (!llmApiKey) {
      throw new Error('API ключ не настроен.');
    }

    if (!userQuestion || userQuestion.trim() === '') {
      throw new Error('Вопрос не может быть пустым');
    }

    const emails = database.emails || [];
    const directions = database.directions || [];

    console.log(`📊 Всего писем в базе (чат): ${emails.length}`);

    const keywords = this.extractKeywords(userQuestion);
    console.log(`🔑 Ключевые слова (чат):`, keywords);

    const relevantEmails = this.findRelevantEmails(emails, keywords);
    const emailsToUse = relevantEmails.length > 0 ? relevantEmails : emails;
    
    console.log(`📧 Используется ${emailsToUse.length} писем для ответа`);

    // 🔥 ОЧИЩАЕМ ТЕКСТ ПИСЕМ ОТ ПЕРЕНОСОВ ДЛЯ LLM
    const dbContext = this.buildOptimizedContext(emailsToUse, directions);
    const fullContext = dbContext + fileContext + historyContext;

    const systemPrompt = llmSystemPrompt || `Ты — эксперт TECHNONICOL. Отвечай на русском языке. Используй информацию из писем. Если данных нет — скажи честно.`;

    const userPrompt = `
## КОНТЕКСТ (письма TECHNONICOL)

${fullContext}

## ВОПРОС:
${userQuestion}

## ОТВЕТЬ:
`;

    const apiUrl = llmApiUrl || 'https://ask.chadgpt.ru/api/v1/chat/completions';

    return await this.retryWithBackoff(async () => {
      console.log(`🌐 Отправка запроса с ${emailsToUse.length} письмами`);

      const response = await requestUrl({
        url: apiUrl,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: llmModel || 'gpt-5-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 4000
        })
      });

      if (response.status === 429) {
        throw new Error(`429: Too Many Requests`);
      }

      if (response.status !== 200) {
        console.error('❌ Ответ сервера:', response.status, response.text);
        throw new Error(`HTTP ${response.status}: ${response.text}`);
      }

      const data = JSON.parse(response.text);
      const answer = data.choices?.[0]?.message?.content || 'Нет ответа от LLM';

      console.log(`✅ Ответ получен, длина: ${answer.length} символов`);
      return answer;
    });
  }

  // ===== ОПТИМИЗИРОВАННЫЙ КОНТЕКСТ С ОЧИСТКОЙ ТЕКСТА =====
  private buildOptimizedContext(emails: any[], directions: any[]): string {
    let context = `Найдено ${emails.length} писем.\n`;

    if (directions.length > 0) {
      context += `Направления: ${directions.map(d => d.name).join(', ')}\n\n`;
    }

    const maxEmails = Math.min(emails.length, 80);
    const uniqueSubjects = new Set();
    let emailCount = 0;
    
    for (const email of emails) {
      if (emailCount >= maxEmails) break;
      
      const subject = email.subject || 'Без темы';
      
      // 🔥 ОЧИЩАЕМ ТЕКСТ ОТ ПЕРЕНОСОВ ДЛЯ LLM
      const rawText = email.text || '';
      const cleanText = this.cleanTextForLLM(rawText);
      const textPreview = cleanText.length > 350 ? cleanText.substring(0, 350) + '...' : cleanText;
      
      if (uniqueSubjects.has(subject)) continue;
      uniqueSubjects.add(subject);
      
      context += `\n---\n`;
      context += `📧 ${subject}\n`;
      context += `📝 ${textPreview}\n`;
      emailCount++;
    }

    if (emails.length > emailCount) {
      context += `\n... и еще ${emails.length - emailCount} писем (не показаны для экономии места)`;
    }

    return context;
  }

  // ===== МЕТОД ДЛЯ ВСЕЙ БАЗЫ =====
  async askOnDatabase(database: any, settings: any, userQuestion: string): Promise<string> {
    const { llmModel, llmApiUrl, llmSystemPrompt } = settings || this.settings;
    const llmApiKey = this.getApiKey();

    if (!llmApiKey) {
      throw new Error('API ключ не настроен.');
    }

    if (!userQuestion || userQuestion.trim() === '') {
      throw new Error('Вопрос не может быть пустым');
    }

    const emails = database.emails || [];
    const directions = database.directions || [];

    console.log(`📊 Всего писем в базе: ${emails.length}`);

    const keywords = this.extractKeywords(userQuestion);
    console.log(`🔑 Ключевые слова:`, keywords);

    const relevantEmails = this.findRelevantEmails(emails, keywords);
    const emailsToUse = relevantEmails.length > 0 ? relevantEmails : emails;
    console.log(`📧 Используется ${emailsToUse.length} писем для ответа`);

    const dbContext = this.buildOptimizedContext(emailsToUse, directions);

    const systemPrompt = llmSystemPrompt || `Ты — эксперт TECHNONICOL. Отвечай на русском языке. Используй информацию из писем.`;

    const userPrompt = `
## ПИСЬМА TECHNONICOL

${dbContext}

## ВОПРОС:
${userQuestion}

## ОТВЕТЬ:
`;

    const apiUrl = llmApiUrl || 'https://ask.chadgpt.ru/api/v1/chat/completions';

    return await this.retryWithBackoff(async () => {
      console.log(`🌐 Отправка запроса с ${emailsToUse.length} письмами`);

      const response = await requestUrl({
        url: apiUrl,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: llmModel || 'gpt-5-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 4000
        })
      });

      if (response.status === 429) {
        throw new Error(`429: Too Many Requests`);
      }

      if (response.status !== 200) {
        console.error('❌ Ответ сервера:', response.status, response.text);
        throw new Error(`HTTP ${response.status}: ${response.text}`);
      }

      const data = JSON.parse(response.text);
      const answer = data.choices?.[0]?.message?.content || 'Нет ответа от LLM';

      console.log(`✅ Ответ получен, длина: ${answer.length} символов`);
      return answer;
    });
  }

  // ===== СТАРЫЙ МЕТОД (для одного письма) =====
  async ask(emailData: any, settings: any): Promise<string> {
    const { llmModel, llmApiUrl, llmSystemPrompt } = settings || this.settings;
    const llmApiKey = this.getApiKey();

    if (!llmApiKey) {
      throw new Error('API ключ не настроен.');
    }

    const systemPrompt = llmSystemPrompt || `Ты — эксперт TECHNONICOL. Отвечай на русском языке, используя только информацию из письма.`;

    // 🔥 ОЧИЩАЕМ ТЕКСТ ПИСЬМА ОТ ПЕРЕНОСОВ
    const cleanText = this.cleanTextForLLM(emailData.text || '');

    const userPrompt = `
Письмо:
Тема: ${emailData.subject}
Автор: ${emailData.author}
Дата: ${emailData.date}
Текст:
${cleanText}

Вопрос: Какие ключевые выводы можно сделать из этого письма?
`;

    const apiUrl = llmApiUrl || 'https://ask.chadgpt.ru/api/v1/chat/completions';

    return await this.retryWithBackoff(async () => {
      const response = await requestUrl({
        url: apiUrl,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: llmModel || 'gpt-5-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 2000
        })
      });

      if (response.status === 429) {
        throw new Error(`429: Too Many Requests`);
      }

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.text}`);
      }

      const data = JSON.parse(response.text);
      return data.choices?.[0]?.message?.content || 'Нет ответа от LLM';
    });
  }

  // ===== УНИВЕРСАЛЬНЫЙ ЗАПРОС =====
  async askCustom(prompt: string, settings: any): Promise<string> {
    const { llmModel, llmApiUrl, llmSystemPrompt } = settings || this.settings;
    const llmApiKey = this.getApiKey();

    if (!llmApiKey) {
      throw new Error('API ключ не настроен.');
    }

    const systemPrompt = llmSystemPrompt || `Ты — эксперт TECHNONICOL. Отвечай на русском языке естественно и человечно.`;

    const apiUrl = llmApiUrl || 'https://ask.chadgpt.ru/api/v1/chat/completions';

    return await this.retryWithBackoff(async () => {
      const response = await requestUrl({
        url: apiUrl,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: llmModel || 'gpt-5-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 5000
        })
      });

      if (response.status === 429) {
        throw new Error(`429: Too Many Requests`);
      }

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.text}`);
      }

      const data = JSON.parse(response.text);
      return data.choices?.[0]?.message?.content || 'Нет ответа от LLM';
    });
  }
}