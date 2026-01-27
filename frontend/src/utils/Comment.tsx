import { useState, useEffect, useRef, useCallback } from 'react';
import { Stack, ScrollArea, Textarea, Group, ActionIcon, Paper, Avatar, Text, Title, Button, Box, Loader } from '@mantine/core';
import { IconMessage, IconEdit, IconTrash, IconArrowBackUp, IconQuote, IconX } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';
import { useTheme } from '../contexts/ThemeContext';
import { notificationSystem } from './Push';
import dayjs from 'dayjs';

// Унифицированный интерфейс комментария с единым полем content
export interface Comment {
  id: string;
  content: string; // Единое поле для текста комментария
  articleId?: string;
  entityId?: string;
  userId?: string;
  senderId?: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  sender?: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  replies?: Comment[];
}

interface CommentProps {
  entityId: string;
  entityType: 'SHOP' | 'DOCS' | 'TRAINING_MANAGER' | 'TRAINING_PROGRAM';
  onCommentsChange?: (count: number) => void;
  fetchComments: (id: string, page?: number, limit?: number) => Promise<{ comments: Comment[]; total: number; page: number; totalPages: number }>;
  createComment: (id: string, content: string, parentId?: string | null) => Promise<Comment>;
  updateComment?: (commentId: string, content: string) => Promise<Comment>;
  deleteComment?: (commentId: string) => Promise<void>;
  height?: number | string;
  width?: number | string;
  pageSize?: number; // Размер страницы для пагинации
}

