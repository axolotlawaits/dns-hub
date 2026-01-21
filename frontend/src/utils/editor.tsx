import React, { useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
// Импортируем языки для подсветки синтаксиса
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import { IconBold, IconItalic, IconUnderline, IconStrikethrough, IconH2, IconH3, IconList, IconCode, IconLink, IconPhoto, IconFileUpload } from '@tabler/icons-react';
import '../utils/styles/editor.css';

// Инициализируем lowlight с поддержкой языков
const lowlight = createLowlight();
lowlight.register('javascript', javascript);
lowlight.register('typescript', typescript);
lowlight.register('css', css);
lowlight.register('html', html);
lowlight.register('xml', html);
lowlight.register('json', json);
lowlight.register('python', python);
lowlight.register('sql', sql);
lowlight.register('bash', bash);
lowlight.register('shell', bash);

type TiptapEditorProps = {
  content: string;
  onChange: (content: string) => void;
  telegramMode?: boolean; // Режим для Telegram (ограниченное форматирование)
  onFileUpload?: (file: File) => Promise<string>; // Callback для загрузки файлов
};

const TiptapEditor: React.FC<TiptapEditorProps> = ({ content, onChange, telegramMode = false, onFileUpload }) => {
  const [selectedImageWidth, setSelectedImageWidth] = useState<number>(100);
  const [hasImageSelected, setHasImageSelected] = useState(false);

  const editor = useEditor({
    extensions: telegramMode ? [
      // Только расширения, поддерживаемые Telegram
      StarterKit.configure({
        heading: false, // Отключаем заголовки
        bulletList: false, // Отключаем списки
        orderedList: false, // Отключаем нумерованные списки
        blockquote: false, // Отключаем цитаты
        horizontalRule: false, // Отключаем горизонтальные линии
        codeBlock: false, // Отключаем codeBlock для Telegram режима
        link: false, // Отключаем link из StarterKit, используем отдельное расширение
        underline: false, // Отключаем underline из StarterKit, используем отдельное расширение
        // strike, code включены по умолчанию
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
    ] : [
      // Полный набор расширений
      StarterKit.configure({
        codeBlock: false, // Отключаем стандартный codeBlock, используем с подсветкой
        link: false, // Отключаем link из StarterKit, используем отдельное расширение
        underline: false, // Отключаем underline из StarterKit, используем отдельное расширение
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Image,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const isImage = editor.isActive('image');
      setHasImageSelected(isImage);
      if (isImage) {
        const attrs = editor.getAttributes('image');
        const widthAttr = attrs?.width || attrs?.style;
        let width = 100;
        if (typeof widthAttr === 'string') {
          const match = widthAttr.match(/(\d+)%/);
          if (match) width = parseInt(match[1], 10);
        }
        setSelectedImageWidth(isNaN(width) ? 100 : Math.min(Math.max(width, 10), 100));
      }
    },
  });

  const setLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setImage = useCallback(() => {
    const url = window.prompt('Введите URL изображения:');
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onFileUpload) return;

    // В toolbar загружаем только изображения
    if (!file.type.startsWith('image/')) {
      alert('В панели инструментов можно загружать только изображения. Для других файлов используйте раздел "Вложения"');
      event.target.value = '';
      return;
    }

    try {
      // Загружаем файл через callback
      const fileUrl = await onFileUpload(file);
      console.log('[TiptapEditor] Вставляем изображение:', fileUrl);
      editor?.chain().focus().setImage({ src: fileUrl }).run();
      // Проверяем, что изображение вставилось
      setTimeout(() => {
        const images = editor?.getHTML().match(/<img[^>]+>/g);
        console.log('[TiptapEditor] Изображения в редакторе:', images);
      }, 100);
    } catch (error) {
      console.error('Ошибка при загрузке файла:', error);
      alert('Ошибка при загрузке файла');
    }
    
    // Сбрасываем input для возможности повторной загрузки того же файла
    event.target.value = '';
  }, [editor, onFileUpload]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  const buttons = telegramMode ? [
    // Только кнопки, поддерживаемые Telegram
    { name: 'Bold', icon: IconBold, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold') },
    { name: 'Italic', icon: IconItalic, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic') },
    { name: 'Underline', icon: IconUnderline, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline') },
    { name: 'Strike', icon: IconStrikethrough, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike') },
    { name: 'Code', icon: IconCode, action: () => editor.chain().focus().toggleCode().run(), isActive: editor.isActive('code') },
    { name: 'Link', icon: IconLink, action: setLink, isActive: editor.isActive('link') },
  ] : [
    // Полный набор кнопок
    { name: 'Bold', icon: IconBold, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold') },
    { name: 'Italic', icon: IconItalic, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic') },
    { name: 'Underline', icon: IconUnderline, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline') },
    { name: 'Strike', icon: IconStrikethrough, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike') },
    { name: 'H2', icon: IconH2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: editor.isActive('heading', { level: 2 }) },
    { name: 'H3', icon: IconH3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: editor.isActive('heading', { level: 3 }) },
    { name: 'List', icon: IconList, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList') },
    { name: 'Code Block', icon: IconCode, action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock') },
    { name: 'Image', icon: IconPhoto, action: setImage },
    { name: 'Link', icon: IconLink, action: setLink, isActive: editor.isActive('link') },
  ];

  return (
    <div className="tiptap-editor">
      <div className="menu-bar">
        {buttons.map((button) => {
          const IconComponent = button.icon;
          return (
            <button
              key={button.name}
              type="button"
              onClick={button.action}
              className={button.isActive ? 'is-active' : ''}
              title={button.name}
            >
              {IconComponent ? <IconComponent size={18} /> : button.name}
            </button>
          );
        })}
        {onFileUpload && !telegramMode && (
          <label className="file-upload-button" title="Загрузить изображение">
            <IconFileUpload size={18} />
            <input
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              accept="image/*"
            />
          </label>
        )}
      </div>
      {hasImageSelected && !telegramMode && (
        <div className="image-resize-bar">
          <span>Ширина: {selectedImageWidth}%</span>
          <input
            type="range"
            min={10}
            max={100}
            value={selectedImageWidth}
            onChange={(e) => {
              const value = Number(e.target.value);
              setSelectedImageWidth(value);
              editor
                ?.chain()
                .focus()
                .updateAttributes('image', { width: `${value}%`, style: `width:${value}%;height:auto;` })
                .run();
            }}
          />
          <button
            type="button"
            onClick={() => {
              setSelectedImageWidth(100);
              editor?.chain().focus().updateAttributes('image', { width: '100%', style: 'width:100%;height:auto;' }).run();
            }}
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedImageWidth(50);
              editor?.chain().focus().updateAttributes('image', { width: '50%', style: 'width:50%;height:auto;' }).run();
            }}
          >
            50%
          </button>
        </div>
      )}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
};

export default TiptapEditor;
