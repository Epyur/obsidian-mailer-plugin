// src/services/document.service.ts
import { Notice, TFile } from 'obsidian';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';

export class DocumentService {
  private app: any;

  constructor() {
    // @ts-ignore
    this.app = window.app;
  }
  
  private sanitizeFileName(name: string): string {
    if (!name) return 'без_названия';
    return name.replace(/[\\/:*?"<>|/]/g, '_').replace(/_+/g, '_').trim();
  }

  private escapeXml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // 🔥 НОВЫЙ МЕТОД: ПРЕОБРАЗОВАНИЕ ТЕКСТА С СОХРАНЕНИЕМ АБЗАЦЕВ
  private formatTextForWord(text: string): string {
    if (!text) return '';
    
    // Заменяем переносы строк на <br> для HTML или на \n для XML
    // Но также нужно сохранять пустые строки как отдельные абзацы
    const lines = text.split('\n');
    const result: string[] = [];
    
    for (const line of lines) {
      if (line.trim() === '') {
        // Пустая строка — добавляем <br> для создания отступа
        result.push('<br>');
      } else {
        // Обычная строка — экранируем и добавляем
        result.push(this.escapeXml(line));
      }
    }
    
    return result.join('<br>');
  }

  // 🔥 НОВЫЙ МЕТОД: ПРЕОБРАЗОВАНИЕ ТЕКСТА ДЛЯ DOCX XML
  private formatTextForDocxXml(text: string): string {
    if (!text) return '';
    const lines = text.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      if (line.trim() === '') {
        result.push('<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>');
      } else {
        result.push(`<w:p><w:r><w:t>${this.escapeXml(line)}</w:t></w:r></w:p>`);
      }
    }
    return result.join('');
  }

  private async getImageSize(path: string): Promise<{ width: number; height: number }> {
    try {
      const adapter = this.app.vault.adapter;
      const data = await adapter.readBinary(path);
      const buffer = new Uint8Array(data);

      const ext = path.split('.').pop()?.toLowerCase() || 'png';

      if (ext === 'png') {
        return { width: this.readInt(buffer, 16), height: this.readInt(buffer, 20) };
      }
      if (ext === 'jpg' || ext === 'jpeg') {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xC0 && buffer[offset + 2] === 0x00 && buffer[offset + 3] === 0x11) {
            const height = (buffer[offset + 5] << 8) + buffer[offset + 6];
            const width = (buffer[offset + 7] << 8) + buffer[offset + 8];
            return { width, height };
          }
          offset++;
        }
      }
      if (ext === 'bmp') {
        const width = this.readInt(buffer, 18);
        const height = Math.abs(this.readInt(buffer, 22));
        return { width, height };
      }
      if (ext === 'gif') {
        const width = (buffer[7] << 8) + buffer[6];
        const height = (buffer[9] << 8) + buffer[8];
        return { width, height };
      }
    } catch (e) {
      console.warn('⚠️ Не удалось определить размер изображения:', path, e);
    }
    return { width: 400, height: 300 };
  }

  private readInt(buffer: Uint8Array, offset: number): number {
    return ((buffer[offset] ?? 0) << 24) + ((buffer[offset + 1] ?? 0) << 16) + ((buffer[offset + 2] ?? 0) << 8) + (buffer[offset + 3] ?? 0);
  }

  async exportToWord(emailData: any, settings: any): Promise<string> {
    try {
      const { defaultAuthor, templatePath, placeholders } = settings;
      
      // Парсим плейсхолдеры
      let placeholderMap = {};
      try {
        placeholderMap = JSON.parse(placeholders);
      } catch {
        placeholderMap = {
          '{{Номер}}': 'number',
          '{{Тема}}': 'subject',
          '{{Текст}}': 'text',
          '{{Автор}}': 'author',
          '{{Дата}}': 'date'
        };
      }
      
      // Подготавливаем данные
      const emailDate = emailData.date ? new Date(emailData.date) : new Date();
      const formattedDate = emailDate.toLocaleDateString('ru-RU');
      
      const originalText = emailData.text || '';
      const emailImages: string[] = emailData.images || [];
      
      const data = {
        number: emailData.number || '',
        subject: emailData.subject || '',
        text: originalText,
        images: emailImages,
        textForWord: this.formatTextForWord(originalText),
        author: emailData.author || defaultAuthor || 'Кравченко А.А.',
        date: formattedDate,
        year: emailDate.getFullYear().toString(),
        month: (emailDate.getMonth() + 1).toString().padStart(2, '0'),
        day: emailDate.getDate().toString().padStart(2, '0'),
        time: emailDate.toLocaleTimeString('ru-RU')
      };
      
      console.log('📅 Дата письма:', data.date);
      console.log('📝 Текст с переносами:', data.text);
      
      // ===== 1. ПРОВЕРЯЕМ НАЛИЧИЕ ШАБЛОНА =====
      let templateFound = false;
      let templateBuffer: ArrayBuffer | null = null;
      
      if (templatePath && templatePath.trim() !== '') {
        try {
          const adapter = this.app.vault.adapter;
          const exists = await adapter.exists(templatePath);
          
          if (exists && templatePath.toLowerCase().endsWith('.docx')) {
            templateBuffer = await adapter.readBinary(templatePath);
            templateFound = true;
            console.log(`📄 DOCX шаблон загружен: ${templatePath}`);
          } else {
            console.warn('⚠️ Шаблон не найден или не .docx:', templatePath);
          }
        } catch (error) {
          console.warn('⚠️ Ошибка загрузки шаблона:', error);
        }
      }
      
      // ===== 2. РАБОТАЕМ С ШАБЛОНОМ =====
      let resultBuffer: ArrayBuffer;

      if (templateFound && templateBuffer) {
        try {
          const zip = await JSZip.loadAsync(templateBuffer);
          const documentFile = zip.file('word/document.xml');

          if (documentFile) {
            let xmlContent = await documentFile.async('text');

            const replacements: { [key: string]: string } = {
              '{{Номер}}': this.escapeXml(data.number),
              '{{Тема}}': this.escapeXml(data.subject),
              '{{Текст}}': this.formatTextForDocxXml(originalText),
              '{{Автор}}': this.escapeXml(data.author),
              '{{Дата}}': this.escapeXml(data.date),
              '{{Год}}': this.escapeXml(data.year),
              '{{Месяц}}': this.escapeXml(data.month),
              '{{День}}': this.escapeXml(data.day),
              '{{Время}}': this.escapeXml(data.time)
            };

            for (const [placeholder, value] of Object.entries(replacements)) {
              xmlContent = xmlContent.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
            }

            zip.file('word/document.xml', xmlContent);
            resultBuffer = await zip.generateAsync({ type: 'arraybuffer' });
            console.log('✅ Плейсхолдеры заменены в DOCX шаблоне');
          } else {
            throw new Error('Не найден word/document.xml в шаблоне');
          }
        } catch (error) {
          console.error('❌ Ошибка обработки шаблона:', error);
          resultBuffer = await this.createFallbackDocx(data);
        }
      } else {
        resultBuffer = await this.createFallbackDocx(data);
        console.log('📄 Использован стандартный шаблон');
      }
      
      // ===== 3. СОХРАНЯЕМ ФАЙЛ =====
      const safeNumber = this.sanitizeFileName(data.number || 'без_номера');
      const safeSubject = this.sanitizeFileName((data.subject || 'Без темы').substring(0, 30));
      const fileName = `Письмо_${safeNumber}_${safeSubject}.docx`;
      
      const folderPath = 'Экспорт';
      const adapter = this.app.vault.adapter;
      
      if (!await adapter.exists(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      
      let filePath = `${folderPath}/${fileName}`;
      let counter = 1;
      while (await adapter.exists(filePath)) {
        const newFileName = `Письмо_${safeNumber}_${safeSubject}_${counter}.docx`;
        filePath = `${folderPath}/${newFileName}`;
        counter++;
      }
      
      const uint8Array = new Uint8Array(resultBuffer);
      await adapter.writeBinary(filePath, uint8Array);
      
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(file);
      }
      
      new Notice(`✅ Экспорт завершен: ${fileName}${templateFound ? ' (с шаблоном)' : ' (стандартный)'}`);
      return filePath;
      
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      new Notice(`❌ Ошибка экспорта: ${(error as Error).message}`);
      throw error;
    }
  }

  // ===== СОЗДАНИЕ ЗАПАСНОГО .DOCX (через docx lib) =====
  private async createFallbackDocx(data: any): Promise<ArrayBuffer> {
    const adapter = this.app.vault.adapter;
    const paragraphs: Paragraph[] = [];

    paragraphs.push(new Paragraph({
      alignment: 'center',
      children: [new TextRun({ text: 'ТЕХНИЧЕСКОЕ ПИСЬМО', bold: true, size: 28 })]
    }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `№: ${data.number}` })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Дата: ${data.date}` })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Тема: ${data.subject}` })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: '─────────────────────────────────────────────────────' })] }));

    const images: string[] = data.images || [];
    const imgRegex = /\{IMG_(\d+)\}/g;

    const lines = (data.text || '').split('\n');
    for (const line of lines) {
      if (line.trim() === '') {
        paragraphs.push(new Paragraph({ children: [] }));
        continue;
      }

      imgRegex.lastIndex = 0;
      let match = imgRegex.exec(line);
      if (!match) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line })] }));
        continue;
      }

      const children: (TextRun | ImageRun)[] = [];
      let lastIndex = 0;
      imgRegex.lastIndex = 0;

      while ((match = imgRegex.exec(line)) !== null) {
        const textBefore = line.substring(lastIndex, match.index);
        if (textBefore) {
          children.push(new TextRun({ text: textBefore }));
        }

        const idx = parseInt(match[1]) - 1;
        if (idx >= 0 && idx < images.length) {
          try {
            const imgPath = images[idx];
            const imgBuffer = await adapter.readBinary(imgPath);
            const size = await this.getImageSize(imgPath);
            const maxWidth = 550;
            const scale = Math.min(1, maxWidth / (size.width || 1));
            const imgWidth = Math.round(size.width * scale);
            const imgHeight = Math.round(size.height * scale);

            children.push(new ImageRun({
              data: new Uint8Array(imgBuffer),
              transformation: { width: Math.max(imgWidth, 50), height: Math.max(imgHeight, 50) },
              type: imgPath.toLowerCase().endsWith('.png') ? 'png' as const : 'jpg' as const
            }));
          } catch (e) {
            console.warn('⚠️ Ошибка вставки изображения:', e);
            children.push(new TextRun({ text: `[Ошибка загрузки изображения ${match[1]}]` }));
          }
        } else {
          children.push(new TextRun({ text: match[0] }));
        }

        lastIndex = match.index + match[0].length;
      }

      const textAfter = line.substring(lastIndex);
      if (textAfter) {
        children.push(new TextRun({ text: textAfter }));
      }

      paragraphs.push(new Paragraph({ children }));
    }

    paragraphs.push(new Paragraph({ children: [new TextRun({ text: '─────────────────────────────────────────────────────' })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'С уважением,' })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: data.author })] }));

    const doc = new Document({
      styles: { default: { document: { run: { size: 24 } } } },
      sections: [{ children: paragraphs }]
    });

    const buf = await Packer.toBuffer(doc);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  // ===== СОЗДАНИЕ ПРИМЕРНОГО ШАБЛОНА =====
  async createDefaultTemplate(folderPath: string = 'Шаблоны писем'): Promise<string> {
    try {
      const adapter = this.app.vault.adapter;
      
      if (!await adapter.exists(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      
      const templateName = 'Стандартный шаблон.docx';
      const templatePath = `${folderPath}/${templateName}`;
      
      if (await adapter.exists(templatePath)) {
        new Notice(`ℹ️ Шаблон уже существует: ${templatePath}`);
        return templatePath;
      }
      
      const zip = new JSZip();
      
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
      
      zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="document.xml"/>
</Relationships>`);
      
      // Шаблон с плейсхолдером {{Текст}} который заменится на форматированный текст с абзацами
      zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>ТЕХНИЧЕСКОЕ ПИСЬМО</w:t></w:r></w:p>
    <w:p><w:r><w:t>№: {{Номер}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Дата: {{Дата}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Тема: {{Тема}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>─────────────────────────────────────────────────────</w:t></w:r></w:p>
    {{Текст}}
    <w:p><w:r><w:t>─────────────────────────────────────────────────────</w:t></w:r></w:p>
    <w:p><w:r><w:t>С уважением,</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{Автор}}</w:t></w:r></w:p>
  </w:body>
</w:document>`);
      
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const uint8Array = new Uint8Array(buffer);
      
      await adapter.writeBinary(templatePath, uint8Array);
      
      new Notice(`✅ Создан шаблон: ${templatePath}`);
      new Notice(`💡 Откройте в Word и отредактируйте оформление`);
      
      return templatePath;
      
    } catch (error) {
      console.error('Ошибка создания шаблона:', error);
      new Notice(`❌ Ошибка: ${(error as Error).message}`);
      throw error;
    }
  }

  async testTemplate(templatePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(templatePath);
      if (!exists) {
        return { valid: false, error: 'Файл не найден' };
      }
      
      const isDocx = templatePath.toLowerCase().endsWith('.docx');
      if (!isDocx) {
        return { valid: false, error: 'Поддерживаются только .docx файлы' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  async getAvailableTemplates(folderPath: string = 'Шаблоны писем'): Promise<string[]> {
    try {
      const adapter = this.app.vault.adapter;
      
      if (!await adapter.exists(folderPath)) {
        return [];
      }
      
      const files = await adapter.list(folderPath);
      const templates = files.files
        .filter((file: any) => file.name.toLowerCase().endsWith('.docx'))
        .map((file: any) => file.path);
      
      return templates;
      
    } catch (error) {
      console.error('Ошибка получения списка шаблонов:', error);
      return [];
    }
  }
}