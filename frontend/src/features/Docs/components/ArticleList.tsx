// features/Docs/components/ArticleList.tsx
import { useState, useEffect } from 'react';
import { Stack, Card, Text, Group, Badge, Loader, Alert, ActionIcon, SimpleGrid, ThemeIcon } from '@mantine/core';
import { IconEye, IconMessage, IconPin, IconFolder } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { getArticles, KnowledgeArticle } from '../data/DocsData';
import dayjs from 'dayjs';
import classes from '../../../components/styles/Tools.module.css';

interface ArticleListProps {
  categoryId?: string | null;
  searchQuery?: string;
  authorId?: string | null;
  favoritesOnly?: boolean;
  viewMode?: 'list' | 'grid';
}

export default function ArticleList({ 
  categoryId, 
  searchQuery, 
  authorId,
  favoritesOnly,
  viewMode: externalViewMode = 'list'
}: ArticleListProps) {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  // Используем внешний viewMode, если передан, иначе используем внутренний (для обратной совместимости)
  const viewMode = externalViewMode;

  useEffect(() => {
    const loadArticles = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getArticles(categoryId, searchQuery, authorId, favoritesOnly);
        setArticles(data.articles);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка при загрузке статей');
      } finally {
        setLoading(false);
      }
    };

    loadArticles();
  }, [categoryId, searchQuery, authorId, favoritesOnly]);

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Ошибка">
        {error}
      </Alert>
    );
  }

  if (articles.length === 0) {
    return (
      <Alert color="blue" title="Статей не найдено">
        Попробуйте изменить фильтры или создать новую статью.
      </Alert>
    );
  }

  // Функция для получения иконки статьи (приоритет: иконка статьи -> иконка категории -> дефолтная)
  const getArticleIcon = (article: KnowledgeArticle) => {
    // Сначала проверяем иконку статьи
    if (article.icon) {
      const IconComponent = TablerIcons[article.icon as keyof typeof TablerIcons] as 
        React.ComponentType<{ size?: number; stroke?: number; color?: string }> | undefined;
      if (IconComponent) {
        return IconComponent;
      }
    }
    
    // Если у статьи нет иконки, используем иконку категории
    if (article.category?.icon) {
      const IconComponent = TablerIcons[article.category.icon as keyof typeof TablerIcons] as 
        React.ComponentType<{ size?: number; stroke?: number; color?: string }> | undefined;
      if (IconComponent) {
        return IconComponent;
      }
    }
    
    // Дефолтная иконка
    return IconFolder;
  };

  const renderArticleCard = (article: KnowledgeArticle, compact: boolean = false) => {
    const ArticleIcon = getArticleIcon(article);
    const categoryColor = article.category?.color || 'blue';

    // Формат карточек (grid) - стиль как в Tools.tsx
    if (compact) {
      return (
        <Card
          key={article.id}
          shadow="sm"
          radius="lg"
          className={classes.card}
          padding="lg"
          style={{ cursor: 'pointer', height: '100%', position: 'relative' }}
          onClick={() => navigate(`/docs/articles/${article.slug}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              navigate(`/docs/articles/${article.slug}`);
            }
          }}
          tabIndex={0}
        >
          <div className={classes.cardContent}>
            <Group justify="space-between" align="flex-start" mb="sm">
              <ThemeIcon 
                size="xl" 
                color={categoryColor} 
                variant="light"
                className={classes.toolIcon}
              >
                <ArticleIcon size={32} stroke={1.5} />
              </ThemeIcon>
              <Group gap="xs">
                {article.isPinned && (
                  <Badge size="sm" color="yellow" variant="light" leftSection={<IconPin size={12} />}>
                    Закреплено
                  </Badge>
                )}
                {article.category && (
                  <Badge size="sm" color={categoryColor} variant="light">
                    {article.category.name}
                  </Badge>
                )}
              </Group>
            </Group>
            
            <Text fz="lg" fw={600} mb="xs" className={classes.toolName} lineClamp={2}>
              {article.title}
            </Text>
            
            {article.excerpt && (
              <Text fz="sm" c="dimmed" lineClamp={3} className={classes.toolDescription}>
                {article.excerpt}
              </Text>
            )}
            
            {article.tags && article.tags.length > 0 && (
              <Group gap="xs" mt="sm">
                {article.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} size="xs" variant="outline" color="gray">
                    {tag}
                  </Badge>
                ))}
                {article.tags.length > 3 && (
                  <Badge size="xs" variant="outline" color="gray">
                    +{article.tags.length - 3}
                  </Badge>
                )}
              </Group>
            )}

            <Group justify="space-between" mt="md" wrap="nowrap">
              <Group gap="md" wrap="wrap">
                <Text size="xs" c="dimmed">
                  {article.author.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {dayjs(article.createdAt).format('DD.MM.YYYY')}
                </Text>
              </Group>
              <Group gap="lg" wrap="nowrap">
                <Group gap={4}>
                  <IconEye size={14} />
                  <Text size="xs" c="dimmed">
                    {article.viewCount}
                  </Text>
                </Group>
                {article._count?.comments && (
                  <Group gap={4}>
                    <IconMessage size={14} />
                    <Text size="xs" c="dimmed">
                      {article._count.comments}
                    </Text>
                  </Group>
                )}
              </Group>
            </Group>
          </div>
        </Card>
      );
    }

    // Формат списка (list) - добавляем иконку категории слева
    return (
      <Card
        key={article.id}
        shadow="sm"
        padding="lg"
        radius="md"
        withBorder
        style={{ cursor: 'pointer' }}
        onClick={() => navigate(`/docs/articles/${article.slug}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            navigate(`/docs/articles/${article.slug}`);
          }
        }}
        tabIndex={0}
      >
        <Group gap="md" align="flex-start" wrap="nowrap">
          {/* Иконка статьи слева */}
          <ThemeIcon 
            size="lg" 
            color={categoryColor} 
            variant="light"
            style={{ flexShrink: 0 }}
          >
            <ArticleIcon size={24} stroke={1.5} />
          </ThemeIcon>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Group justify="space-between" mb="xs" wrap="nowrap">
              <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                {article.isPinned && (
                  <ActionIcon variant="subtle" color="yellow" size="sm">
                    <IconPin size={16} />
                  </ActionIcon>
                )}
                <Text fw={500} size="lg" style={{ flex: 1 }}>
                  {article.title}
                </Text>
              </Group>
              {article.category && (
                <Badge color={categoryColor} variant="light" size="md">
                  {article.category.name}
                </Badge>
              )}
            </Group>

            {article.excerpt && (
              <Text size="sm" c="dimmed" mb="xs" lineClamp={2}>
                {article.excerpt}
              </Text>
            )}

            {article.tags && article.tags.length > 0 && (
              <Group gap="xs" mt="md" wrap="wrap">
                {article.tags.map((tag) => (
                  <Badge key={tag} size="sm" variant="dot" color="blue">
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}

            <Group justify="space-between" mt="md" wrap="nowrap">
              <Group gap="md" wrap="wrap">
                <Text size="xs" c="dimmed">
                  {article.author.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {dayjs(article.createdAt).format('DD.MM.YYYY')}
                </Text>
              </Group>
              <Group gap="lg" wrap="nowrap">
                <Group gap={4}>
                  <IconEye size={16} />
                  <Text size="xs" c="dimmed">
                    {article.viewCount}
                  </Text>
                </Group>
                {article._count?.comments && (
                  <Group gap={4}>
                    <IconMessage size={16} />
                    <Text size="xs" c="dimmed">
                      {article._count.comments}
                    </Text>
                  </Group>
                )}
              </Group>
            </Group>
          </div>
        </Group>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      {/* Отображение статей */}
      {viewMode === 'list' ? (
        <Stack gap="md">
          {articles.map((article) => renderArticleCard(article, false))}
        </Stack>
      ) : (
        <SimpleGrid
          cols={{ base: 1, sm: 2, md: 3, lg: 3 }}
          spacing="md"
        >
          {articles.map((article) => renderArticleCard(article, true))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