export default function Comment({
  entityId,
  entityType: _entityType,
  onCommentsChange,
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
  height = 400,
  width,
  pageSize = 20
}: CommentProps) {
  const { user } = useUserContext();
  const { isDark } = useTheme();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyingToComment, setReplyingToComment] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Кэш комментариев по entityId
  const commentsCacheRef = useRef<Map<string, { comments: Comment[]; total: number; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 минут

  useEffect(() => {
    if (entityId) {
      setCurrentPage(1);
      loadComments(1);
    }
  }, [entityId]);

  // Нормализация комментариев из API (конвертация content/text/message в единое поле content)
  const normalizeComment = useCallback((comment: any): Comment => {
    const content = comment.content || comment.text || comment.message || '';
    return {
      ...comment,
      content
    };
  }, []);

  const loadComments = async (page: number = 1, append: boolean = false) => {
    try {
      setCommentLoading(!append);
      setLoadingMore(append);
      
      // Проверяем кэш
      const cacheKey = `${entityId}_${page}`;
      const cached = commentsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        const normalizedComments = cached.comments.map(normalizeComment);
        if (append) {
          setComments(prev => [...prev, ...normalizedComments]);
        } else {
          setComments(normalizedComments);
        }
        setTotalComments(cached.total);
        setTotalPages(Math.ceil(cached.total / pageSize));
        onCommentsChange?.(cached.total);
        return;
      }

      const result = await fetchComments(entityId, page, pageSize);
      const normalizedComments = result.comments.map(normalizeComment);
      
      // Сохраняем в кэш
      commentsCacheRef.current.set(cacheKey, {
        comments: result.comments,
        total: result.total,
        timestamp: Date.now()
      });
      
      if (append) {
        setComments(prev => [...prev, ...normalizedComments]);
      } else {
        setComments(normalizedComments);
      }
      setTotalComments(result.total);
      setTotalPages(result.totalPages || Math.ceil(result.total / pageSize));
      onCommentsChange?.(result.total);
    } catch (err) {
      console.error('Ошибка при загрузке комментариев:', err);
    } finally {
      setCommentLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;

    try {
      setCommentLoading(true);
      const newComment = await createComment(entityId, commentText.trim());
      const normalizedComment = normalizeComment(newComment);
      
      // Добавляем новый комментарий локально без перезагрузки всех
      setComments(prev => [normalizedComment, ...prev]);
      setTotalComments(prev => prev + 1);
      setCommentText('');
      
      // Очищаем кэш для первой страницы
      commentsCacheRef.current.delete(`${entityId}_1`);
      
      notificationSystem.addNotification('Успешно', 'Комментарий добавлен', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Не удалось добавить комментарий', 'error');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || !replyingToComment) return;

    try {
      setCommentLoading(true);
      // Формируем текст с цитатой
      const quotedUserName = getCommentUser(replyingToComment)?.name || 'Неизвестный';
      const quotedContent = getCommentContent(replyingToComment);
      const fullMessage = `> ${quotedUserName}: ${quotedContent}\n\n${replyText.trim()}`;
      
      const newReply = await createComment(entityId, fullMessage, parentId);
      const normalizedReply = normalizeComment(newReply);
      
      // Добавляем ответ локально к родительскому комментарию
      setComments(prev => prev.map(comment => {
        if (comment.id === parentId) {
          return {
            ...comment,
            replies: [...(comment.replies || []), normalizedReply]
          };
        }
        // Проверяем вложенные ответы
        if (comment.replies) {
          return {
            ...comment,
            replies: comment.replies.map(reply => {
              if (reply.id === parentId) {
                return {
                  ...reply,
                  replies: [...(reply.replies || []), normalizedReply]
                };
              }
              return reply;
            })
          };
        }
        return comment;
      }));
      
      setTotalComments(prev => prev + 1);
      setReplyText('');
      setReplyingToId(null);
      setReplyingToComment(null);
      
      // Очищаем кэш
      commentsCacheRef.current.delete(`${entityId}_${currentPage}`);
      
      notificationSystem.addNotification('Успешно', 'Ответ добавлен', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Не удалось добавить ответ', 'error');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editCommentText.trim() || !updateComment) return;

    try {
      setCommentLoading(true);
      await updateComment(commentId, editCommentText.trim());
      setEditingCommentId(null);
      setEditCommentText('');
      await loadComments();
      notificationSystem.addNotification('Успешно', 'Комментарий обновлен', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Не удалось обновить комментарий', 'error');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!deleteComment) return;
    if (!confirm('Вы уверены, что хотите удалить этот комментарий?')) return;

    try {
      setCommentLoading(true);
      await deleteComment(commentId);
      await loadComments();
      notificationSystem.addNotification('Успешно', 'Комментарий удален', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Не удалось удалить комментарий', 'error');
    } finally {
      setCommentLoading(false);
    }
  };

  const getCommentContent = (comment: Comment): string => {
    return comment.content || '';
  };

  // Парсинг цитаты из текста комментария (формат: > Имя: Текст\n\n)
  const parseQuote = (text: string): { quote: { userName: string; content: string } | null; message: string } => {
    const quoteRegex = /^>\s*([^:]+):\s*(.+?)(?:\n\n|\n$)/s;
    const match = text.match(quoteRegex);
    
    if (match) {
      const userName = match[1].trim();
      const quoteContent = match[2].trim();
      const message = text.replace(quoteRegex, '').trim();
      return {
        quote: { userName, content: quoteContent },
        message
      };
    }
    
    return { quote: null, message: text };
  };

  const getCommentUser = (comment: Comment) => {
    return comment.user || comment.sender;
  };

  const getCommentUserId = (comment: Comment): string | undefined => {
    return comment.userId || comment.senderId;
  };

  const canEditComment = (comment: Comment): boolean => {
    if (!user) return false;
    const commentUserId = getCommentUserId(comment);
    return commentUserId === user.id || user.role === 'ADMIN' || user.role === 'DEVELOPER';
  };

  const renderComment = (comment: Comment) => {
    const commentUser = getCommentUser(comment);
    const userImage = commentUser?.image 
      ? `data:image/jpeg;base64,${commentUser.image}` 
      : undefined;
    const canEdit = canEditComment(comment);
    const content = getCommentContent(comment);

    return (
      <Paper key={comment.id} p="sm" withBorder>
        <Group gap="sm" align="flex-start">
          <Avatar 
            src={userImage} 
            radius="xl"
            size="sm"
          >
            {commentUser?.name?.[0] || '?'}
          </Avatar>
          <Stack gap={4} style={{ flex: 1 }}>
            <Group justify="space-between" gap="xs">
              <Text fw={500} size="sm">{commentUser?.name || 'Неизвестный'}</Text>
              <Text size="xs" c="dimmed">
                {dayjs(comment.createdAt).format('DD.MM.YYYY HH:mm')}
              </Text>
            </Group>
            {editingCommentId === comment.id ? (
              <Stack gap={4}>
                <Textarea
                  value={editCommentText}
                  onChange={(e) => setEditCommentText(e.target.value)}
                  minRows={2}
                  size="sm"
                />
                <Group gap="xs" mt={4}>
                  <Button size="xs" onClick={() => handleEditComment(comment.id)} loading={commentLoading}>
                    Сохранить
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => {
                    setEditingCommentId(null);
                    setEditCommentText('');
                  }}>
                    Отмена
                  </Button>
                </Group>
              </Stack>
            ) : (
              <>
                {/* Парсим и отображаем цитату, если она есть */}
                {(() => {
                  const { quote, message } = parseQuote(content);
                  return (
                    <>
                      {quote && (
                        <Paper
                          p="xs"
                          mb="xs"
                          style={{
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                            borderLeft: `3px solid ${isDark ? '#4dabf7' : '#339af0'}`,
                            borderRadius: '4px',
                          }}
                        >
                          <Group justify="space-between" gap="xs" mb={4}>
                            <Group gap={4}>
                              <IconQuote size={12} style={{ opacity: 0.5 }} />
                              <Text size="xs" fw={500} c="dimmed">
                                {quote.userName}
                              </Text>
                            </Group>
                          </Group>
                          <Text size="xs" lineClamp={3} style={{ opacity: 0.8 }}>
                            {quote.content}
                          </Text>
                        </Paper>
                      )}
                      {message && (
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {message}
                        </Text>
                      )}
                    </>
                  );
                })()}
                <Group gap="xs" mt={4} justify="space-between">
                  {user && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setReplyingToId(comment.id);
                        setReplyingToComment(comment);
                        setReplyText('');
                      }}
                      title="Ответить"
                    >
                      <IconArrowBackUp size={16} />
                    </ActionIcon>
                  )}
                  {canEdit && updateComment && (
                    <Group gap="xs">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="blue"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditCommentText(content);
                        }}
                        title="Редактировать"
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      {deleteComment && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => handleDeleteComment(comment.id)}
                          loading={commentLoading}
                          title="Удалить"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                  )}
                </Group>
                {/* Поле для ответа */}
                {replyingToId === comment.id && replyingToComment && (
                  <Stack gap="xs" mt="xs">
                    {/* Блок цитаты */}
                    <Box
                      p="xs"
                      style={{
                        backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                        borderLeft: `3px solid ${isDark ? '#4dabf7' : '#339af0'}`,
                      }}
                    >
                      <Group gap="xs" align="flex-start" wrap="nowrap">
                        <IconQuote 
                          size={16} 
                          style={{ 
                            color: isDark ? '#4dabf7' : '#339af0',
                            flexShrink: 0,
                            marginTop: '2px'
                          }} 
                        />
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={4} wrap="nowrap">
                            <Text size="xs" c={isDark ? '#4dabf7' : '#339af0'} style={{ flexShrink: 0 }}>
                              В ответ
                            </Text>
                            <Text size="xs" fw={500} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getCommentUser(replyingToComment)?.name || 'Неизвестный'}
                            </Text>
                          </Group>
                          <Text 
                            size="xs" 
                            style={{ 
                              opacity: 0.9,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: 1.4,
                            }}
                          >
                            {getCommentContent(replyingToComment)}
                          </Text>
                        </Stack>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => {
                            setReplyingToId(null);
                            setReplyingToComment(null);
                            setReplyText('');
                          }}
                          title="Убрать цитату"
                          color="gray"
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      </Group>
                    </Box>
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Написать ответ..."
                      minRows={3}
                      size="sm"
                    />
                    <Group gap="xs" justify="flex-end">
                      <Button size="xs" variant="subtle" onClick={() => {
                        setReplyingToId(null);
                        setReplyingToComment(null);
                        setReplyText('');
                      }}>
                        Отмена
                      </Button>
                      <Button size="xs" onClick={() => handleReply(comment.id)} loading={commentLoading}>
                        Отправить
                      </Button>
                    </Group>
                  </Stack>
                )}
              </>
            )}
            {/* Ответы на комментарии */}
            {comment.replies && comment.replies.length > 0 && (
              <Stack gap={4} mt={4} pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}>
                {comment.replies.map((reply) => {
                  const replyUser = getCommentUser(reply);
                  const replyImage = replyUser?.image 
                    ? `data:image/jpeg;base64,${replyUser.image}` 
                    : undefined;
                  const canEditReply = canEditComment(reply);
                  const replyContent = getCommentContent(reply);
                  
                  return (
                    <Paper key={reply.id} p="xs" withBorder>
                      <Group gap="xs" align="flex-start">
                        <Avatar size="xs" src={replyImage} radius="xl">
                          {replyUser?.name?.[0] || '?'}
                        </Avatar>
                        <Stack gap={4} style={{ flex: 1 }}>
                          <Group justify="space-between" gap="xs">
                            <Text fw={500} size="xs">{replyUser?.name || 'Неизвестный'}</Text>
                            <Text size="xs" c="dimmed">
                              {dayjs(reply.createdAt).format('DD.MM.YYYY HH:mm')}
                            </Text>
                          </Group>
                          {/* Парсим и отображаем цитату, если она есть */}
                          {(() => {
                            const { quote, message } = parseQuote(replyContent);
                            return (
                              <>
                                {quote && (
                                  <Paper
                                    p="xs"
                                    mb="xs"
                                    style={{
                                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                                      borderLeft: `3px solid ${isDark ? '#4dabf7' : '#339af0'}`,
                                      borderRadius: '4px',
                                    }}
                                  >
                                    <Group justify="space-between" gap="xs" mb={4}>
                                      <Group gap={4}>
                                        <IconQuote size={10} style={{ opacity: 0.5 }} />
                                        <Text size="xs" fw={500} c="dimmed">
                                          {quote.userName}
                                        </Text>
                                      </Group>
                                    </Group>
                                    <Text size="xs" lineClamp={2} style={{ opacity: 0.8 }}>
                                      {quote.content}
                                    </Text>
                                  </Paper>
                                )}
                                {message && (
                                  <Text size="xs" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                    {message}
                                  </Text>
                                )}
                              </>
                            );
                          })()}
                          <Group gap="xs" justify="space-between" mt={2}>
                            {user && (
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="gray"
                                onClick={() => {
                                  setReplyingToId(reply.id);
                                  setReplyingToComment(reply);
                                  setReplyText('');
                                }}
                                title="Ответить"
                              >
                                <IconArrowBackUp size={12} />
                              </ActionIcon>
                            )}
                            {canEditReply && deleteComment && (
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => handleDeleteComment(reply.id)}
                                loading={commentLoading}
                                title="Удалить"
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            )}
                          </Group>
                          {/* Поле для ответа на ответ */}
                          {replyingToId === reply.id && (
                            <Stack gap="xs" mt="xs">
                              <Textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Написать ответ..."
                                minRows={2}
                                size="xs"
                              />
                              <Group gap="xs" justify="flex-end">
                                <Button size="xs" variant="subtle" onClick={() => {
                                  setReplyingToId(null);
                                  setReplyText('');
                                }}>
                                  Отмена
                                </Button>
                                <Button size="xs" onClick={() => handleReply(reply.id)} loading={commentLoading}>
                                  Отправить
                                </Button>
                              </Group>
                            </Stack>
                          )}
                        </Stack>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Group>
      </Paper>
    );
  };

  const loadMoreComments = useCallback(() => {
    if (currentPage < totalPages && !loadingMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadComments(nextPage, true);
    }
  }, [currentPage, totalPages, loadingMore]);

  return (
    <Box style={width ? { width } : undefined}>
      <Stack gap="sm">
        <Title order={4} size="h5">Комментарии ({totalComments})</Title>
        
        {/* Список комментариев */}
        <ScrollArea h={height} type="auto">
          <Stack gap="sm">
            {commentLoading && comments.length === 0 ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : (
              <>
                {comments.map(renderComment)}
                {comments.length === 0 && (
                  <Text c="dimmed" ta="center" py="xl" size="sm">
                    Пока нет комментариев
                  </Text>
                )}
                {currentPage < totalPages && (
                  <Group justify="center" py="md">
                    <Button
                      variant="light"
                      size="sm"
                      onClick={loadMoreComments}
                      loading={loadingMore}
                    >
                      Загрузить еще
                    </Button>
                  </Group>
                )}
              </>
            )}
          </Stack>
        </ScrollArea>

        {/* Поле для комментария */}
        {user && (
          <Group gap="xs" align="flex-end">
            <Textarea
              placeholder="Написать комментарий..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              style={{ flex: 1 }}
              minRows={2}
              maxRows={4}
              size="sm"
            />
            <ActionIcon
              size="lg"
              color="blue"
              variant="filled"
              onClick={handleSendComment}
              disabled={!commentText.trim() || commentLoading}
              loading={commentLoading}
            >
              <IconMessage size={20} />
            </ActionIcon>
          </Group>
        )}
      </Stack>
    </Box>
  );
}

