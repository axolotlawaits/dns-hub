import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import '../utils/styles/editor.css';

type TiptapEditorProps = {
  content: string;
  onChange: (content: string) => void;
  telegramMode?: boolean; // Режим для Telegram (ограниченное форматирование)
};

const TiptapEditor: React.FC<TiptapEditorProps> = ({ content, onChange, telegramMode = false }) => {
  const editor = useEditor({
    extensions: telegramMode ? [
      // Только расширения, поддерживаемые Telegram
      StarterKit.configure({
        heading: false, // Отключаем заголовки
        bulletList: false, // Отключаем списки
        orderedList: false, // Отключаем нумерованные списки
        blockquote: false, // Отключаем цитаты
        horizontalRule: false, // Отключаем горизонтальные линии
      }),
      Underline,
      Strike,
      Code,
      CodeBlock,
      Link.configure({
        openOnClick: false,
      }),
    ] : [
      // Полный набор расширений
      StarterKit,
      Image,
      Underline,
      Strike,
      Code,
      CodeBlock,
      Link.configure({
        openOnClick: false,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
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
    const url = window.prompt('Enter the URL of the image:');
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

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
    { name: 'Bold', action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold') },
    { name: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic') },
    { name: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline') },
    { name: 'Strike', action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike') },
    { name: 'Code', action: () => editor.chain().focus().toggleCode().run(), isActive: editor.isActive('code') },
    { name: 'Code Block', action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock') },
    { name: 'Link', action: setLink, isActive: editor.isActive('link') },
  ] : [
    // Полный набор кнопок
    { name: 'Bold', action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold') },
    { name: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic') },
    { name: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline') },
    { name: 'Strike', action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike') },
    { name: 'H2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: editor.isActive('heading', { level: 2 }) },
    { name: 'List', action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList') },
    { name: 'Code', action: () => editor.chain().focus().toggleCode().run(), isActive: editor.isActive('code') },
    { name: 'Code Block', action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock') },
    { name: 'Image', action: setImage },
    { name: 'Link', action: setLink, isActive: editor.isActive('link') },
  ];

  return (
    <div className="tiptap-editor">
      <div className="menu-bar">
        {buttons.map((button) => (
          <button
            key={button.name}
            type="button"
            onClick={button.action}
            className={button.isActive ? 'is-active' : ''}
          >
            {button.name}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
};

export default TiptapEditor;
