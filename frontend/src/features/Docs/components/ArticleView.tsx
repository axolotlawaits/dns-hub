// features/Docs/components/ArticleView.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Title, Text, Group, Badge, Loader, Alert, Button, Paper, Divider, ActionIcon, Grid } from '@mantine/core';
import { IconArrowLeft, IconEdit, IconStar, IconStarFilled, IconEye, IconMessage, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { getArticleBySlug, KnowledgeArticle, addToFavorites, removeFromFavorites, getArticles, getArticleComments, createComment, updateComment, deleteComment } from '../data/DocsData';
import Comment from '../../../utils/Comment';
import { useUserContext } from '../../../hooks/useUserContext';
import { API } from '../../../config/constants';
import { fetchWithAuth } from '../../../utils/fetchWithAuth';
import dayjs from 'dayjs';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { useDisclosure } from '@mantine/hooks';
import './ArticleView.css';

export default function ArticleView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useUserContext();
  const [article, setArticle] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [previousArticle, setPreviousArticle] = useState<KnowledgeArticle | null>(null);
  const [nextArticle, setNextArticle] = useState<KnowledgeArticle | null>(null);
  const [filePreviewOpened, { open: openFilePreview, close: closeFilePreview }] = useDisclosure(false);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [imagePreviewAttachments, setImagePreviewAttachments] = useState<Array<{ id: string; source: string; name?: string; mimeType?: string }>>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Функция для обработки HTML и добавления оберток для блоков кода
  const processContentWithCodeBlocks = (html: string): string => {
    if (!html) return html;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const preElements = doc.querySelectorAll('pre');
    
    if (preElements.length === 0) return html;
    
    preElements.forEach((pre) => {
      // Проверяем, не обработан ли уже этот блок
      if (pre.closest('.code-block-wrapper')) {
        return;
      }
      
      // Извлекаем язык
      let language = 'plaintext';
      const preDataLang = pre.getAttribute('data-language');
      if (preDataLang) {
        language = preDataLang;
      } else {
        const preClassMatch = pre.className.match(/(?:hljs-)?language-(\w+)/i);
        if (preClassMatch) {
          language = preClassMatch[1];
        } else {
          const codeElement = pre.querySelector('code');
          if (codeElement) {
            const codeDataLang = codeElement.getAttribute('data-language');
            if (codeDataLang) {
              language = codeDataLang;
            } else {
              const codeClassMatch = codeElement.className.match(/(?:hljs\s+)?language-(\w+)/i);
              if (codeClassMatch) {
                language = codeClassMatch[1];
              } else {
                const allClasses = codeElement.className.split(/\s+/);
                for (const cls of allClasses) {
                  if (cls.startsWith('language-')) {
                    language = cls.replace('language-', '');
                    break;
                  }
                }
              }
            }
          }
        }
      }
      
      // Маппинг языков
      const languageMap: Record<string, string> = {
        'javascript': 'JavaScript', 'typescript': 'TypeScript', 'js': 'JavaScript', 'ts': 'TypeScript',
        'python': 'Python', 'py': 'Python', 'java': 'Java', 'cpp': 'C++', 'c': 'C',
        'csharp': 'C#', 'cs': 'C#', 'php': 'PHP', 'ruby': 'Ruby', 'go': 'Go', 'rust': 'Rust',
        'swift': 'Swift', 'kotlin': 'Kotlin', 'scala': 'Scala', 'html': 'HTML', 'css': 'CSS',
        'scss': 'SCSS', 'sass': 'SASS', 'less': 'Less', 'json': 'JSON', 'xml': 'XML', 'sql': 'SQL',
        'bash': 'Bash', 'shell': 'Shell', 'sh': 'Shell', 'powershell': 'PowerShell', 'ps1': 'PowerShell',
        'yaml': 'YAML', 'yml': 'YAML', 'markdown': 'Markdown', 'md': 'Markdown',
        'dockerfile': 'Dockerfile', 'plaintext': 'Код', 'text': 'Код',
      };
      
      const displayLanguage = languageMap[language.toLowerCase()] || language.toUpperCase();
      const codeText = pre.textContent || '';
      
      // Создаем обертку
      const wrapper = doc.createElement('div');
      wrapper.className = 'code-block-wrapper';
      
      // Создаем заголовок
      const header = doc.createElement('div');
      header.className = 'code-block-header';
      
      const languageLabel = doc.createElement('span');
      languageLabel.className = 'code-language-label';
      languageLabel.textContent = displayLanguage;
      
      const copyButton = doc.createElement('button');
      copyButton.className = 'code-copy-button';
      copyButton.type = 'button';
      copyButton.setAttribute('aria-label', 'Копировать код');
      copyButton.setAttribute('data-code', codeText.replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
      copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      
      header.appendChild(languageLabel);
      header.appendChild(copyButton);
      
      // Клонируем pre и обновляем стили
      const preClone = pre.cloneNode(true) as HTMLElement;
      preClone.style.marginTop = '0';
      preClone.style.borderRadius = '0';
      preClone.style.border = 'none';
      
      wrapper.appendChild(header);
      wrapper.appendChild(preClone);
      
      // Заменяем pre на обертку
      pre.parentNode?.replaceChild(wrapper, pre);
    });
    
    return doc.body.innerHTML;
  };

  useEffect(() => {
    if (!slug) return;

    const loadArticle = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getArticleBySlug(slug);
        
        // Обрабатываем контент для добавления оберток блоков кода
        if (data.content) {
          data.content = processContentWithCodeBlocks(data.content);
        }
        
        setArticle(data);
        
        // Извлекаем изображения из контента для предпросмотра
        if (data.content) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(data.content, 'text/html');
          const images = Array.from(doc.querySelectorAll('img'));
          const imageAttachments = images.map((img, index) => ({
            id: `img-${index}`,
            source: img.getAttribute('src') || '',
            name: img.getAttribute('alt') || `Изображение ${index + 1}`,
            mimeType: 'image/jpeg', // По умолчанию, можно определить по расширению
          }));
          setImagePreviewAttachments(imageAttachments);
        }
        
        // Проверяем, в избранном ли статья
        if (user?.id) {
          try {
            const favoritesResponse = await fetchWithAuth(`${API}/docs/favorites`);
            if (favoritesResponse && favoritesResponse.ok) {
              const favorites = await favoritesResponse.json();
              setIsFavorite(favorites.some((fav: KnowledgeArticle) => fav.id === data.id));
            }
          } catch (err) {
            console.error('Ошибка при проверке избранного:', err);
          }
        }

        // Загружаем предыдущую и следующую статью в категории
        if (data.categoryId) {
          await loadNavigationArticles(data.categoryId, data.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка при загрузке статьи');
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [slug, user?.id]);


  const loadNavigationArticles = async (categoryId: string, currentArticleId: string) => {
    try {
      // Получаем все статьи в категории, отсортированные по дате создания (новые сначала)
      const { articles } = await getArticles(categoryId, undefined, undefined, false, 1000, 0);
      
      // Сортируем статьи: сначала закрепленные, потом по дате создания (новые сначала)
      const sortedArticles = [...articles].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // Находим индекс текущей статьи
      const currentIndex = sortedArticles.findIndex(art => art.id === currentArticleId);
      
      if (currentIndex !== -1) {
        // Предыдущая статья (следующая в списке, так как новые первые)
        setPreviousArticle(currentIndex < sortedArticles.length - 1 ? sortedArticles[currentIndex + 1] : null);
        // Следующая статья (предыдущая в списке)
        setNextArticle(currentIndex > 0 ? sortedArticles[currentIndex - 1] : null);
      } else {
        setPreviousArticle(null);
        setNextArticle(null);
      }
    } catch (err) {
      console.error('Ошибка при загрузке навигационных статей:', err);
      setPreviousArticle(null);
      setNextArticle(null);
    } finally {
      // Navigation loading removed
    }
  };

  // Функции для работы с комментариями через универсальный компонент
  const fetchDocsComments = async (articleId: string, page?: number, limit?: number) => {
    const result = await getArticleComments(articleId, page || 1, limit || 20);
    // Преобразуем KnowledgeComment[] в Comment[] формат
    return {
      comments: result.comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        articleId: comment.articleId,
        userId: comment.userId,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user: comment.user,
        replies: comment.replies?.map(reply => ({
          id: reply.id,
          content: reply.content,
          articleId: reply.articleId,
          userId: reply.userId,
          parentId: reply.parentId,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          user: reply.user,
        })) || [],
      })),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    };
  };

  const createDocsComment = async (articleId: string, content: string) => {
    return await createComment(articleId, content);
  };

  const updateDocsComment = async (commentId: string, content: string) => {
    return await updateComment(commentId, content);
  };

  const deleteDocsComment = async (commentId: string) => {
    return await deleteComment(commentId);
  };

  const handleToggleFavorite = async () => {
    if (!article || !user) return;

    try {
      setFavoriteLoading(true);
      if (isFavorite) {
        await removeFromFavorites(article.id);
        setIsFavorite(false);
      } else {
        await addToFavorites(article.id);
        setIsFavorite(true);
      }
    } catch (err) {
      console.error('Ошибка при изменении избранного:', err);
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (loading) {
    return (
      <Container size="fluid" py="xl" style={{ maxWidth: '95%' }}>
        <Loader size="lg" />
      </Container>
    );
  }

  if (error || !article) {
    return (
      <Container size="fluid" py="xl" style={{ maxWidth: '95%' }}>
        <Alert color="red" title="Ошибка">
          {error || 'Статья не найдена'}
        </Alert>
        <Button mt="md" onClick={() => navigate('/docs')}>
          Вернуться к списку
        </Button>
      </Container>
    );
  }

  return (
    <Container size="fluid" py="md" style={{ maxWidth: '95%' }}>
      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        onClick={() => navigate('/docs')}
        mb="md"
      >
        Назад к списку
      </Button>

      <Grid gutter="lg">
        {/* Основной контент статьи */}
        <Grid.Col span={{ base: 12, md: 8.4 }}>
          <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={1}>{article.title}</Title>
          <Group>
            {user && (
              <ActionIcon
                variant="light"
                color={isFavorite ? 'yellow' : 'gray'}
                onClick={handleToggleFavorite}
                loading={favoriteLoading}
                size="lg"
              >
                {isFavorite ? <IconStarFilled size={20} /> : <IconStar size={20} />}
              </ActionIcon>
            )}
            {(user?.id === article.authorId || user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && (
              <Button
                variant="light"
                leftSection={<IconEdit size={16} />}
                onClick={() => navigate(`/docs/articles/${article.slug}/edit`)}
              >
                Редактировать
              </Button>
            )}
          </Group>
        </Group>

        <Group gap="md" mb="md">
          {article.category && (
            <Badge color={article.category.color || 'blue'} variant="light" size="lg">
              {article.category.name}
            </Badge>
          )}
          {article.tags && article.tags.length > 0 && (
            <>
              {article.tags.map((tag) => (
                <Badge key={tag} variant="dot" size="sm" color="blue">
                  {tag}
                </Badge>
              ))}
            </>
          )}
        </Group>

        <Divider mb="md" />

        <Group gap="lg" mb="xl" c="dimmed">
          <Group gap={4}>
            <IconEye size={16} />
            <Text size="sm">{article.viewCount}</Text>
          </Group>
          {article._count?.comments && (
            <Group gap={4}>
              <IconMessage size={16} />
              <Text size="sm">{article._count.comments}</Text>
            </Group>
          )}
          <Text size="sm">
            Автор: {article.author.name}
          </Text>
          <Text size="sm">
            {dayjs(article.createdAt).format('DD.MM.YYYY HH:mm')}
          </Text>
          {article.updatedAt !== article.createdAt && (
            <Text size="sm">
              Обновлено: {dayjs(article.updatedAt).format('DD.MM.YYYY HH:mm')}
            </Text>
          )}
        </Group>

        <div
          ref={contentRef}
          dangerouslySetInnerHTML={{ __html: article.content }}
          className="article-content"
          style={{
            lineHeight: 1.6,
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            
            // Обрабатываем клики по кнопке копирования
            const copyButton = target.closest('.code-copy-button') as HTMLButtonElement;
            if (copyButton) {
              e.stopPropagation();
              const codeText = copyButton.getAttribute('data-code') || 
                               copyButton.closest('.code-block-wrapper')?.querySelector('pre')?.textContent || '';
              
              navigator.clipboard.writeText(codeText).then(() => {
                copyButton.classList.add('copied');
                const originalHTML = copyButton.innerHTML;
                copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                setTimeout(() => {
                  copyButton.classList.remove('copied');
                  copyButton.innerHTML = originalHTML;
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy code:', err);
              });
              return;
            }
            
            // Обрабатываем клики по изображениям в контенте
            if (target.tagName === 'IMG') {
              const imgSrc = (target as HTMLImageElement).src;
              const index = imagePreviewAttachments.findIndex(att => {
                const attSrc = att.source.startsWith('http') ? att.source : `${API}${att.source.startsWith('/') ? '' : '/'}${att.source}`;
                return attSrc === imgSrc || imgSrc.includes(att.source.split('/').pop() || '');
              });
              if (index >= 0) {
                setPreviewFileIndex(index);
                openFilePreview();
              }
            }
          }}
          onMouseOver={(e) => {
            // Добавляем курсор pointer для изображений
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG') {
              target.style.cursor = 'pointer';
            }
          }}
        />

        {article.attachments && article.attachments.length > 0 && (
          <>
            <Divider my="xl" />
            <Title order={3} mb="md">Прикрепленные файлы</Title>
            <Group>
              {article.attachments.map((attachment, index) => (
                <Button
                  key={attachment.id}
                  variant="light"
                  onClick={() => {
                    setPreviewFileIndex(index);
                    openFilePreview();
                  }}
                >
                  {attachment.fileName}
                </Button>
              ))}
            </Group>
          </>
        )}

        {/* Навигация по статьям в категории */}
        {(previousArticle || nextArticle) && (
          <>
            <Divider my="xl" />
            <Group justify="space-between" gap="md" wrap="wrap">
              {previousArticle ? (
                <Button
                  variant="light"
                  leftSection={<IconChevronLeft size={18} />}
                  onClick={() => navigate(`/docs/articles/${previousArticle.slug}`)}
                  style={{ flex: 1, minWidth: 200 }}
                  size="md"
                >
                  <div style={{ textAlign: 'left', width: '100%' }}>
                    <Text size="xs" c="dimmed" style={{ display: 'block' }}>Предыдущая статья</Text>
                    <Text size="sm" fw={500} lineClamp={1} style={{ maxWidth: '100%' }}>
                      {previousArticle.title}
                    </Text>
                  </div>
                </Button>
              ) : (
                <div style={{ flex: 1, minWidth: 200 }} />
              )}
              
              {nextArticle ? (
                <Button
                  variant="light"
                  rightSection={<IconChevronRight size={18} />}
                  onClick={() => navigate(`/docs/articles/${nextArticle.slug}`)}
                  style={{ flex: 1, minWidth: 200 }}
                  size="md"
                >
                  <div style={{ textAlign: 'right', width: '100%' }}>
                    <Text size="xs" c="dimmed" style={{ display: 'block' }}>Следующая статья</Text>
                    <Text size="sm" fw={500} lineClamp={1} style={{ maxWidth: '100%' }}>
                      {nextArticle.title}
                    </Text>
                  </div>
                </Button>
              ) : (
                <div style={{ flex: 1, minWidth: 200 }} />
              )}
            </Group>
          </>
        )}
          </Paper>
        </Grid.Col>

        {/* Боковая панель с комментариями */}
        <Grid.Col span={{ base: 12, md: 3.6 }}>
          <Paper shadow="sm" p="md" radius="md" withBorder style={{ position: 'sticky', top: 80 }}>
            {article && (
              <Comment
                entityId={article.id}
                entityType="DOCS"
                fetchComments={fetchDocsComments}
                createComment={createDocsComment}
                updateComment={updateDocsComment}
                deleteComment={deleteDocsComment}
                height={400}
                width="100%"
              />
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Модальное окно предпросмотра файлов */}
      {filePreviewOpened && (
        <FilePreviewModal
          opened={filePreviewOpened}
          onClose={closeFilePreview}
          attachments={
            // Если есть вложения и кликнули на них, показываем вложения
            // Иначе показываем изображения из контента
            article?.attachments && article.attachments.length > 0 && previewFileIndex < article.attachments.length
              ? article.attachments.map((attachment) => ({
                  id: attachment.id,
                  source: attachment.fileUrl.startsWith('http') 
                    ? attachment.fileUrl 
                    : `${API}${attachment.fileUrl.startsWith('/') ? '' : '/'}${attachment.fileUrl}`,
                  name: attachment.fileName,
                  mimeType: attachment.mimeType,
                }))
              : imagePreviewAttachments.map((att) => ({
                  ...att,
                  source: att.source.startsWith('http') ? att.source : `${API}${att.source.startsWith('/') ? '' : '/'}${att.source}`,
                }))
          }
          initialIndex={previewFileIndex}
        />
      )}
    </Container>
  );
}

