// features/Docs/components/ArticleEditor.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LargeModal } from '../../../utils/CustomModal';
import { Stack, TextInput, Textarea, Select, MultiSelect, Switch, Button, Group, Paper, Text, Alert, Loader, ThemeIcon, Grid, ActionIcon, Box } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPicker } from '../../../components/IconPicker';
import * as TablerIcons from '@tabler/icons-react';
import TiptapEditor from '../../../utils/editor';
import { getArticleBySlug, createArticle, updateArticle, getArticleAttachments, deleteAttachment, KnowledgeAttachment, getCategories } from '../data/DocsData';
import { notificationSystem } from '../../../utils/Push';
import { IconFileText, IconTrash, IconUpload } from '@tabler/icons-react';
import { API } from '../../../config/constants';
import { decodeRussianFileName } from '../../../utils/format';
import useAuthFetch from '../../../hooks/useAuthFetch';

export default function ArticleEditor() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<any>(null);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [content, setContent] = useState('');
  const [iconPickerOpened, setIconPickerOpened] = useState(false);
  const [attachments, setAttachments] = useState<KnowledgeAttachment[]>([]);
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; tempSrc: string }>>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const authFetch = useAuthFetch();

  const form = useForm({
    initialValues: {
      title: '',
      icon: '',
      excerpt: '',
      categoryId: null as string | null,
      tags: [] as string[],
      isPublished: true,
      changeNote: '',
    },
    validate: {
      title: (value: string) => (!value?.trim() ? 'Заголовок обязателен' : null),
    },
  });

  // Загрузка категорий
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await getCategories();
        const flattenCategories = (cats: any[], level = 0): Array<{ value: string; label: string }> => {
          const result: Array<{ value: string; label: string }> = [];
          cats.forEach(cat => {
            result.push({
              value: cat.id,
              label: '  '.repeat(level) + cat.name,
            });
            if (cat.children && cat.children.length > 0) {
              result.push(...flattenCategories(cat.children, level + 1));
            }
          });
          return result;
        };
        setCategories(flattenCategories(data));
      } catch (err) {
        console.error('Ошибка при загрузке категорий:', err);
      }
    };
    loadCategories();
  }, []);

  // Загрузка статьи для редактирования
  useEffect(() => {
    if (!slug || slug === 'new') {
      form.reset();
      setContent('');
      setArticle(null);
      return;
    }

    const loadArticle = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getArticleBySlug(slug);
        setArticle(data);
        setContent(data.content || '');
        form.setValues({
          title: data.title || '',
          icon: data.icon || '',
          excerpt: data.excerpt || '',
          categoryId: data.categoryId || data.category?.id || null,
          tags: data.tags || [],
          isPublished: data.isPublished ?? true,
          changeNote: '',
        });
        // Загружаем вложения (только не-изображения, изображения уже в тексте статьи)
        if (data.id) {
          try {
            const atts = await getArticleAttachments(data.id);
            // Фильтруем: показываем только файлы, которые не являются изображениями
            const nonImageAttachments = atts.filter(att => !att.mimeType?.startsWith('image/'));
            setAttachments(nonImageAttachments);
          } catch (err) {
            console.error('Ошибка при загрузке вложений:', err);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка при загрузке статьи');
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [slug]);

  const handleSubmit = async (values: typeof form.values) => {
    if (!values.title?.trim() || !content.trim()) {
      setError('Заголовок и содержимое обязательны');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      let articleId = article?.id;
      const data = {
        title: values.title.trim(),
        content: content.trim(),
        excerpt: values.excerpt?.trim() || undefined,
        icon: values.icon?.trim() || undefined,
        categoryId: values.categoryId === 'null' || values.categoryId === null || values.categoryId === '' ? undefined : values.categoryId,
        tags: values.tags || [],
        isPublished: values.isPublished ?? true,
        ...(slug && slug !== 'new' && values.changeNote ? { changeNote: values.changeNote.trim() } : {}),
      };

      // Сохраняем/создаем статью (первичный вызов, без загруженных файлов)
      if (slug && slug !== 'new' && articleId) {
        await updateArticle(articleId, data);
      } else {
        const created = await createArticle(data);
        articleId = created?.id || created?.article?.id || created?.data?.id || created?.articleId;
      }

      if (!articleId) {
        throw new Error('Не удалось получить ID статьи для загрузки файлов');
      }

      // Загрузка отложенных изображений: меняем временные src на серверные
      let updatedContent = content;
      if (pendingImages.length > 0) {
        for (const item of pendingImages) {
          const formData = new FormData();
          formData.append('file', item.file);
          formData.append('articleId', articleId);

          const response = await authFetch(`${API}/docs/articles/attachments`, {
            method: 'POST',
            body: formData,
          });

          if (!response || !response.ok) {
            const error = await response?.json().catch(() => ({ error: 'Ошибка при загрузке файла' }));
            throw new Error(error.error || 'Ошибка при загрузке изображения');
          }

          const attachment: KnowledgeAttachment = await response.json();
          const fileUrl = `${API}${attachment.fileUrl}`;
          // Заменяем временный src в контенте на реальный
          updatedContent = updatedContent.replaceAll(item.tempSrc, fileUrl);
        }
        // Сбрасываем очередь изображений
        setPendingImages([]);
      }

      // Загрузка отложенных вложений (не изображения)
      if (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('articleId', articleId);

          const response = await authFetch(`${API}/docs/articles/attachments`, {
            method: 'POST',
            body: formData,
          });

          if (!response || !response.ok) {
            const error = await response?.json().catch(() => ({ error: 'Ошибка при загрузке файла' }));
            throw new Error(error.error || 'Ошибка при загрузке вложения');
          }
        }
        setPendingFiles([]);
      }

      // Если контент изменился из-за замены src — обновляем статью
      if (updatedContent !== content) {
        await updateArticle(articleId, { ...data, content: updatedContent });
      }

      notificationSystem.addNotification(
        slug && slug !== 'new' ? 'Статья обновлена' : 'Статья создана',
        'Статья успешно сохранена',
        'success'
      );

      navigate('/docs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении статьи');
      setLoading(false);
    }
  };

  // Функция для загрузки изображений через toolbar редактора (отложенная)
  const handleFileUpload = async (file: File): Promise<string> => {
    // Вставляем временный объект-URL и добавляем файл в очередь
    const tempSrc = URL.createObjectURL(file);
    setPendingImages(prev => [...prev, { file, tempSrc }]);
    return tempSrc;
  };

  // Функция для добавления вложений (не изображений) в очередь
  const handleAttachmentUpload = async (file: File) => {
    // Проверяем, что это не изображение
    if (file.type.startsWith('image/')) {
      notificationSystem.addNotification('Информация', 'Для изображений используйте кнопку в редакторе', 'info');
      return;
    }
    setPendingFiles(prev => [...prev, file]);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Удалить этот файл?')) return;

    try {
      await deleteAttachment(attachmentId);
      setAttachments(prev => prev.filter(att => att.id !== attachmentId));
      notificationSystem.addNotification('Файл удален', 'Файл успешно удален', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Не удалось удалить файл', 'error');
    }
  };

  return (
    <LargeModal
      opened={true}
      onClose={() => navigate('/docs')}
      title={slug && slug !== 'new' ? 'Редактировать статью' : 'Создать статью'}
      icon={<IconFileText size={20} />}
    >
      <form onSubmit={form.onSubmit(handleSubmit)} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && (
            <Alert color="red" title="Ошибка">
              {error}
            </Alert>
          )}

          {loading && !article && (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}

          {(!loading || article) && (
            <Box style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', height: '100%' }}>
              <Grid gutter="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', height: '100%' }}>
                {/* Левая колонка: Поля формы - статическая */}
                <Grid.Col span={{ base: 12, md: 3.6 }} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                  <Box style={{ position: 'sticky', top: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                    <Stack gap="md">
                      <TextInput
                        label="Заголовок"
                        placeholder="Введите заголовок статьи"
                        required
                        {...form.getInputProps('title')}
                      />

                      <div>
                        <Text size="sm" fw={500} mb="xs">
                          Иконка
                        </Text>
                        <Group gap="xs" align="flex-end">
                          {form.values.icon && (() => {
                            const IconComponent = TablerIcons[form.values.icon as keyof typeof TablerIcons] as React.ComponentType<{ size?: number; stroke?: number }> | undefined;
                            return IconComponent ? (
                              <ThemeIcon size="lg" variant="light" color="blue">
                                <IconComponent size={24} stroke={1.5} />
                              </ThemeIcon>
                            ) : null;
                          })()}
                          <Button
                            variant="light"
                            onClick={() => setIconPickerOpened(true)}
                            style={{ flex: 1 }}
                          >
                            {form.values.icon ? 'Изменить иконку' : 'Выбрать иконку'}
                          </Button>
                        </Group>
                        <IconPicker
                          opened={iconPickerOpened}
                          onClose={() => setIconPickerOpened(false)}
                          onSelect={(iconName) => {
                            form.setFieldValue('icon', iconName);
                            setIconPickerOpened(false);
                          }}
                          currentIcon={form.values.icon}
                        />
                      </div>

                      <Textarea
                        label="Краткое описание"
                        placeholder="Краткое описание статьи (необязательно)"
                        rows={3}
                        {...form.getInputProps('excerpt')}
                      />

                      <Select
                        label="Категория"
                        placeholder="Выберите категорию"
                        data={categories}
                        searchable
                        clearable
                        {...form.getInputProps('categoryId')}
                      />

                      <MultiSelect
                        label="Теги"
                        placeholder="Добавьте теги"
                        data={article?.tags || []}
                        searchable
                        {...form.getInputProps('tags')}
                      />

                      {slug && slug !== 'new' && (
                        <Textarea
                          label="Примечание об изменениях"
                          placeholder="Опишите, что было изменено (необязательно)"
                          rows={2}
                          {...form.getInputProps('changeNote')}
                        />
                      )}

                      <Switch
                        label="Опубликовать сразу"
                        {...form.getInputProps('isPublished', { type: 'checkbox' })}
                      />
                    </Stack>
                  </Box>
                </Grid.Col>

                {/* Правая колонка: Редактор - прокручиваемая */}
                <Grid.Col span={{ base: 12, md: 8.4 }} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
                  <Box style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Stack gap="md" style={{ flexShrink: 0 }}>
                      <Paper withBorder p="md" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
                        <Text size="sm" fw={500} mb="xs">
                          Содержимое статьи
                        </Text>
                        {uploadingFile && (
                          <Alert color="blue" mb="xs" icon={<Loader size={16} />}>
                            Загрузка файла...
                          </Alert>
                        )}
                        <Box style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
                          <TiptapEditor 
                            content={content} 
                            onChange={setContent}
                            onFileUpload={slug && slug !== 'new' ? handleFileUpload : undefined}
                          />
                        </Box>
                      </Paper>
                      
                      {/* Список вложений - всегда показываем, даже если пусто */}
                      <Paper withBorder p="md" style={{ flexShrink: 0 }}>
                        <Group justify="space-between" mb="xs">
                          <Text size="sm" fw={500}>
                            Вложения {(attachments.length + pendingFiles.length) > 0 && `(${attachments.length + pendingFiles.length})`}
                          </Text>
                          {true && (
                            <label>
                              <input
                                type="file"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleAttachmentUpload(file);
                                  }
                                  e.target.value = '';
                                }}
                                accept="application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z"
                              />
                              <Button
                                size="xs"
                                variant="light"
                                leftSection={<IconUpload size={14} />}
                                component="span"
                                style={{ cursor: 'pointer' }}
                              >
                                Добавить файл
                              </Button>
                            </label>
                          )}
                        </Group>
                        {attachments.length > 0 ? (
                          <Stack gap="xs">
                            {attachments.map((attachment) => (
                              <Group key={attachment.id} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: '4px' }}>
                                <Group 
                                  gap="xs" 
                                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                                  onClick={() => window.open(`${API}${attachment.fileUrl}`, '_blank')}
                                >
                                  <IconFileText size={16} />
                                  <Text size="sm" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {decodeRussianFileName(attachment.fileName)}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {(attachment.fileSize / 1024).toFixed(1)} KB
                                  </Text>
                                </Group>
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  color="red"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAttachment(attachment.id);
                                  }}
                                  title="Удалить файл"
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                            ))}
                            {pendingFiles.map((file, idx) => (
                              <Group key={`pending-${idx}`} justify="space-between" p="xs" style={{ border: '1px dashed var(--mantine-color-gray-3)', borderRadius: '4px', background: 'var(--mantine-color-gray-0)' }}>
                                <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                  <IconFileText size={16} />
                                  <Text size="sm" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.name}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {(file.size / 1024).toFixed(1)} KB • не загружено
                                  </Text>
                                </Group>
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  color="red"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  title="Убрать из очереди"
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                            ))}
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                            Нет вложений
                          </Text>
                        )}
                      </Paper>
                    </Stack>
                  </Box>
                </Grid.Col>
              </Grid>
              
              {/* Футер с кнопками сохранения - всегда видимый */}
              <Box style={{ 
                flexShrink: 0,
                padding: '16px 0', 
                background: 'var(--theme-bg-elevated)', 
                borderTop: '1px solid var(--theme-border-primary)',
                marginTop: '16px'
              }}>
                <Group justify="flex-end">
                  <Button variant="subtle" onClick={() => navigate('/docs')}>
                    Отмена
                  </Button>
                  <Button type="submit" loading={loading}>
                    {slug && slug !== 'new' ? 'Сохранить изменения' : 'Создать статью'}
                  </Button>
                </Group>
              </Box>
            </Box>
          )}
        </Stack>
      </form>
    </LargeModal>
  );
}
