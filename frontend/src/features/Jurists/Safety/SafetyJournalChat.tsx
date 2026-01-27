import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { API, JOURNAL_API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { useSocketIO } from '../../../hooks/useSocketIO';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { useMantineTheme } from '@mantine/core';
import { useThemeContext } from '../../../hooks/useThemeContext';
import { useDebouncedValue } from '@mantine/hooks';
import { Box, Paper, Text, Textarea, ScrollArea, Avatar, Group, Stack, ActionIcon, LoadingOverlay, Loader, Badge, TextInput, Divider, Menu, FileButton, Image, Anchor, Modal, Button, Tooltip, Popover } from '@mantine/core';
import { IconSend, IconMessageDots, IconSearch, IconCheck, IconChecks, IconReload, IconMoodSmile, IconInfoCircle, IconEdit, IconTrash, IconPaperclip, IconFile, IconX, IconEye, IconArrowDown, IconQuote, IconFileText } from '@tabler/icons-react';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { decodeRussianFileName } from '../../../utils/format';
import { notificationSystem } from '../../../utils/Push';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('ru');

// Мемоизированный компонент сообщения для оптимизации производительности
const ChatMessageItem = memo(({ 
  message, 
  prevMessage, 
  isOwn, 
  isDark, 
  onRetrySend,
  onEdit,
  onDelete,
  onPreviewAttachments,
  onQuote,
  messageRefsMap,
}: { 
  message: ChatMessage; 
  prevMessage: ChatMessage | null; 
  isOwn: boolean; 
  isDark: boolean; 
  onRetrySend: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPreviewAttachments?: (attachments: ChatMessageAttachment[], index: number) => void;
  onQuote?: (message: ChatMessage) => void;
  messageRefsMap: React.RefObject<Map<string, HTMLDivElement>>;
}) => {
  const [menuOpened, setMenuOpened] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  const isStatusMessage = !!message.statusType;
  const statusType = message.statusType;
  
  // ОПТИМИЗАЦИЯ: Мемоизируем вычисление showAvatar
  const showAvatar = useMemo(() => {
    if (!prevMessage || prevMessage.senderId !== message.senderId) {
      return true;
    }
    try {
      const msgDate = typeof message.createdAt === 'string' 
        ? message.createdAt 
        : (message.createdAt as any) instanceof Date 
        ? (message.createdAt as any).toISOString()
        : String(message.createdAt || new Date());
      const prevDate = prevMessage ? (
        typeof prevMessage.createdAt === 'string' 
          ? prevMessage.createdAt 
          : (prevMessage.createdAt as any) instanceof Date 
          ? (prevMessage.createdAt as any).toISOString()
          : String(prevMessage.createdAt || new Date())
      ) : null;
      return prevDate ? dayjs(msgDate).diff(dayjs(prevDate), 'minute') > 5 : true;
    } catch (e) {
      return true;
    }
  }, [prevMessage, message.senderId, message.createdAt]);
  
  // Вычисляем statusColor один раз
  let statusColor = {
    bg: isDark ? '#1a3a52' : '#e3f2fd',
    text: isDark ? '#90caf9' : '#1976d2',
    border: isDark ? '#2d5a7a' : '#bbdefb',
    icon: isDark ? '#90caf9' : '#1976d2'
  };
  
  if (statusType === 'approved') {
    statusColor = {
      bg: isDark ? '#1b4332' : '#e8f5e9',
      text: isDark ? '#81c784' : '#2e7d32',
      border: isDark ? '#2d5a3d' : '#c8e6c9',
      icon: isDark ? '#81c784' : '#2e7d32'
    };
  } else if (statusType === 'rejected') {
    statusColor = {
      bg: isDark ? '#4a1f1f' : '#ffebee',
      text: isDark ? '#e57373' : '#c62828',
      border: isDark ? '#5d2a2a' : '#ffcdd2',
      icon: isDark ? '#e57373' : '#c62828'
    };
  } else if (statusType === 'under_review') {
    statusColor = {
      bg: isDark ? '#1a3a52' : '#e3f2fd',
      text: isDark ? '#90caf9' : '#1976d2',
      border: isDark ? '#2d5a7a' : '#bbdefb',
      icon: isDark ? '#90caf9' : '#1976d2'
    };
  } else if (statusType === 'pending') {
    statusColor = {
      bg: isDark ? '#4a3a1f' : '#fff8e1',
      text: isDark ? '#ffb74d' : '#f57c00',
      border: isDark ? '#5d4a2a' : '#ffe0b2',
      icon: isDark ? '#ffb74d' : '#f57c00'
    };
  }
  
  const getImageSrc = (image: string | null | undefined): string => {
    if (!image) return '';
    if (image.startsWith('data:')) return image;
    if (image.startsWith('/9j/') || image.startsWith('iVBORw0KGgo') || image.length > 100) {
      const imageType = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
      return `data:${imageType};base64,${image}`;
    }
    return `${API}/public/${image}`;
  };
  
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: isStatusMessage ? 'center' : 'flex-end',
        justifyContent: isStatusMessage ? 'center' : 'flex-start',
        marginBottom: showAvatar ? '12px' : '4px',
        gap: '8px',
        width: '100%',
      }}
    >
      {!isStatusMessage && (
        <>
          {!isOwn && (
            showAvatar ? (
            <Avatar 
              src={getImageSrc(message.sender.image)} 
              size="sm" 
              radius="xl"
              style={{ flexShrink: 0 }}
            >
              {extractString(message.sender?.name).charAt(0).toUpperCase() || '?'}
            </Avatar>
            ) : (
              <Box style={{ width: '25px', flexShrink: 0, minHeight: '32px' }} />
            )
          )}
          {isOwn && showAvatar && <Box style={{ flex: 1, minWidth: 0 }} />}
        </>
      )}
      <Box
        style={{
          maxWidth: isStatusMessage ? '85%' : '70%',
          marginLeft: isStatusMessage ? 'auto' : (isOwn ? 'auto' : '0'),
          marginRight: isStatusMessage ? 'auto' : '0',
          backgroundColor: isStatusMessage
            ? statusColor.bg
            : (isOwn 
              ? (isDark ? '#2b5278' : '#0088cc') 
              : (isDark ? '#2b2b2b' : '#e5e5e5')),
          color: isStatusMessage
            ? statusColor.text
            : (isOwn 
              ? '#ffffff'
              : (isDark ? '#ffffff' : '#000000')),
          padding: '8px 12px',
          borderRadius: isStatusMessage 
            ? '8px'
            : (isOwn 
              ? '12px 12px 4px 12px' 
              : '12px 12px 12px 4px'),
          position: 'relative',
          boxShadow: isStatusMessage 
            ? '0 2px 4px rgba(0, 0, 0, 0.15)'
            : '0 1px 2px rgba(0, 0, 0, 0.1)',
          border: isStatusMessage 
            ? `1px solid ${statusColor.border}`
            : 'none',
        }}
        onContextMenu={(e) => {
          if (!isStatusMessage && (onQuote || (isOwn && (onEdit || onDelete)))) {
            e.preventDefault();
            e.stopPropagation();
            if (targetRef.current) {
              targetRef.current.style.position = 'fixed';
              targetRef.current.style.left = `${e.clientX}px`;
              targetRef.current.style.top = `${e.clientY}px`;
              targetRef.current.style.width = '1px';
              targetRef.current.style.height = '1px';
            }
            // Небольшая задержка для обновления DOM
            setTimeout(() => {
              setMenuOpened(true);
            }, 0);
          }
        }}
      >
        {/* Контекстное меню для сообщений */}
        {!isStatusMessage && (onQuote || (isOwn && (onEdit || onDelete))) && (
          <Menu 
            position="bottom-end" 
            withinPortal
            opened={menuOpened}
            onChange={setMenuOpened}
            closeOnItemClick={true}
          >
            <Menu.Target>
              <Box 
                ref={targetRef}
                style={{ 
                  position: 'fixed',
                  width: '1px',
                  height: '1px',
                  pointerEvents: 'none',
                  opacity: 0,
                  zIndex: -1,
                }} 
              />
            </Menu.Target>
            <Menu.Dropdown
              style={{
                zIndex: 100000, // Высокий z-index чтобы меню было поверх модалки (модалка имеет zIndex: 99999)
              }}
            >
              {onQuote && (
                <Menu.Item
                  leftSection={<IconQuote size={14} />}
                  onClick={() => {
                    onQuote(message);
                    setMenuOpened(false);
                  }}
                >
                  Цитировать
                </Menu.Item>
              )}
              {onEdit && isOwn && (
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={() => {
                    onEdit(message.id);
                    setMenuOpened(false);
                  }}
                >
                  Редактировать
                </Menu.Item>
              )}
              {onDelete && isOwn && (
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={() => {
                    onDelete(message.id);
                    setMenuOpened(false);
                  }}
                >
                  Удалить
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
        {!isStatusMessage && showAvatar && !isOwn && (
          <Text 
            size="xs" 
            fw={500} 
            component="div"
            style={{ 
              marginBottom: '4px',
              color: isDark ? '#ffffff' : '#000000',
              opacity: 0.8
            }}
          >
            {extractString(message.sender?.name)}
          </Text>
        )}
        {isStatusMessage && (
          <Group gap={6} align="center" mb={4}>
            <IconInfoCircle size={16} style={{ flexShrink: 0, color: statusColor.icon }} />
            <Text 
              size="xs" 
              fw={600}
              style={{ 
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: statusColor.text,
              }}
            >
              {statusType === 'approved' && 'Журнал одобрен'}
              {statusType === 'rejected' && 'Журнал отклонен'}
              {statusType === 'under_review' && 'Отправлен на проверку'}
              {statusType === 'pending' && 'Ожидает загрузки файлов'}
              {!statusType && 'Изменение статуса'}
            </Text>
          </Group>
        )}
        {/* Отображение цитируемого сообщения */}
        {message.quotedMessage && (
          <Paper
            p="xs"
            mb="xs"
            style={{
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderLeft: `3px solid ${isDark ? '#4dabf7' : '#339af0'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)';
            }}
            onClick={() => {
              // Прокручиваем к цитируемому сообщению
              if (message.quotedMessage?.id) {
                const quotedId = String(message.quotedMessage.id);
                const quotedElement = messageRefsMap.current.get(quotedId);
                if (quotedElement) {
                  quotedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Подсветка на 2 секунды
                  quotedElement.style.transition = 'background-color 0.3s ease';
                  quotedElement.style.backgroundColor = isDark ? 'rgba(77, 171, 247, 0.3)' : 'rgba(51, 154, 240, 0.2)';
                  setTimeout(() => {
                    quotedElement.style.backgroundColor = '';
                  }, 2000);
                }
              }
            }}
          >
            <Group justify="space-between" gap="xs" mb={4}>
              <Group gap={4}>
                <IconQuote size={12} style={{ opacity: 0.5 }} />
                <Text size="xs" fw={500} c="dimmed">
                  {message.quotedMessage.sender?.name || 'Пользователь'}
                </Text>
              </Group>
            </Group>
            <Text size="xs" lineClamp={3} style={{ opacity: 0.8 }}>
              {message.quotedMessage.message}
            </Text>
            {message.quotedMessage.attachments && message.quotedMessage.attachments.length > 0 && (
              <Text size="xs" c="dimmed" mt={4} style={{ fontStyle: 'italic' }}>
                📎 {message.quotedMessage.attachments.length} {message.quotedMessage.attachments.length === 1 ? 'файл' : 'файлов'}
              </Text>
            )}
          </Paper>
        )}
        {/* Показываем текст сообщения только если он не пустой или не только пробелы */}
        {message.message.trim() !== '' && (
          <Text 
            size="sm" 
            component="div"
            fw={isStatusMessage ? 500 : 400}
            style={{ 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word',
              lineHeight: '1.4',
            }}
          >
            {typeof message.message === 'string' ? message.message : String(message.message || '')}
          </Text>
        )}
        {/* Отображение вложений */}
        {message.attachments && message.attachments.length > 0 && (
          <Stack gap={4} mt={message.message.trim() !== '' ? 8 : 0}>
            {message.attachments.map((attachment) => {
              const isImage = attachment.mimeType?.startsWith('image/');
              const isPdf = attachment.mimeType === 'application/pdf';
              const isWord = attachment.mimeType?.includes('wordprocessingml') || attachment.mimeType === 'application/msword';
              const isExcel = attachment.mimeType?.includes('spreadsheetml') || attachment.mimeType === 'application/vnd.ms-excel';
              
              // Формируем правильный URL для файла
              let fileUrl = attachment.fileUrl;
              if (!fileUrl.startsWith('http')) {
                // Если путь относительный, добавляем базовый URL API
                if (fileUrl.startsWith('/')) {
                  // Путь уже начинается с /, добавляем /public перед ним
                  // Правильно кодируем имя файла в URL (для пробелов, скобок и других спецсимволов)
                  const pathParts = fileUrl.split('/');
                  const fileName = pathParts[pathParts.length - 1];
                  const directory = pathParts.slice(0, -1).join('/');
                  // Кодируем только имя файла, оставляя путь без изменений
                  const encodedFileName = encodeURIComponent(fileName);
                  fileUrl = `${API}/public${directory}/${encodedFileName}`;
                } else {
                  // Кодируем имя файла
                  const encodedFileName = encodeURIComponent(fileUrl);
                  fileUrl = `${API}/public/${encodedFileName}`;
                }
              }
              
              // Форматируем размер файла
              const formatFileSize = (bytes?: number) => {
                if (!bytes) return '';
                if (bytes < 1024) return `${bytes} Б`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
              };
              
              return (
                <Box
                  key={attachment.id}
                  style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    maxWidth: '400px',
                    cursor: isImage ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    // Открываем предпросмотр для всех вложений сообщения
                    if (message.attachments && message.attachments.length > 0 && onPreviewAttachments) {
                      onPreviewAttachments(message.attachments, message.attachments.findIndex(a => a.id === attachment.id));
                    } else if (isImage) {
                      // Fallback: открываем изображение в новой вкладке
                      window.open(fileUrl, '_blank');
                    }
                  }}
                >
                  {isImage ? (
                    <Box>
                      <Image
                        src={fileUrl}
                        alt={attachment.fileName}
                        style={{ maxHeight: '300px', objectFit: 'contain', width: '100%', cursor: 'pointer' }}
                        fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3EИзображение%3C/text%3E%3C/svg%3E"
                      />
                      <Group gap="xs" p="xs" style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }}>
                        <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>
                          {attachment.fileName}
                        </Text>
                        {attachment.fileSize && (
                          <Text size="xs" c="dimmed">
                            {formatFileSize(attachment.fileSize)}
                          </Text>
                        )}
                      </Group>
                    </Box>
                  ) : (
                    <Group gap="sm" p="xs" style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', cursor: 'pointer' }}
                      onClick={() => {
                        // Открываем предпросмотр для всех вложений сообщения
                        if (message.attachments && message.attachments.length > 0 && onPreviewAttachments) {
                          const attachmentIndex = message.attachments.findIndex(a => a.id === attachment.id);
                          if (attachmentIndex >= 0) {
                            onPreviewAttachments(message.attachments, attachmentIndex);
                          }
                        }
                      }}
                    >
                      <IconFile 
                        size={24} 
                        color={isPdf ? 'red' : isWord ? 'blue' : isExcel ? 'green' : undefined}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" align="center">
                          <Anchor
                            href={fileUrl}
                            download={attachment.fileName}
                            size="sm"
                            style={{ textDecoration: 'none', display: 'block', flex: 1 }}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Text size="sm" truncate style={{ fontWeight: 500 }}>
                              {attachment.fileName}
                            </Text>
                          </Anchor>
                          {onPreviewAttachments && message.attachments && message.attachments.length > 0 && (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Открываем предпросмотр
                                const attachmentIndex = message.attachments!.findIndex(a => a.id === attachment.id);
                                if (attachmentIndex >= 0) {
                                  onPreviewAttachments(message.attachments!, attachmentIndex);
                                }
                              }}
                              title="Предпросмотр"
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                        {attachment.fileSize && (
                          <Text size="xs" c="dimmed" mt={2}>
                            {formatFileSize(attachment.fileSize)}
                          </Text>
                        )}
                      </Box>
                    </Group>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
        <Group 
          gap={4} 
          justify={isOwn ? 'flex-end' : 'flex-start'}
          align="center"
          style={{ marginTop: '4px' }}
        >
          <MessageTime message={message} />
          {isOwn && (
            <Group gap={2} style={{ marginLeft: '4px' }}>
              {message.status === 'error' ? (
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  color="red"
                  onClick={() => onRetrySend(message.id)}
                  style={{ cursor: 'pointer' }}
                  title="Ошибка отправки. Нажмите для повторной отправки"
                >
                  <IconReload size={12} />
                </ActionIcon>
              ) : message.status === 'read' || message.readAt ? (
                <IconChecks size={14} color={isDark ? '#4fc3f7' : '#0088cc'} />
              ) : message.status === 'sent' ? (
                <IconCheck size={14} color={isDark ? '#9e9e9e' : '#999999'} />
              ) : message.status === 'sending' ? (
                <Loader size={12} variant="dots" />
              ) : (
                // Если статус не установлен, но сообщение отправлено (не статусное), показываем галочку
                <IconCheck size={14} color={isDark ? '#9e9e9e' : '#999999'} />
              )}
            </Group>
          )}
        </Group>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.readAt === nextProps.message.readAt &&
    prevProps.message.message === nextProps.message.message &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.isDark === nextProps.isDark &&
    (prevProps.prevMessage?.id || null) === (nextProps.prevMessage?.id || null)
  );
});

ChatMessageItem.displayName = 'ChatMessageItem';

// Мемоизированный компонент для времени сообщения (оптимизация)
const MessageTime = memo(({ message }: { message: ChatMessage }) => {
  const timeString = useMemo(() => {
    try {
      const createdAt = message.createdAt as any;
      const date = typeof createdAt === 'string' 
        ? createdAt 
        : createdAt instanceof Date 
        ? createdAt.toISOString()
        : String(createdAt || new Date());
      return dayjs(date).format('HH:mm');
    } catch (e) {
      return '--:--';
    }
  }, [message.createdAt]);
  
  return (
    <Group gap={4} wrap="nowrap">
      {message.isEdited && (
        <Text 
          size="xs" 
          component="span"
          style={{ 
            opacity: 0.6,
            fontSize: '11px',
            fontStyle: 'italic',
          }}
        >
          изменено
        </Text>
      )}
      <Text 
        size="xs" 
        component="span"
        style={{ 
          opacity: 0.6,
          fontSize: '11px',
        }}
      >
        {timeString}
      </Text>
    </Group>
  );
});

MessageTime.displayName = 'MessageTime';

// Мемоизированный компонент элемента списка филиалов для оптимизации производительности
interface BranchItemProps {
  branch: BranchWithChats;
  isSelected: boolean;
  unreadCount: number;
  isDark: boolean;
  theme: any;
  onSelect: (branch: BranchWithChats) => void;
}

const BranchItem = memo(({ branch, isSelected, unreadCount, isDark, theme, onSelect }: BranchItemProps) => {
  const hasUnread = unreadCount > 0;
  
  // Мемоизируем вычисления стилей
  const backgroundColor = isSelected
    ? (isDark ? theme.colors.blue[9] : theme.colors.blue[0])
    : hasUnread
    ? (isDark ? theme.colors.blue[8] : theme.colors.blue[1])
    : 'transparent';
  
  const borderLeft = hasUnread
    ? `3px solid ${isDark ? theme.colors.blue[6] : theme.colors.blue[4]}`
    : 'none';
  
  // Мемоизируем текст последнего сообщения
  const lastMessageText = branch.lastMessage 
    ? (() => {
        const msgText = extractString(branch.lastMessage.message);
        return typeof msgText === 'string' ? msgText.substring(0, 30) + '...' : '';
      })()
    : null;
  
  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelected) {
      e.currentTarget.style.backgroundColor = hasUnread
        ? (isDark ? theme.colors.blue[7] : theme.colors.blue[2])
        : (isDark ? theme.colors.dark[6] : theme.colors.gray[0]);
    }
  }, [isSelected, hasUnread, isDark, theme]);
  
  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelected) {
      e.currentTarget.style.backgroundColor = backgroundColor;
    }
  }, [isSelected, backgroundColor]);
  
  return (
    <Paper
      p="md"
      withBorder={false}
      style={{
        cursor: 'pointer',
        backgroundColor,
        borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[2]}`,
        borderLeft,
        position: 'relative',
      }}
      onClick={() => onSelect(branch)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
            {branch.branchName}
          </Text>
          {hasUnread && (
            <Badge
              size="sm"
              color="blue"
              variant="filled"
              style={{ flexShrink: 0 }}
            >
              {unreadCount}
            </Badge>
          )}
        </Group>
        {lastMessageText && (
          <Text size="xs" c="dimmed" mt="xs" truncate>
            {lastMessageText}
          </Text>
        )}
      </Box>
    </Paper>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  return (
    prevProps.branch.branchId === nextProps.branch.branchId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.unreadCount === nextProps.unreadCount &&
    prevProps.branch.lastMessage?.id === nextProps.branch.lastMessage?.id &&
    prevProps.branch.branchName === nextProps.branch.branchName
  );
});

BranchItem.displayName = 'BranchItem';

// Мемоизированный компонент поля ввода для оптимизации производительности
// КРИТИЧНО: Используем uncontrolled input с ref, чтобы изменения не вызывали перерендер родителя
const MessageInput = memo(({
  initialValue,
  onSend,
  isDark,
  sending,
  showEmojiPicker,
  onToggleEmojiPicker,
  onEmojiClick,
  borderColor,
  backgroundColor,
  inputBackgroundColor,
  inputBorderColor,
  onFilesSelect,
  attachments,
  onTyping,
}: {
  initialValue: string;
  onSend: (text: string, files?: File[]) => void;
  isDark: boolean;
  sending: boolean;
  showEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onEmojiClick: (emoji: string) => void;
  borderColor: string;
  backgroundColor: string;
  inputBackgroundColor: string;
  inputBorderColor: string;
  onFilesSelect?: (files: File[]) => void;
  attachments?: File[];
  onTyping?: () => void;
}) => {
  // Используем ref для хранения значения, чтобы избежать перерендеров
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(initialValue);
  
  // Синхронизируем ref при изменении initialValue (особенно важно при редактировании)
  useEffect(() => {
    valueRef.current = initialValue;
    if (textareaRef.current) {
      const currentValue = textareaRef.current.value;
      // Обновляем только если значение действительно изменилось
      if (currentValue !== initialValue) {
        textareaRef.current.value = initialValue;
        // Устанавливаем курсор в конец текста при редактировании
        const length = initialValue.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }
  }, [initialValue]);

  const textareaStyles = useMemo(() => ({
    input: {
      backgroundColor: inputBackgroundColor,
      border: `1px solid ${inputBorderColor}`,
      borderRadius: '20px',
      padding: '10px 16px',
    }
  }), [inputBackgroundColor, inputBorderColor]);

  const handleSend = useCallback(() => {
    const text = textareaRef.current?.value.trim() || '';
    const filesToSend = attachments || [];
    if ((text || filesToSend.length > 0) && !sending) {
      valueRef.current = '';
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      onSend(text, filesToSend.length > 0 ? filesToSend : undefined);
    }
  }, [onSend, sending, attachments]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleEmojiClickInternal = useCallback((emoji: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const currentValue = textarea.value;
      const newValue = currentValue.slice(0, start) + emoji + currentValue.slice(end);
      textarea.value = newValue;
      valueRef.current = newValue;
      // Устанавливаем курсор после вставленного эмодзи
      const newCursorPos = start + emoji.length;
      setTimeout(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      }, 0);
    }
    onEmojiClick(emoji);
  }, [onEmojiClick]);

  return (
    <Box 
      p="md" 
      data-message-input-container
      style={{ 
        borderTop: `1px solid ${borderColor}`,
        backgroundColor,
      }}
    >
      <Group gap="sm" align="center">
        <ActionIcon
          size="lg"
          radius="xl"
          variant={showEmojiPicker ? 'filled' : 'subtle'}
          color="gray"
          onClick={onToggleEmojiPicker}
          title="Эмодзи"
          style={{ flexShrink: 0 }}
        >
          <IconMoodSmile size={24} />
        </ActionIcon>
        {onFilesSelect && (
          <FileButton onChange={onFilesSelect} multiple accept="*">
            {(props) => (
              <ActionIcon
                {...props}
                size="lg"
                radius="xl"
                variant="subtle"
                color="gray"
                title="Прикрепить файл"
                style={{ flexShrink: 0 }}
              >
                <IconPaperclip size={24} />
              </ActionIcon>
            )}
          </FileButton>
        )}
        <Textarea
          ref={textareaRef}
          placeholder="Введите сообщение..."
          defaultValue={initialValue}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            valueRef.current = e.target.value;
            // Отправляем событие "печатает..."
            if (onTyping) {
              onTyping();
            }
          }}
          style={{ flex: 1, minHeight: '44px' }}
          minRows={1}
          maxRows={4}
          autosize={true}
          styles={textareaStyles}
        />
        <ActionIcon
          color="blue"
          variant="filled"
          size="lg"
          radius="xl"
          onClick={handleSend}
          loading={sending}
          disabled={sending}
          style={{
            backgroundColor: isDark ? '#2b5278' : '#0088cc',
            flexShrink: 0,
          }}
        >
          <IconSend size={24} />
        </ActionIcon>
      </Group>
      {/* Простой эмодзи пикер */}
      {showEmojiPicker && (
        <Box
          style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: inputBackgroundColor,
            borderRadius: '8px',
            border: `1px solid ${inputBorderColor}`,
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          <Group gap={4}>
            {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'].map((emoji) => (
              <ActionIcon
                key={emoji}
                variant="subtle"
                size="sm"
                onClick={() => handleEmojiClickInternal(emoji)}
                style={{ fontSize: '20px', cursor: 'pointer' }}
              >
                {emoji}
              </ActionIcon>
            ))}
          </Group>
        </Box>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  // Сравниваем только initialValue (для очистки после отправки), остальные пропсы не должны меняться часто
  return (
    prevProps.initialValue === nextProps.initialValue &&
    prevProps.sending === nextProps.sending &&
    prevProps.showEmojiPicker === nextProps.showEmojiPicker &&
    prevProps.isDark === nextProps.isDark &&
    prevProps.borderColor === nextProps.borderColor &&
    prevProps.backgroundColor === nextProps.backgroundColor &&
    prevProps.inputBackgroundColor === nextProps.inputBackgroundColor &&
    prevProps.inputBorderColor === nextProps.inputBorderColor &&
    prevProps.attachments?.length === nextProps.attachments?.length
  );
});

MessageInput.displayName = 'MessageInput';

// Функция для безопасного извлечения строки из значения
const extractString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val && typeof val === 'object') {
    // Если это объект сообщения (имеет поля id, message, sender, createdAt), извлекаем message рекурсивно
    if ('message' in val) {
      const nestedMessage = val.message;
      // Рекурсивно извлекаем строку из вложенного message
      if (typeof nestedMessage === 'string') {
        return nestedMessage;
      }
      if (nestedMessage && typeof nestedMessage === 'object') {
        // Если вложенный message тоже объект, рекурсивно извлекаем
        const result = extractString(nestedMessage);
        // Гарантируем, что результат - строка
        return typeof result === 'string' ? result : String(result || '');
      }
      return String(nestedMessage || '');
    }
    if ('value' in val && typeof val.value === 'string') return val.value;
    if ('type' in val && typeof val.type === 'string') return val.type;
    if ('name' in val && typeof val.name === 'string') return val.name;
    // Если это массив, пытаемся извлечь строку из первого элемента
    if (Array.isArray(val) && val.length > 0) {
      const result = extractString(val[0]);
      return typeof result === 'string' ? result : String(result || '');
    }
    // В последнюю очередь преобразуем в JSON строку
    try {
      const jsonStr = JSON.stringify(val);
      return typeof jsonStr === 'string' ? jsonStr : String(jsonStr || '');
    } catch {
    return String(val);
  }
  }
  const result = String(val || '');
  return typeof result === 'string' ? result : '';
};

// Функция для определения типа статусного сообщения (оптимизирована)
const getStatusMessageType = (message: string): 'approved' | 'rejected' | 'under_review' | 'pending' | null => {
  if (!message || typeof message !== 'string') return null;
  if (message.includes('одобрен')) return 'approved';
  if (message.includes('отклонен')) return 'rejected';
  if (message.includes('отправлен на проверку')) return 'under_review';
  if (message.includes('ожидает загрузки файлов')) return 'pending';
  return null;
};

// Централизованная функция нормализации сообщения
// Гарантирует, что все поля имеют правильный тип для безопасного рендеринга в React
// Оптимизирована для производительности - минимум проверок
const normalizeMessage = (msg: any): ChatMessage => {
  // Защита от null/undefined
  if (!msg || typeof msg !== 'object') {
    return {
      id: '',
      message: '',
      senderId: '',
      sender: { id: '', name: 'Unknown', email: '', image: null },
      createdAt: new Date().toISOString(),
      readAt: null,
    };
  }

  // Оптимизированное извлечение текста сообщения
  let messageText = '';
  const msgMessage = msg.message;
  
  if (typeof msgMessage === 'string') {
    messageText = msgMessage;
  } else if (msgMessage && typeof msgMessage === 'object') {
    // Пытаемся найти строку внутри объекта (только при ошибке структуры данных)
    if (typeof msgMessage.message === 'string') {
      messageText = msgMessage.message;
    } else if (typeof msgMessage.text === 'string') {
      messageText = msgMessage.text;
    } else if (typeof msgMessage.messageValue === 'string') {
      messageText = msgMessage.messageValue;
    } else {
      messageText = '[Invalid message format]';
    }
  } else {
    messageText = String(msgMessage ?? '');
  }
  
  // Финальная проверка (только для безопасности)
  if (typeof messageText !== 'string') {
    messageText = String(messageText || '');
  }

  // Нормализация sender
  let sender: ChatMessage['sender'] = {
    id: '',
    name: 'Unknown',
    email: '',
    image: null,
  };
  
  if (msg.sender && typeof msg.sender === 'object') {
    sender = {
      id: String(msg.sender.id ?? ''),
      name: String(msg.sender.name ?? 'Unknown'),
      email: String(msg.sender.email ?? ''),
      image: msg.sender.image ?? null,
    };
  }

  // Нормализация дат
  let createdAt = '';
  if (typeof msg.createdAt === 'string') {
    createdAt = msg.createdAt;
  } else if (msg.createdAt instanceof Date) {
    createdAt = msg.createdAt.toISOString();
  } else {
    createdAt = new Date().toISOString();
  }

  // Вычисляем тип статуса один раз при нормализации (оптимизация)
  const statusType = getStatusMessageType(messageText);

  // Нормализация вложений
  let attachments: ChatMessageAttachment[] | undefined = undefined;
  if (msg.attachments && Array.isArray(msg.attachments)) {
    attachments = msg.attachments.map((att: any) => {
      const rawFileName = String(att.fileName || att.name || 'Файл');
      // Декодируем русские символы в имени файла (исправляем проблемы с кодировкой)
      const decodedFileName = decodeRussianFileName(rawFileName);
      return {
        id: String(att.id || att.fileId || ''),
        fileName: decodedFileName,
        fileUrl: String(att.fileUrl || att.url || att.path || ''),
        fileSize: att.fileSize || att.size,
        mimeType: att.mimeType || att.type || att.contentType,
      };
    });
  }

  // Нормализация цитируемого сообщения
  let quotedMessage: ChatMessage | null = null;
  if (msg.quotedMessage) {
    quotedMessage = normalizeMessage(msg.quotedMessage);
  }

  // Возвращаем нормализованное сообщение с гарантированными типами
  return {
    id: String(msg.id ?? ''),
    message: messageText, // ВСЕГДА строка
    senderId: String(msg.senderId ?? msg.sender?.id ?? ''),
    sender,
    createdAt,
    readAt: msg.readAt ? String(msg.readAt) : null,
    statusType, // Кешированный тип статуса для избежания повторных вычислений
    attachments,
    isEdited: msg.isEdited || false,
    quotedMessage,
  };
};

interface Checker {
  id: string;
  name: string;
  email: string;
  image: string | null;
  position: string;
  branch: string;
  responsibilityTypes?: string[]; // Типы ответственности: ['ОТ', 'ПБ']
  isChecker?: boolean; // Флаг, является ли участник проверяющим
}

interface BranchWithChats {
  branchId: string;
  branchName: string;
  branchAddress: string;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
  updatedAt?: string | null;
}

interface ChatMessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

interface ChatMessage {
  id: string;
  message: string;
  senderId: string;
  sender: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  createdAt: string;
  statusType?: 'approved' | 'rejected' | 'under_review' | 'pending' | null; // Кешированный тип статуса
  readAt: string | null;
  status?: 'sending' | 'sent' | 'read' | 'error'; // Статус сообщения
  attachments?: ChatMessageAttachment[]; // Вложения к сообщению
  isEdited?: boolean; // Флаг редактирования сообщения
  quotedMessage?: ChatMessage | null; // Цитируемое сообщение
}

interface Chat {
  id: string;
  branchId: string;
  checkerId: string;
  checker: Checker;
  messages: ChatMessage[];
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

interface SafetyJournalChatProps {
  branchId: string;
  branchName?: string; // Название филиала для отображения
  onClose: () => void;
  onPreviewFiles?: (files: Array<{ id: string; source: File | string; name?: string; mimeType?: string }>, index: number) => void;
  onParticipantsChange?: (participants: Checker[]) => void;
  getImageSrc?: (image: string | null) => string;
  targetMessageId?: string; // ID сообщения для прокрутки при открытии из уведомления
}

export default function SafetyJournalChat({ branchId, branchName: propBranchName, onClose: _onClose, onPreviewFiles: externalOnPreviewFiles, onParticipantsChange, getImageSrc: externalGetImageSrc, targetMessageId }: SafetyJournalChatProps) {
  const { user, token } = useUserContext();
  const { access } = useAccessContext();
  const { socket } = useSocketIO();
  const theme = useMantineTheme();
  const { isDark } = useThemeContext();
  const authFetch = useAuthFetch();
  
  // ИСПРАВЛЕНО: Мемоизируем access, чтобы избежать ререндеров при изменении ссылки на массив
  const accessStableRef = useRef<typeof access>([]);
  const accessHashRef = useRef<string>('');
  
  const stableAccess = useMemo(() => {
    const currentHash = JSON.stringify(
      [...access]
        .sort((a, b) => `${a.toolId}:${a.link}:${a.accessLevel}`.localeCompare(`${b.toolId}:${b.link}:${b.accessLevel}`))
    );
    
    if (accessHashRef.current === currentHash && accessStableRef.current.length > 0) {
      return accessStableRef.current;
    }
    
    accessHashRef.current = currentHash;
    accessStableRef.current = access;
    return access;
  }, [access]);
  // checkers больше не используется для ответственных - они видят только чат
  const [branchesWithChats, setBranchesWithChats] = useState<BranchWithChats[]>([]);
  const [branchSearchQuery, setBranchSearchQuery] = useState<string>('');
  // Счетчик непрочитанных сообщений по филиалам (для проверяющих)
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  
  // Мемоизируем отфильтрованный и отсортированный список филиалов для оптимизации производительности
  // Сортировка: филиалы с новыми сообщениями (по updatedAt) вверху
  const filteredBranches = useMemo(() => {
    let result = [...branchesWithChats];
    
    // Сортируем по updatedAt (новые сообщения вверху)
    result.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA; // По убыванию (новые сверху)
    });
    
    // Фильтрация по поисковому запросу
    if (branchSearchQuery.trim()) {
      const query = branchSearchQuery.toLowerCase();
      result = result.filter((branch) => 
        branch.branchName?.toLowerCase().includes(query) ||
        branch.branchAddress?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [branchesWithChats, branchSearchQuery]);
  
  const [selectedChecker, setSelectedChecker] = useState<Checker | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<BranchWithChats | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Кеш сообщений по chatId для избежания повторной загрузки при переключении чатов
  const messagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  // Для ответственных: все участники чата (проверяющие + другие ответственные)
  const [allParticipants, setAllParticipants] = useState<Checker[]>([]);
  // Для проверяющих: все участники чата (проверяющие + ответственные)
  const [allParticipantsForChecker, setAllParticipantsForChecker] = useState<Checker[]>([]);
  // Журналы филиала
  const [branchJournals, setBranchJournals] = useState<Array<{ id: string; journal_id: string; journal_title: string; journal_type: 'ОТ' | 'ПБ'; status: 'approved' | 'pending' | 'rejected' | 'under_review'; period_start: string; period_end: string; files?: Array<{ file_id: string; original_filename: string; content_type: string; is_deleted: boolean; description: string; download_url: string; view_url: string }> }>>([]);
  const [journalsPopoverOpened, setJournalsPopoverOpened] = useState(false);
  const [journalsLoading, setJournalsLoading] = useState(false);
  
  // Мемоизируем отсортированный список журналов: одобренные (approved) в конце
  const sortedBranchJournals = useMemo(() => {
    const approved = branchJournals.filter(j => j.status === 'approved');
    const notApproved = branchJournals.filter(j => j.status !== 'approved');
    return [...notApproved, ...approved];
  }, [branchJournals]);
  const [messageText, setMessageText] = useState('');
  const [failedMessages, setFailedMessages] = useState<Map<string, { message: string; timestamp: number }>>(new Map());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  // Состояние для предпросмотра файлов
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewFiles, setPreviewFiles] = useState<Array<{ id: string; source: File | string; name?: string; mimeType?: string }>>([]);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  // Refs для сообщений для прокрутки без document.querySelector
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const socketHandlerRegistered = useRef<string | null>(null);
  // Ref для хранения актуальных значений чата, чтобы обработчик Socket.IO всегда имел доступ к актуальным данным
  const currentChatRef = useRef<Chat | null>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  
  // Состояния для пагинации
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [messagesPage, setMessagesPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Состояния для поиска
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  
  // Состояния для улучшений UX
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map()); // userId -> userName
  const [participantsPopoverOpened, setParticipantsPopoverOpened] = useState(false);

  // Проверяем, является ли пользователь проверяющим
  // ИСПРАВЛЕНО: Используем stableAccess для предотвращения ререндеров
  const isChecker = useMemo(() => {
    if (!user || !stableAccess) return false;
    
    if (user.role === 'SUPERVISOR') {
      return true;
    }
    
    return stableAccess.some(tool => 
      tool.link === 'jurists/safety' && 
      tool.accessLevel === 'FULL'
    );
  }, [user, stableAccess]);

  // Refs для стабилизации зависимостей sendMessage, чтобы избежать пересоздания функции
  const chatRef = useRef(chat);
  const selectedChatRefForSend = useRef(selectedChat);
  const userRef = useRef(user);
  const tokenRef = useRef(token);
  const isCheckerRef = useRef(isChecker);
  const messageTextRef = useRef(messageText);
  const quotedMessageRef = useRef(quotedMessage);
  const sendingRef = useRef(sending);
  
  // Обновляем refs при изменении значений
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  useEffect(() => {
    selectedChatRefForSend.current = selectedChat;
  }, [selectedChat]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    isCheckerRef.current = isChecker;
  }, [isChecker]);
  useEffect(() => {
    messageTextRef.current = messageText;
  }, [messageText]);
  useEffect(() => {
    quotedMessageRef.current = quotedMessage;
  }, [quotedMessage]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);


  // Загрузка списка филиалов с чатами (для проверяющего)
  const loadBranchesWithChats = useCallback(async () => {
    // Строгая проверка: только проверяющие могут загружать филиалы с чатами
    // Проверяем напрямую через user и access, а не только через isChecker
    if (!user || !access || !token) {
      return;
    }
    
    const userIsChecker = user.role === 'SUPERVISOR' || 
      (access.some(tool => tool.link === 'jurists/safety' && tool.accessLevel === 'FULL'));
    
    if (!userIsChecker) {
      return;
    }
    
    try {
      const response = await authFetch(`${API}/jurists/safety/chat/branches-with-chats`);

      // Если ошибка 403 (Forbidden), это нормально для не-проверяющих - просто игнорируем
      if (response && response.status === 403) {
        console.log('[loadBranchesWithChats] Access denied - user is not a checker');
        setBranchesWithChats([]);
        setLoading(false);
        return;
      }

      if (!response || !response.ok) {
        throw new Error('Failed to load branches with chats');
      }

      const data = await response.json();
      setBranchesWithChats(data);
    } catch (error: any) {
      // Если ошибка 403 (Forbidden), это нормально для не-проверяющих - просто игнорируем
      if (error?.response?.status === 403 || error?.status === 403 || (error?.message && error.message.includes('403'))) {
        console.log('[loadBranchesWithChats] Access denied - user is not a checker');
        setBranchesWithChats([]);
        setLoading(false);
        return;
      }
      
      console.error('[loadBranchesWithChats] Error loading branches:', error);
      const errorMessage = error instanceof Error ? error.message : 'Не удалось загрузить список филиалов';
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      setBranchesWithChats([]);
    } finally {
      setLoading(false);
    }
  }, [token, user, access]);

  // Загрузка журналов филиала
  const loadBranchJournals = useCallback(async (branchId: string) => {
    if (!token) return;
    
    setJournalsLoading(true);
    try {
      const response = await authFetch(`${JOURNAL_API}/v1/branch_journals/?branchId=${branchId}`);

      if (!response || !response.ok) {
        throw new Error(`Failed to load branch journals: ${response?.status || 'unknown'}`);
      }

      const data = await response.json();
      
      setBranchJournals((data || []).map((j: any) => ({
        id: j.id,
        journal_id: j.journal_id,
        journal_title: j.journal_title,
        journal_type: j.journal_type,
        status: j.status,
        period_start: j.period_start,
        period_end: j.period_end,
        files: j.files,
      })));
    } catch (error) {
      console.error('[loadBranchJournals] Error loading branch journals:', error);
      setBranchJournals([]);
    } finally {
      setJournalsLoading(false);
    }
  }, [token]);

  // Загрузка списка проверяющих (для ответственных)
  const loadCheckers = useCallback(async () => {
    // Очищаем сообщения и участников перед загрузкой нового чата
    setMessages([]);
    setAllParticipants([]); // Очищаем участников перед загрузкой новых
    
    if (!token) {
      return;
    }
    
    try {
      // Для ответственных загружаем всех участников чата (проверяющие + другие ответственные)
      const response = await authFetch(`${API}/jurists/safety/chat/participants?branchId=${branchId}`);

      if (!response || !response.ok) {
        throw new Error('Failed to load chat participants');
      }

      const data = await response.json();
      
      // ИЗМЕНЕНО: Сохраняем всех участников для отображения в заголовке чата
      // НЕ исключаем текущего пользователя, чтобы видеть всех участников чата
      setAllParticipants(data);
      // Уведомляем родительский компонент об изменении участников
      if (onParticipantsChange) {
        onParticipantsChange(data);
      }
      
      // Для ответственных не показываем список, сразу загружаем чат с первым проверяющим
      // Автоматически выбираем первого участника (проверяющего), если есть
      if (data.length > 0) {
        // Фильтруем только проверяющих (не других ответственных и не текущего пользователя)
        const checkersOnly = data.filter((p: Checker) => p.id !== user?.id);
        
        if (checkersOnly.length > 0) {
          const firstChecker = checkersOnly[0];
        setSelectedChecker(firstChecker);
        // Сразу загружаем чат для первого проверяющего
          const chatResponse = await authFetch(`${API}/jurists/safety/chat/chats/${branchId}/${firstChecker.id}`);

          if (chatResponse && chatResponse.ok) {
          const chatData: Chat = await chatResponse.json();
          setChat(chatData);
          setSelectedChat(chatData);
            // Сбрасываем флаг начальной загрузки для нового чата
            isInitialLoadRef.current = true;
            
            // Загружаем сообщения для этого чата
            if (chatData.id) {
              await loadMessages(chatData.id);
            }
            
            // Загружаем журналы филиала
            await loadBranchJournals(branchId);
          }
        }
      }
    } catch (error) {
      console.error('[loadCheckers] Error loading checkers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Не удалось загрузить участников чата';
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      setAllParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [token, branchId, user?.id, loadBranchJournals]);

  // Загрузка списка ответственных для филиала
  const loadResponsibles = useCallback(async (branchId: string) => {
    // Очищаем участников перед загрузкой новых
    setAllParticipantsForChecker([]);
    
    if (!token) return;
    
    try {
      const response = await authFetch(`${API}/jurists/safety/chat/participants?branchId=${branchId}`);

      if (!response || !response.ok) {
        throw new Error('Failed to load responsibles');
      }

      const data = await response.json();
      
      // ИЗМЕНЕНО: Сохраняем всех участников для проверяющего
      // Убеждаемся, что данные относятся к правильному филиалу
      setAllParticipantsForChecker(data || []);
      // Уведомляем родительский компонент об изменении участников
      if (onParticipantsChange) {
        onParticipantsChange(data || []);
      }
    } catch (error) {
      console.error('[loadResponsibles] Error loading participants for branch:', branchId, error);
      setAllParticipantsForChecker([]);
    }
  }, [token, user?.id, onParticipantsChange]);

  // Загрузка сообщений чата с пагинацией
  const loadMessages = useCallback(async (chatId: string, page: number = 1, append: boolean = false, useCache: boolean = true) => {
    // Проверяем кеш, если это первая страница и не append
    if (useCache && page === 1 && !append) {
      const cachedMessages = messagesCacheRef.current.get(chatId);
      if (cachedMessages && cachedMessages.length > 0) {
        // Используем кешированные сообщения
        setMessages(cachedMessages);
        setMessagesPage(1);
        // Прокрутка вниз после загрузки из кеша
        if (scrollAreaRef.current) {
          requestAnimationFrame(() => {
            const scrollElement = scrollAreaRef.current;
            if (scrollElement) {
              scrollElement.scrollTop = scrollElement.scrollHeight;
            }
          });
        }
        return;
      }
    }

    try {
      const response = await authFetch(`${API}/jurists/safety/chat/chats/${chatId}/messages?limit=50&page=${page}`);

      if (!response || !response.ok) {
        if (response?.status === 403) {
          throw new Error('Access denied to chat messages');
        }
        if (response?.status === 401) {
          throw new Error('Unauthorized - Please refresh the page');
        }
        throw new Error(`Failed to load messages: ${response?.status || 'unknown'} ${response?.statusText || 'unknown error'}`);
      }

      const data = await response.json();
      
      // Обрабатываем разные форматы ответа
      let messagesArray: any[] = [];
      if (Array.isArray(data)) {
        messagesArray = data;
      } else if (data.messages && Array.isArray(data.messages)) {
        messagesArray = data.messages;
      } else if (data.messages && typeof data.messages === 'object' && !Array.isArray(data.messages)) {
        messagesArray = Object.values(data.messages);
      } else {
        messagesArray = [];
      }
      
      // Нормализуем сообщения
      const normalizedMessages: ChatMessage[] = messagesArray
        .filter((msg: any) => msg && typeof msg === 'object' && msg.id)
        .map((msg: any) => normalizeMessage(msg))
        .filter((msg: ChatMessage) => {
          if (typeof msg.message !== 'string') {
            return false;
          }
          // Не фильтруем статусные сообщения (они важны для отображения статусов журналов)
          const isStatusMessage = msg.statusType !== null && msg.statusType !== undefined;
          if (isStatusMessage) {
            return true; // Всегда сохраняем статусные сообщения
          }
          // Для обычных сообщений: должны быть либо текст, либо вложения
          return msg.message.trim() !== '' || (msg.attachments && msg.attachments.length > 0);
        });
      
      // Проверяем, есть ли еще сообщения для загрузки
      const hasMore = normalizedMessages.length === 50;
      setHasMoreMessages(hasMore);
      
      // Если append=true, добавляем к существующим сообщениям, иначе заменяем
      if (append) {
        setMessages(prev => {
          // Избегаем дубликатов
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = normalizedMessages.filter(m => !existingIds.has(m.id));
          return [...newMessages, ...prev];
        });
      } else {
        // Сортируем сообщения по createdAt по возрастанию (старые сверху, новые снизу)
        const sortedMessages = [...normalizedMessages].sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateA - dateB;
        });
        // Удаляем дубликаты по ID перед установкой состояния
        const uniqueMessages = sortedMessages.reduce((acc, msg) => {
          const msgId = String(msg.id);
          if (!acc.some(m => String(m.id) === msgId)) {
            acc.push(msg);
          }
          return acc;
        }, [] as ChatMessage[]);
        setMessages(uniqueMessages);
        setMessagesPage(1);
        // Сохраняем в кеш только первую страницу
        if (page === 1) {
          messagesCacheRef.current.set(chatId, uniqueMessages);
        }
      }

      // Прокрутка вниз после загрузки сообщений (только если не append, иначе сохраняем позицию)
      // Устанавливаем прокрутку напрямую в конец без анимации
      if (!append && scrollAreaRef.current) {
        requestAnimationFrame(() => {
          const scrollElement = scrollAreaRef.current;
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }
        });
      }

      // Отмечаем сообщения как прочитанные
      await authFetch(`${API}/jurists/safety/chat/chats/${chatId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      // Ошибка загрузки сообщений
    }
  }, [token]);

  // Загрузка или создание чата
  const loadChat = useCallback(async (checker: Checker) => {
    try {
      // Загружаем всех участников чата перед загрузкой самого чата
      const participantsResponse = await authFetch(`${API}/jurists/safety/chat/participants?branchId=${branchId}`);

      if (participantsResponse && participantsResponse.ok) {
        const participantsData = await participantsResponse.json();
        setAllParticipants(participantsData);
        // Уведомляем родительский компонент об изменении участников
        if (onParticipantsChange) {
          onParticipantsChange(participantsData);
        }
      }

      const response = await authFetch(`${API}/jurists/safety/chat/chats/${branchId}/${checker.id}`);

      if (!response || !response.ok) {
        throw new Error('Failed to load chat');
      }

      const chatData: Chat = await response.json();
      setChat(chatData);
      setSelectedChat(chatData);
      
      // Сбрасываем флаг начальной загрузки для нового чата
      isInitialLoadRef.current = true;
      
      // Загружаем сообщения с использованием кеша (если есть)
      if (chatData.id) {
        await loadMessages(chatData.id, 1, false, true);
      } else {
        // Если чата нет, очищаем сообщения
        setMessages([]);
      }
      
      // Загружаем журналы филиала
      await loadBranchJournals(branchId);
    } catch (error) {
      // Ошибка загрузки чата
      setMessages([]);
    }
  }, [branchId, token, loadMessages, onParticipantsChange, loadBranchJournals]);

  // Отправка сообщения
  // Используем refs для всех зависимостей, чтобы функция не пересоздавалась при каждом рендере
  const sendMessage = useCallback(async (textToSend?: string, retryMessageId?: string, files?: File[]) => {
    // Получаем актуальные значения из refs
    const currentChat = isCheckerRef.current ? selectedChatRefForSend.current : chatRef.current;
    const currentUser = userRef.current;
    
    // Получаем messageText из ref (актуальное значение)
    const text = textToSend || messageTextRef.current.trim();
    // Используем переданные файлы (attachments передаются через параметры из MessageInput)
    const filesToSend = files || [];
    
    // Используем ref для sending, чтобы избежать зависимостей
    if ((!text && filesToSend.length === 0) || !currentChat || sendingRef.current) return;

    setSending(true);
    
    // Создаем временное сообщение со статусом "sending" для оптимистичного обновления UI
    const tempId = retryMessageId || `temp-${Date.now()}`;
    const tempMessage: ChatMessage = {
      id: tempId,
      message: text,
      senderId: currentUser?.id || '',
      sender: {
        id: currentUser?.id || '',
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        image: currentUser?.image || null,
      },
      createdAt: new Date().toISOString(),
      readAt: null,
      status: 'sending',
    };

    // Если это не повторная отправка, добавляем временное сообщение
    if (!retryMessageId) {
      setMessages(prev => {
        const normalizedPrev = prev.map(normalizeMessage).filter((msg: ChatMessage) => {
          return typeof msg.message === 'string';
        });
        return [...normalizedPrev, tempMessage];
      });
      setMessageText('');
    }

    try {
      if (!currentChat) {
        // Удаляем временное сообщение при ошибке
        if (!retryMessageId) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          setFailedMessages(prev => new Map(prev).set(tempId, { message: text, timestamp: Date.now() }));
        }
        return;
      }
      
      // Получаем актуальное значение quotedMessage из ref
      const currentQuotedMessageId = quotedMessageRef.current?.id || null;
      
      // Если есть файлы, отправляем через FormData, иначе через JSON
      let response: Response | null = null;
      if (filesToSend && filesToSend.length > 0) {
        const formData = new FormData();
        formData.append('branchId', currentChat.branchId);
        if (text) {
          formData.append('message', text);
        }
        if (currentQuotedMessageId) {
          formData.append('quotedMessageId', currentQuotedMessageId);
        }
        filesToSend.forEach((file) => {
          formData.append(`files`, file);
        });
        
        response = await authFetch(`${API}/jurists/safety/chat/chats/${currentChat.id}/messages`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await authFetch(`${API}/jurists/safety/chat/chats/${currentChat.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            branchId: currentChat.branchId,
            message: text,
            ...(currentQuotedMessageId && { quotedMessageId: currentQuotedMessageId }),
          }),
        });
      }

      if (!response || !response.ok) {
        let errorMessage = 'Не удалось отправить сообщение';
        try {
          if (response) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } catch {
          // Если не удалось распарсить JSON, используем стандартное сообщение
          if (response) {
            errorMessage = `Ошибка ${response.status}: ${response.statusText || 'Unknown error'}`;
          } else {
            errorMessage = 'Не удалось отправить сообщение: No response';
          }
        }
        throw new Error(errorMessage);
      }

      const responseData: any = await response.json();
      const finalMessage = normalizeMessage(responseData);
      
      // Определяем статус сообщения на основе readAt
      if (finalMessage.readAt) {
        finalMessage.status = 'read';
      } else {
        finalMessage.status = 'sent';
      }
      
      if (typeof finalMessage.message !== 'string') {
        finalMessage.message = String(finalMessage.message || '');
      }
      
      setMessages(prev => {
        const messageId = String(finalMessage.id);
        
        // Удаляем временное сообщение, если оно есть
        const filtered = prev.filter(m => m.id !== tempId && String(m.id) !== messageId);
        
        // Проверяем, нет ли уже такого сообщения
        if (prev.some(m => String(m.id) === messageId)) {
          return prev.map(m => String(m.id) === messageId ? finalMessage : m);
        }
        
        const normalizedPrev = filtered.map(normalizeMessage).filter((msg: ChatMessage) => {
          return typeof msg.message === 'string';
        });
        
        return [...normalizedPrev, finalMessage];
      });
      
      // Обновляем список филиалов для проверяющего - перемещаем филиал наверх при отправке сообщения
      if (isCheckerRef.current && currentChat?.branchId) {
        const messageBranchId = String(currentChat.branchId);
        setBranchesWithChats(prev => {
          const branchIndex = prev.findIndex(b => b.branchId === messageBranchId);
          if (branchIndex === -1) return prev;
          
          const updated = [...prev];
          const updatedBranch = {
            ...updated[branchIndex],
            lastMessage: finalMessage,
            updatedAt: finalMessage.createdAt,
          };
          
          // Перемещаем филиал в начало списка (вверх)
          updated.splice(branchIndex, 1);
          updated.unshift(updatedBranch);
          
          return updated;
        });
        
        // Обновляем кеш сообщений (вынесено из setMessages для избежания дублирования)
        if (currentChat.id) {
          const messageId = String(finalMessage.id);
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempId && String(m.id) !== messageId);
            const updated = [...filtered, finalMessage];
            // Обновляем кеш один раз после обновления состояния
            setTimeout(() => {
              messagesCacheRef.current.set(currentChat.id, updated);
            }, 0);
            return updated;
          });
        }
      }
      
      // Цитата очищается в handleSendMessage, здесь только обновляем сообщения
      // Вложения также очищаются в handleSendMessage
      
      // Удаляем из списка неудачных сообщений, если это была повторная отправка
      if (retryMessageId) {
        setFailedMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(retryMessageId);
          return newMap;
        });
      }

      // Прокрутка вниз после отправки сообщения - мгновенная без анимации
      requestAnimationFrame(() => {
        const scrollElement = scrollAreaRef.current;
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      });
    } catch (error) {
      console.error('[sendMessage] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Не удалось отправить сообщение';
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      
      // Обновляем статус сообщения на "error" или добавляем в список неудачных
      if (retryMessageId) {
        setMessages(prev => prev.map(m => 
          m.id === retryMessageId ? { ...m, status: 'error' as const } : m
        ));
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setFailedMessages(prev => new Map(prev).set(tempId, { message: text, timestamp: Date.now() }));
      }
    } finally {
      setSending(false);
    }
  }, []); // Нет зависимостей - все через refs

  // Обработка выбора проверяющего (не используется для ответственных, но оставляем для возможного будущего использования)
  // const handleSelectChecker = useCallback((checker: Checker) => {
  //   setSelectedChecker(checker);
  //   loadChat(checker);
  // }, [loadChat]);

  // Загрузка чата для филиала (сам филиал и есть чат)
  const loadChatForBranch = useCallback(async (branchId: string) => {
    if (!user?.id || !isChecker) return;
    
    setAllParticipantsForChecker([]); // Очищаем участников при смене филиала
    
    try {
      // Создаем/получаем чат с этим филиалом и текущим проверяющим
      const chatResponse = await authFetch(`${API}/jurists/safety/chat/chats/${branchId}/${user.id}`);

      if (chatResponse && chatResponse.ok) {
        const chatData = await chatResponse.json();
        setSelectedChat(chatData);
        setChat(chatData);
        
        // Сбрасываем флаг начальной загрузки для нового чата
        isInitialLoadRef.current = true;
        
        // Загружаем сообщения чата с использованием кеша (если есть)
        if (chatData.id) {
          await loadMessages(chatData.id, 1, false, true);
          // Прокрутка вниз происходит автоматически в loadMessages
        } else {
          // Если чата нет, очищаем сообщения
          setMessages([]);
        }
        
        // Загружаем список ответственных
        await loadResponsibles(branchId);
        
        // Загружаем журналы филиала
        await loadBranchJournals(branchId);
      } else {
        setMessages([]);
      }
    } catch (error) {
      // Ошибка загрузки чата для филиала
      setMessages([]);
    }
  }, [user?.id, isChecker, token, loadMessages, loadResponsibles, loadBranchJournals]);

  // Обработка выбора филиала (для проверяющего) - сам филиал и есть чат
  const handleSelectBranch = useCallback((branch: BranchWithChats) => {
    setSelectedBranch(branch);
    // Сбрасываем флаг начальной загрузки для нового чата
    isInitialLoadRef.current = true;
    // Очищаем участников при смене филиала
    setAllParticipantsForChecker([]);
    // Очищаем счетчик непрочитанных для выбранного филиала
    setUnreadCounts(prev => {
      const newMap = new Map(prev);
      newMap.delete(branch.branchId);
      return newMap;
    });
    // Загружаем чат для выбранного филиала (сообщения загрузятся из кеша или с сервера)
    loadChatForBranch(branch.branchId);
  }, [loadChatForBranch]);

  // Обновляем ref при изменении чата, чтобы обработчик Socket.IO всегда имел актуальные данные
  useEffect(() => {
    currentChatRef.current = chat;
  }, [chat]);
  
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Отправляем событие об активном чате на сервер
  // Для проверяющих используем selectedChat, для ответственных - chat
  useEffect(() => {
    if (!socket) return;
    
    const activeChatId = isChecker ? selectedChat?.id : chat?.id;
    
    if (activeChatId) {
      // Устанавливаем активный чат
      socket.emit('set_active_chat', { chatId: activeChatId });
    } else {
      // Очищаем активный чат при закрытии
      socket.emit('set_active_chat', { chatId: null });
    }
  }, [socket, selectedChat?.id, chat?.id, isChecker]);

  // Обработка Socket.IO событий
  useEffect(() => {
    const currentSocket = socket;
    const currentChat = isChecker ? selectedChat : chat;
    const currentChatId = currentChat?.id;
    // КРИТИЧНО: Для ответственных используем branchId из загруженного чата, а не из пропсов
    // Так как ответственный может работать на одном филиале, а быть назначенным на другом
    const effectiveBranchId = currentChat?.branchId;
    
    // Убрано избыточное логирование для оптимизации производительности
    
    if (!currentSocket) {
      socketHandlerRegistered.current = null;
      return;
    }
    
    // Для ответственных проверяем наличие chat с branchId из загруженного чата
    // Для проверяющих нужен currentChatId
    if (isChecker) {
    if (!currentChat || !currentChatId) {
      socketHandlerRegistered.current = null;
      return;
    }
    } else {
      // Для ответственных нужен chat с branchId из загруженного чата
      // Все ответственные находятся в одном чате по branchId, независимо от типа (ОТ или ПБ)
      // Важно: используем branchId из чата, если он есть, иначе из пропсов
      // Это позволяет обрабатывать статусные сообщения даже до загрузки чата
      const finalBranchId = effectiveBranchId || branchId;
      
      if (!finalBranchId) {
        socketHandlerRegistered.current = null;
      return;
      }
    }

    // Для ответственных используем branchId как идентификатор, для проверяющих - chatId
    // Это важно, так как для ответственных может быть несколько чатов с разными проверяющими, но один branchId
    // Все ответственные (ОТ и ПБ) находятся в одном чате по branchId
    // Для ответственных используем branchId из чата, если он есть, иначе из пропсов
    const finalBranchId = isChecker ? undefined : (effectiveBranchId || branchId);
    const handlerKey = isChecker ? (currentChatId || null) : (finalBranchId || currentChatId || null);
    
    // Если обработчик уже зарегистрирован для этого чата/филиала, не регистрируем повторно
    if (socketHandlerRegistered.current === handlerKey) {
      return;
    }

    // Удаляем предыдущие обработчики, если они были зарегистрированы для другого чата/филиала
    if (socketHandlerRegistered.current && socketHandlerRegistered.current !== handlerKey) {
      currentSocket.off('notification');
      currentSocket.off('new_message');
      currentSocket.off('user_typing');
      currentSocket.off('messages_read');
      socketHandlerRegistered.current = null;
    }

    // Объявляем обработчик сообщений до его использования
    const handleNewMessage = (data: any) => {
      // КРИТИЧНО: Получаем актуальные значения из ref, чтобы избежать проблем с устаревшими замыканиями
      const actualChat = isChecker ? selectedChatRef.current : currentChatRef.current;
      // Для проверяющих: используем branchId из чата, если он есть, или из списка филиалов, или из данных сообщения
      // Для ответственных: используем branchId из чата, если он есть, иначе из пропсов
      let actualBranchId: string | undefined;
      if (isChecker) {
        actualBranchId = actualChat?.branchId;
        // Если branchId не определен из чата, но есть в данных сообщения, используем его
        if (!actualBranchId && data.branchId) {
          actualBranchId = String(data.branchId);
        }
      } else {
        actualBranchId = actualChat?.branchId || branchId;
      }
      
      // Обработка события удаления сообщения
      if (data.type === 'SAFETY_JOURNAL_MESSAGE_DELETED') {
        const deleteChatIdMatch = data.chatId && actualChat?.id && String(data.chatId) === String(actualChat.id);
        const deleteBranchIdMatch = data.branchId && actualBranchId && String(data.branchId) === String(actualBranchId);
        
        // Проверяем, что удаление относится к текущему чату
        const isForCurrentChat = isChecker ? (deleteChatIdMatch || deleteBranchIdMatch) : deleteBranchIdMatch;
        
        if (isForCurrentChat && data.messageId) {
          // Удаляем сообщение из списка
          setMessages(prev => {
            const updated = prev.filter(m => m.id !== data.messageId);
            // Обновляем кеш
            if (actualChat?.id) {
              messagesCacheRef.current.set(actualChat.id, updated);
            }
            return updated;
          });
        }
        return; // Не обрабатываем дальше, если это событие удаления
      }
      
      // Определяем, является ли это статусным сообщением (оптимизация: используем функцию)
      const messageText = data.message?.message;
      const isStatusMessage = messageText && typeof messageText === 'string' && !!getStatusMessageType(messageText);
      
      // Проверяем, что это сообщение для текущего чата
      // Для проверяющих: data.chatId === actualChat.id или data.branchId совпадает
      // Для ответственных: data.branchId === actualBranchId (так как у них может быть другой chatId)
      // Все ответственные находятся в одном чате по branchId, независимо от типа (ОТ или ПБ)
      const chatIdMatch = data.chatId && actualChat?.id && String(data.chatId) === String(actualChat.id);
      // Для проверяющих: проверяем branchId даже если чат не открыт (используем branchId из данных сообщения)
      // Для ответственных: проверяем branchId из чата или пропсов (если чат еще не загружен, используем branchId из пропсов)
      const branchIdMatch = data.branchId && (
        actualBranchId ? String(data.branchId) === String(actualBranchId) :
        (isChecker ? branchesWithChats.some(b => String(b.branchId) === String(data.branchId)) :
         (branchId && String(data.branchId) === String(branchId)))
      );
      
      // Для ответственных проверяем только branchId, так как они все в одном чате по филиалу
      // Для проверяющих проверяем chatId или branchId
      // Для статусных сообщений у ответственных: всегда проверяем branchId из данных сообщения
      // Это важно, так как статусные сообщения могут прийти до загрузки чата или при несовпадении chatId
      // Для статусных сообщений проверяем, что branchId из данных совпадает с текущим branchId (из чата или пропсов)
      const statusBranchMatch = isStatusMessage && !isChecker && data.branchId && (
        (actualBranchId && String(data.branchId) === String(actualBranchId)) ||
        (!actualBranchId && branchId && String(data.branchId) === String(branchId))
      );
      
      // Упрощенная логика определения принадлежности сообщения текущему чату
      const isForCurrentChat = (() => {
        if (data.type !== 'SAFETY_JOURNAL_MESSAGE' || !data.message) return false;
        
        if (isChecker) {
          // Для проверяющих: сообщение должно быть для текущего чата или филиала
          // Важно: проверяем branchId даже если чат не загружен, чтобы получать сообщения от ответственных
          if (chatIdMatch) return true;
          if (branchIdMatch) return true;
          
          // Дополнительная проверка: если есть branchId в данных, проверяем его со всеми открытыми чатами
          if (data.branchId && branchesWithChats.length > 0) {
            const messageBranchId = String(data.branchId);
            const hasBranchInList = branchesWithChats.some(b => String(b.branchId) === messageBranchId);
            if (hasBranchInList) {
              // Если филиал есть в списке, но чат не открыт, все равно принимаем сообщение
              // Это позволяет получать сообщения даже если чат еще не открыт
              return true;
            }
          }
          
          return false;
        } else {
          // Для ответственных: сообщение должно быть для текущего филиала или статусное сообщение
          // Также проверяем branchId из пропсов, если actualBranchId не определен (чат еще не загружен)
          const branchIdFromProps = branchId && data.branchId && String(data.branchId) === String(branchId);
          return branchIdMatch || statusBranchMatch || branchIdFromProps;
        }
      })();
      
      if (!isForCurrentChat) {
        // Если сообщение пришло в другой чат (для проверяющих), увеличиваем счетчик непрочитанных
        if (isChecker && data.branchId && data.type === 'SAFETY_JOURNAL_MESSAGE' && data.message) {
          const messageBranchId = String(data.branchId);
          setUnreadCounts(prev => {
            const newMap = new Map(prev);
            const currentCount = newMap.get(messageBranchId) || 0;
            newMap.set(messageBranchId, currentCount + 1);
            return newMap;
          });
          
          // Обновляем lastMessage в списке филиалов (оптимизировано - только если филиал существует)
          if (data.message) {
            const newMessage = normalizeMessage(data.message);
            setBranchesWithChats(prev => {
              const branchIndex = prev.findIndex(b => b.branchId === messageBranchId);
              if (branchIndex === -1) return prev; // Филиал не найден, не обновляем
              
              const updated = [...prev];
              const updatedBranch = {
                ...updated[branchIndex],
                lastMessage: newMessage,
                updatedAt: newMessage.createdAt,
              };
              
              // Перемещаем филиал в начало списка (вверх)
              updated.splice(branchIndex, 1);
              updated.unshift(updatedBranch);
              
              return updated;
            });
          }
        }
        return;
      }
      
      // НЕ игнорируем сообщения от самого себя - они должны отображаться в real-time
      // Это важно для синхронизации между вкладками/устройствами и для подтверждения отправки
      // Сообщения об изменении статуса журнала должны отображаться всегда
      
      // Сообщение для текущего чата - обрабатываем его
      // data.message уже содержит объект с полями {id, message, sender, createdAt}
      const newMessage = normalizeMessage(data.message);
      
      // Определяем статус сообщения
      if (newMessage.readAt) {
        newMessage.status = 'read';
        } else {
        newMessage.status = 'sent';
      }
      
      // Проверяем, что newMessage правильно нормализован (только при ошибке)
      if (typeof newMessage.message !== 'string') {
        newMessage.message = String(newMessage.message || '');
      }
        
        setMessages(prev => {
          const messageId = String(newMessage.id);
          // Проверяем, нет ли уже такого сообщения
          if (prev.some(m => String(m.id) === messageId)) {
            // Если сообщение уже есть, обновляем его (на случай, если пришла обновленная версия)
            const updated = prev.map(m => String(m.id) === messageId ? newMessage : m);
            // Обновляем кеш
            if (actualChat?.id) {
              messagesCacheRef.current.set(actualChat.id, updated);
            }
            return updated;
          }
        
        // Дополнительная проверка перед добавлением (только при ошибке)
        if (typeof newMessage.message !== 'string') {
          return prev;
        }
        
        // ОПТИМИЗАЦИЯ: Предыдущие сообщения уже нормализованы при загрузке
        // Проверяем только новое сообщение и добавляем его
        // Нормализуем только если обнаружена проблема (что маловероятно)
        const hasInvalidMessages = prev.some(m => typeof m.message !== 'string');
        if (hasInvalidMessages) {
          // Только если есть проблемы, нормализуем все
          const normalizedPrev = prev.map(normalizeMessage).filter((msg: ChatMessage) => {
            return typeof msg.message === 'string';
          });
          // Удаляем дубликаты
          const uniquePrev = normalizedPrev.reduce((acc, msg) => {
            const msgId = String(msg.id);
            if (!acc.some(m => String(m.id) === msgId)) {
              acc.push(msg);
            }
            return acc;
          }, [] as ChatMessage[]);
          // Сортируем по дате и добавляем новое сообщение
          const allMessages = [...uniquePrev, newMessage].sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
          });
          // Обновляем кеш
          if (actualChat?.id) {
            messagesCacheRef.current.set(actualChat.id, allMessages);
          }
          return allMessages;
        }
        
        // В нормальном случае просто добавляем новое сообщение и сортируем
        const allMessages = [...prev, newMessage].sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateA - dateB;
        });
        // Обновляем кеш
        if (actualChat?.id) {
          messagesCacheRef.current.set(actualChat.id, allMessages);
        }
        return allMessages;
        });
        
        // Обновляем lastMessage в списке филиалов для проверяющего (если сообщение для текущего чата)
        if (isChecker && actualChat?.branchId && data.branchId) {
          const messageBranchId = String(data.branchId);
          setBranchesWithChats(prev => {
            const branchIndex = prev.findIndex(b => b.branchId === messageBranchId);
            if (branchIndex === -1) return prev;
            
            const updated = [...prev];
            const updatedBranch = {
              ...updated[branchIndex],
              lastMessage: newMessage,
              updatedAt: newMessage.createdAt,
            };
            
            // Перемещаем филиал в начало списка (вверх)
            updated.splice(branchIndex, 1);
            updated.unshift(updatedBranch);
            
            return updated;
          });
        }
        
        // Прокрутка вниз при получении нового сообщения через сокет - мгновенная
        requestAnimationFrame(() => {
          const scrollElement = scrollAreaRef.current;
          if (scrollElement) {
            const isNearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;
            if (isNearBottom) {
              scrollElement.scrollTop = scrollElement.scrollHeight;
            }
          }
        });

        // Отмечаем сообщения как прочитанные (только если сообщение не от нас)
      if (actualChat?.id && newMessage.senderId && newMessage.senderId !== user?.id) {
        authFetch(`${API}/jurists/safety/chat/chats/${actualChat.id}/read`, {
            method: 'POST',
          }).catch(() => {});
      }
    };

    // Обработка индикатора "печатает..."
    const handleUserTyping = (data: any) => {
      if (data.userId === user?.id) return; // Игнорируем собственные события
      
      const actualChat = isChecker ? selectedChatRef.current : currentChatRef.current;
      const actualBranchId = actualChat?.branchId || (isChecker ? undefined : branchId);
      
      // Проверяем по chatId (для обоих типов пользователей)
      if (data.chatId && actualChat?.id && String(data.chatId) === String(actualChat.id)) {
        if (data.typing) {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.set(data.userId, data.userName || 'Пользователь');
            return next;
          });
          // Автоматически убираем через 3 секунды
          setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Map(prev);
              next.delete(data.userId);
              return next;
            });
          }, 3000);
        } else {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.delete(data.userId);
            return next;
          });
        }
      } 
      // Для ответственного также проверяем по branchId (если chatId не совпал или чат еще не загружен)
      else if (!isChecker && data.branchId && actualBranchId && String(data.branchId) === String(actualBranchId)) {
        if (data.typing) {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.set(data.userId, data.userName || 'Пользователь');
            return next;
          });
          setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Map(prev);
              next.delete(data.userId);
              return next;
            });
          }, 3000);
        } else {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.delete(data.userId);
            return next;
          });
        }
      }
    };

    // Обработчик обновления статуса прочтения сообщений
    const handleMessagesRead = (data: { messages: Array<{ messageId: string; readAt: string }>; chatId: string; branchId: string }) => {
      const actualChat = isChecker ? selectedChat : chat;
      if (!actualChat || data.chatId !== actualChat.id) return;

      const messageIds = new Set(data.messages.map(m => m.messageId));
      const readAtMap = new Map(data.messages.map(m => [m.messageId, m.readAt]));

      setMessages(prev => {
        const updated = prev.map(m => {
          if (messageIds.has(m.id)) {
            const readAt = readAtMap.get(m.id);
            return {
              ...m,
              readAt: readAt || m.readAt,
              status: 'read' as const
            };
          }
          return m;
        });
        // Обновляем кеш
        if (actualChat?.id) {
          messagesCacheRef.current.set(actualChat.id, updated);
        }
        return updated;
      });
    };

    // Обрабатываем как 'notification' (для уведомлений), так и 'new_message' (для чата)
    currentSocket.on('notification', handleNewMessage);
    currentSocket.on('new_message', handleNewMessage); // Добавляем обработчик для sendChatMessage
    currentSocket.on('user_typing', handleUserTyping);
    currentSocket.on('messages_read', handleMessagesRead);
    socketHandlerRegistered.current = handlerKey;

    return () => {
      if (socketHandlerRegistered.current === handlerKey) {
        currentSocket.off('notification', handleNewMessage);
        currentSocket.off('new_message', handleNewMessage); // Удаляем обработчик для sendChatMessage
        currentSocket.off('user_typing', handleUserTyping);
        currentSocket.off('messages_read', handleMessagesRead);
        socketHandlerRegistered.current = null;
      }
      // Очищаем таймаут при размонтировании
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [socket, chat, selectedChat, isChecker, token, user?.id, branchId]);

  // Загрузка данных при монтировании
  // ОПТИМИЗАЦИЯ: Используем useRef для отслеживания, была ли уже выполнена начальная загрузка
  // И загружаем данные только когда компонент действительно виден (не сразу при монтировании)
  const initialLoadDone = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  // Ref для отслеживания предыдущего branchId
  const prevBranchIdRef = useRef<string | undefined>(branchId);
  // Ref для отслеживания, был ли уже открыт чат для конкретного филиала
  const branchChatOpenedRef = useRef(false);
  
  // Отслеживаем видимость компонента для ленивой загрузки
  useEffect(() => {
    // Небольшая задержка для оптимизации - загружаем данные после рендера
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    // Если уже загружали или еще не нужно загружать, не загружаем
    if (initialLoadDone.current || !shouldLoad) return;
    
    // Ждем, пока access и user загрузятся, чтобы правильно определить isChecker
    if (!stableAccess || !user) {
      return;
    }
    
    // Дополнительная проверка: убеждаемся, что isChecker определен правильно
    // ИСПРАВЛЕНО: Используем stableAccess вместо access для предотвращения ререндеров
    const userIsChecker = user.role === 'SUPERVISOR' || 
      (stableAccess.some(tool => tool.link === 'jurists/safety' && tool.accessLevel === 'FULL'));
    
    if (userIsChecker) {
      // Для проверяющего загружаем филиалы с чатами (но не загружаем чат сразу)
      loadBranchesWithChats();
    } else {
      // Для ответственного загружаем проверяющих (и автоматически откроется чат)
      loadCheckers();
    }
    
    initialLoadDone.current = true;
    prevBranchIdRef.current = branchId;
  }, [stableAccess, user, loadCheckers, loadBranchesWithChats, shouldLoad, branchId]);
  
  // Автоматическое открытие чата для конкретного филиала (для проверяющих)
  useEffect(() => {
    // Если это проверяющий, branchId передан, филиалы загружены, но чат еще не открыт
    if (isChecker && branchId && branchesWithChats.length > 0 && !branchChatOpenedRef.current) {
      // Ищем филиал в списке
      const targetBranch = branchesWithChats.find(b => b.branchId === branchId);
      if (targetBranch) {
        // Открываем чат для этого филиала
        branchChatOpenedRef.current = true;
        handleSelectBranch(targetBranch);
      }
    }
  }, [isChecker, branchId, branchesWithChats, handleSelectBranch]);

  // Загрузка чата при выборе проверяющего
  useEffect(() => {
    if (selectedChecker) {
      loadChat(selectedChecker);
    }
  }, [selectedChecker, loadChat]);

  // Перезагрузка чата при изменении branchId (для ответственных)
  useEffect(() => {
    // Проверяем, изменился ли branchId
    if (prevBranchIdRef.current !== branchId && branchId && initialLoadDone.current) {
      // Если branchId изменился и компонент уже был загружен, перезагружаем чат
      if (!isChecker) {
        // Для ответственных: очищаем состояние и перезагружаем проверяющих
        setSelectedChecker(null);
        setChat(null);
        setSelectedChat(null);
        setMessages([]);
        setAllParticipants([]);
        // Сбрасываем флаг начальной загрузки, чтобы перезагрузить
        initialLoadDone.current = false;
        // Перезагружаем проверяющих для нового филиала
        loadCheckers();
      } else {
        // Для проверяющих: сбрасываем флаг открытия чата, чтобы открыть чат для нового филиала
        branchChatOpenedRef.current = false;
      }
      prevBranchIdRef.current = branchId;
    }
  }, [branchId, isChecker, loadCheckers]);

  // Нормализованные сообщения для рендеринга
  // ОПТИМИЗАЦИЯ: Кешируем нормализованные сообщения, чтобы не нормализовать их заново
  const normalizedMessagesCache = useRef<Map<string, ChatMessage>>(new Map());
  
  const normalizedMessages = useMemo(() => {
    // ОПТИМИЗАЦИЯ: Нормализуем только новые сообщения, которые еще не в кеше
    const normalized = messages
      .map((msg: any) => {
        const msgId = String(msg?.id || '');
        
        // Проверяем кеш
        if (normalizedMessagesCache.current.has(msgId)) {
          const cached = normalizedMessagesCache.current.get(msgId)!;
          // Проверяем, не изменилось ли сообщение (сравниваем по message и status)
          if (cached.message === (typeof msg.message === 'string' ? msg.message : String(msg.message || '')) &&
              cached.status === msg.status &&
              cached.readAt === (msg.readAt ? String(msg.readAt) : null)) {
            return cached;
          }
        }
        
        // Нормализуем только если нет в кеше или изменилось
        const normalizedMsg = normalizeMessage(msg);
        
        // Дополнительная проверка после нормализации
        if (typeof normalizedMsg.message !== 'string') {
          normalizedMsg.message = String(normalizedMsg.message || '');
        }
        
        // Сохраняем в кеш
        normalizedMessagesCache.current.set(msgId, normalizedMsg);
        
        return normalizedMsg;
      })
      .filter((msg: ChatMessage) => {
        // Финальная проверка: message.message должен быть строкой
        if (typeof msg.message !== 'string') {
          return false;
        }
        const hasId = !!msg.id;
        // Показываем сообщение, если есть текст ИЛИ есть вложения
        const hasContent = msg.message.trim() !== '' || (msg.attachments && msg.attachments.length > 0);
        return hasId && hasContent;
      });
    
    // Очищаем кеш от сообщений, которых больше нет в списке
    // Ограничиваем размер кеша до 1000 сообщений для оптимизации памяти
    const currentIds = new Set(normalized.map(m => String(m.id)));
    const cacheEntries = Array.from(normalizedMessagesCache.current.entries());
    
    // Если кеш слишком большой, удаляем старые записи
    if (cacheEntries.length > 1000) {
      const toRemove = cacheEntries.slice(0, cacheEntries.length - 1000);
      toRemove.forEach(([id]) => normalizedMessagesCache.current.delete(id));
    }
    
    for (const [id] of normalizedMessagesCache.current) {
      if (!currentIds.has(id)) {
        normalizedMessagesCache.current.delete(id);
      }
    }
    
    return normalized;
  }, [messages]);

  // Прокрутка вниз при изменении сообщений
  const prevMessagesLengthRef = useRef(messages.length);
  const prevChatIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  
  useEffect(() => {
    // Сбрасываем флаг начальной загрузки при смене чата
    if (chat?.id !== prevChatIdRef.current) {
      isInitialLoadRef.current = true;
      prevChatIdRef.current = chat?.id || null;
      // Если чат сменился, очищаем предыдущую длину сообщений
      prevMessagesLengthRef.current = 0;
    }
    
    if (!scrollAreaRef.current || !chat?.id) return;
    
    const scrollElement = scrollAreaRef.current;
    const wasEmpty = prevMessagesLengthRef.current === 0;
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    
    // При первой загрузке или если чат был пуст - мгновенная прокрутка в конец
    if (isInitialLoadRef.current || wasEmpty) {
      requestAnimationFrame(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      });
      isInitialLoadRef.current = false;
    } 
    // При получении нового сообщения - прокручиваем только если пользователь уже внизу (в пределах 100px от конца)
    else if (isNewMessage) {
      const isNearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }
        });
      }
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, chat?.id]); // Зависим от длины сообщений и ID чата

  // Прокрутка к целевому сообщению из уведомления
  const targetMessageIdRef = useRef<string | undefined>(targetMessageId);
  useEffect(() => {
    if (targetMessageId) {
      targetMessageIdRef.current = targetMessageId;
    }
  }, [targetMessageId]);

  useEffect(() => {
    if (targetMessageIdRef.current && messages.length > 0 && scrollAreaRef.current) {
      // Ищем сообщение по ID
      const targetMessage = messages.find(m => String(m.id) === String(targetMessageIdRef.current));
      if (targetMessage) {
        // Находим индекс сообщения
        const messageIndex = normalizedMessages.findIndex(m => String(m.id) === String(targetMessageIdRef.current));
        if (messageIndex >= 0) {
          // Прокручиваем к сообщению с небольшой задержкой для рендеринга
          setTimeout(() => {
            if (targetMessageIdRef.current) {
              const messageId = String(targetMessageIdRef.current);
              const messageElement = messageRefsMap.current.get(messageId);
              if (messageElement && scrollAreaRef.current) {
                messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Подсветка сообщения
                messageElement.style.transition = 'background-color 0.3s ease';
                messageElement.style.backgroundColor = isDark ? 'rgba(77, 171, 247, 0.3)' : 'rgba(51, 154, 240, 0.2)';
                setTimeout(() => {
                  messageElement.style.backgroundColor = '';
                  setTimeout(() => {
                    messageElement.style.transition = '';
                  }, 300);
                }, 2000);
                // Очищаем targetMessageId после прокрутки
                targetMessageIdRef.current = undefined;
              }
            }
          }, 300);
        }
      }
    }
  }, [messages, normalizedMessages, isDark]);

  // Получение URL аватара (используем внешнюю функцию, если она предоставлена)
  const internalGetImageSrc = useCallback((image: string | null | undefined): string => {
    if (!image) return '';
    // Если это base64 (начинается с data:)
    if (image.startsWith('data:')) {
      return image;
    }
    // Если это base64 строка без префикса (обычно начинается с /9j/ для JPEG или iVBORw0KGgo для PNG)
    if (image.startsWith('/9j/') || image.startsWith('iVBORw0KGgo') || image.length > 100) {
      // Определяем тип изображения по началу строки
      const imageType = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
      return `data:${imageType};base64,${image}`;
    }
    return `${API}/public/${image}`;
  }, []);
  
  const getImageSrc = externalGetImageSrc || internalGetImageSrc;

  // Мемоизация функции для повторной отправки сообщений
  // Используем ref для failedMessages, чтобы избежать пересоздания функции
  const failedMessagesRef = useRef(failedMessages);
  useEffect(() => {
    failedMessagesRef.current = failedMessages;
  }, [failedMessages]);
  
  const handleRetrySend = useCallback((messageId: string) => {
    const failedMsg = failedMessagesRef.current.get(messageId);
    if (failedMsg) {
      sendMessage(failedMsg.message, messageId);
    }
  }, [sendMessage]);

  // Загрузка дополнительных сообщений (пагинация)
  const loadMoreMessages = useCallback(async () => {
    if (!chat?.id || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    try {
      await loadMessages(chat.id, messagesPage + 1, true);
      setMessagesPage(prev => prev + 1);
    } catch (error) {
      // Ошибка загрузки дополнительных сообщений
    } finally {
      setIsLoadingMore(false);
    }
  }, [chat?.id, isLoadingMore, hasMoreMessages, messagesPage, loadMessages]);

  // Intersection Observer для автоматической подгрузки сообщений при прокрутке вверх
  useEffect(() => {
    if (!loadMoreRef.current || !hasMoreMessages || isLoadingMore) return;
    
    const scrollElement = scrollAreaRef.current?.querySelector('[data-scroll-viewport]') || scrollAreaRef.current;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !isLoadingMore) {
          loadMoreMessages();
        }
      },
      { 
        threshold: 0.1, 
        rootMargin: '100px',
        root: scrollElement || null
      }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreMessages, isLoadingMore, loadMoreMessages]);

  // Поиск по сообщениям
  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }
    
    const results: number[] = [];
    normalizedMessages.forEach((msg, index) => {
      if (msg.message.toLowerCase().includes(query.toLowerCase())) {
        results.push(index);
      }
    });
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    if (results.length > 0) {
      scrollToMessageIndex(results[0]);
    }
  }, [normalizedMessages]);

  // Обработка изменений поискового запроса
  useEffect(() => {
    if (debouncedSearchQuery) {
      handleSearch(debouncedSearchQuery);
    } else {
      setSearchResults([]);
      setCurrentSearchIndex(0);
    }
  }, [debouncedSearchQuery, handleSearch]);

  // Централизованная функция прокрутки к сообщению по ID
  const scrollToMessage = useCallback((messageId: string, highlight: boolean = false) => {
    const messageElement = messageRefsMap.current.get(messageId);
    if (messageElement && scrollAreaRef.current) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      if (highlight) {
        // Подсветка сообщения
        messageElement.style.transition = 'background-color 0.3s ease';
        messageElement.style.backgroundColor = isDark ? 'rgba(77, 171, 247, 0.3)' : 'rgba(51, 154, 240, 0.2)';
        setTimeout(() => {
          messageElement.style.backgroundColor = '';
          setTimeout(() => {
            messageElement.style.transition = '';
          }, 300);
        }, 2000);
      }
    }
  }, [isDark]);

  // Прокрутка к сообщению по индексу (использует централизованную функцию)
  const scrollToMessageIndex = useCallback((index: number) => {
    if (index >= 0 && index < normalizedMessages.length) {
      const message = normalizedMessages[index];
      if (message?.id) {
        scrollToMessage(String(message.id), true);
      }
    }
  }, [normalizedMessages, scrollToMessage]);

  // Навигация по результатам поиска
  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    
    const newIndex = direction === 'next' 
      ? (currentSearchIndex + 1) % searchResults.length
      : (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    
    setCurrentSearchIndex(newIndex);
    scrollToMessageIndex(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToMessageIndex]);

  // Отслеживание скролла для показа кнопки "Прокрутить вниз"
  useEffect(() => {
    const handleScroll = () => {
      if (scrollAreaRef.current) {
        const element = scrollAreaRef.current;
        const { scrollTop, scrollHeight, clientHeight } = element;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        setShowScrollToBottom(distanceFromBottom > 500);
      }
    };
    
    const scrollElement = scrollAreaRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Прокрутка вниз
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Сжатие изображений перед отправкой
  const compressImage = useCallback(async (file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }, []);

  // Обработка цитирования сообщения
  const handleQuoteMessage = useCallback((message: ChatMessage) => {
    setQuotedMessage(message);
    // Прокручиваем к полю ввода, чтобы пользователь увидел цитируемое сообщение
    setTimeout(() => {
      const inputContainer = document.querySelector('[data-message-input-container]');
      if (inputContainer) {
        inputContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      // Фокусируемся на поле ввода
      const textarea = inputContainer?.querySelector('textarea');
      if (textarea) {
        textarea.focus();
      }
    }, 100);
  }, []);

  // Обработчики для редактирования и удаления сообщений
  // ВАЖНО: Объявляем ДО использования в messagesElements useMemo
  const handleEditMessage = useCallback(async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    // Сначала устанавливаем messageText, затем editingMessageId
    // Это гарантирует, что при перемонтировании MessageInput initialValue будет правильным
    setMessageText(message.message);
    // Используем setTimeout, чтобы убедиться, что messageText обновился перед перемонтированием
    setTimeout(() => {
      setEditingMessageId(messageId);
      // Прокручиваем к полю ввода после небольшой задержки
      setTimeout(() => {
        const textarea = document.querySelector('textarea[placeholder="Введите сообщение..."]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.focus();
          textarea.scrollIntoView({ behavior: 'smooth', block: 'end' });
          // Устанавливаем курсор в конец текста
          const length = textarea.value.length;
          textarea.setSelectionRange(length, length);
        }
      }, 50);
    }, 0);
  }, [messages]);
  
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessageToDelete(messageId);
    setDeleteModalOpened(true);
  }, []);

  const confirmDeleteMessage = useCallback(async () => {
    if (!messageToDelete) return;
    
    const currentChat = isChecker ? selectedChat : chat;
    if (!currentChat || !token) return;
    
    try {
      const response = await authFetch(`${API}/jurists/safety/chat/chats/${currentChat.id}/messages/${messageToDelete}`, {
        method: 'DELETE',
      });
      
      if (response && response.ok) {
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== messageToDelete);
          // Обновляем кеш
          if (currentChat.id) {
            messagesCacheRef.current.set(currentChat.id, updated);
          }
          return updated;
        });
        setDeleteModalOpened(false);
        setMessageToDelete(null);
      } else {
        if (response) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          notificationSystem.addNotification('Ошибка', `Ошибка при удалении сообщения: ${errorData.error || response.statusText || 'Unknown error'}`, 'error');
        } else {
          notificationSystem.addNotification('Ошибка', 'Ошибка при удалении сообщения: No response', 'error');
        }
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при удалении сообщения', 'error');
    }
  }, [messageToDelete, isChecker, selectedChat, chat, token]);

  // Мемоизация списка элементов сообщений (чтобы не перерендеривался при изменении messageText)
  const messagesElements = useMemo(() => {
    if (normalizedMessages.length === 0) return null;
    
    const elements: React.ReactElement[] = [];
    let lastDate: string | null = null;
    
    normalizedMessages.forEach((message, index) => {
      // Определяем дату сообщения
      let messageDate: string | null = null;
      try {
        const createdAt = message.createdAt as any;
        const date = typeof createdAt === 'string' 
          ? createdAt 
          : createdAt instanceof Date 
          ? createdAt.toISOString()
          : String(createdAt || new Date());
        messageDate = dayjs(date).format('YYYY-MM-DD');
      } catch (e) {
        messageDate = null;
      }
      
      // Если дата изменилась, добавляем badge с датой
      if (messageDate && messageDate !== lastDate) {
        const displayDate = (() => {
          try {
            const createdAt = message.createdAt as any;
            const date = typeof createdAt === 'string' 
              ? createdAt 
              : createdAt instanceof Date 
              ? createdAt.toISOString()
              : String(createdAt || new Date());
            const today = dayjs();
            const msgDate = dayjs(date);
            
            if (msgDate.isSame(today, 'day')) {
              return 'Сегодня';
            } else if (msgDate.isSame(today.subtract(1, 'day'), 'day')) {
              return 'Вчера';
            } else if (msgDate.isSame(today, 'year')) {
              return msgDate.format('D MMMM');
            } else {
              return msgDate.format('D MMMM YYYY');
            }
          } catch (e) {
            return messageDate || '';
          }
        })();
        
        elements.push(
          <Box key={`date-${messageDate}-${index}`} style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', width: '100%' }}>
            <Badge 
              variant="light" 
              size="sm"
              style={{
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: isDark ? '#ffffff' : '#000000',
                fontWeight: 500,
                padding: '4px 12px',
              }}
            >
              {displayDate}
            </Badge>
      </Box>
    );
        
        lastDate = messageDate;
      }
      
      // Проверяем, является ли это сообщение результатом поиска
      const isSearchResult = searchResults.includes(index);
      const isCurrentSearchResult = searchResults[currentSearchIndex] === index;
      
      // Добавляем сообщение
      elements.push(
        <Box
          key={message.id}
          ref={(el) => {
            if (el) {
              messageRefsMap.current.set(String(message.id), el);
            } else {
              messageRefsMap.current.delete(String(message.id));
            }
          }}
          data-message-id={message.id}
          data-message-index={index}
          style={{
            backgroundColor: isCurrentSearchResult 
              ? (isDark ? 'rgba(255, 255, 0, 0.2)' : 'rgba(255, 255, 0, 0.3)')
              : isSearchResult
              ? (isDark ? 'rgba(255, 255, 0, 0.1)' : 'rgba(255, 255, 0, 0.15)')
              : 'transparent',
            transition: 'background-color 0.3s ease',
          }}
        >
          <ChatMessageItem
            message={message}
            prevMessage={index > 0 ? normalizedMessages[index - 1] : null}
            isOwn={String(message.senderId) === String(user?.id)}
            isDark={isDark}
            onRetrySend={handleRetrySend}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
            onQuote={handleQuoteMessage}
            messageRefsMap={messageRefsMap}
            onPreviewAttachments={(attachments, index) => {
            const previewAttachments = attachments.map((att) => {
              // Правильно формируем URL для предпросмотра с кодированием имени файла
              let fileUrl = att.fileUrl;
              if (!fileUrl.startsWith('http')) {
                if (fileUrl.startsWith('/')) {
                  // Кодируем имя файла в URL (для пробелов, скобок и других спецсимволов)
                  const pathParts = fileUrl.split('/');
                  const fileName = pathParts[pathParts.length - 1];
                  const directory = pathParts.slice(0, -1).join('/');
                  const encodedFileName = encodeURIComponent(fileName);
                  fileUrl = `${API}/public${directory}/${encodedFileName}`;
                } else {
                  const encodedFileName = encodeURIComponent(fileUrl);
                  fileUrl = `${API}/public/${encodedFileName}`;
                }
              }
              return {
                id: att.id,
                source: fileUrl,
                name: att.fileName,
                mimeType: att.mimeType,
              };
            });
            if (externalOnPreviewFiles) {
              externalOnPreviewFiles(previewAttachments, index);
            } else {
              setPreviewFiles(previewAttachments);
              setPreviewIndex(index);
              setPreviewOpened(true);
            }
          }}
        />
        </Box>
      );
    });
    
    return elements;
  }, [normalizedMessages, user?.id, isDark, handleRetrySend, handleEditMessage, handleDeleteMessage, searchResults, currentSearchIndex]);


  // Мемоизация цветов для поля ввода
  const inputBorderColor = useMemo(() => 
    isDark ? theme.colors.dark[4] : theme.colors.gray[3],
    [isDark, theme.colors.dark, theme.colors.gray]
  );
  const inputBackgroundColor = useMemo(() => 
    isDark ? '#2b2b2b' : '#f5f5f5',
    [isDark]
  );
  const inputContainerBorderColor = useMemo(() => 
    isDark ? theme.colors.dark[4] : theme.colors.gray[3],
    [isDark, theme.colors.dark, theme.colors.gray]
  );
  const inputContainerBackgroundColor = useMemo(() => 
    isDark ? '#1e1e1e' : '#ffffff',
    [isDark]
  );

  // Мемоизация обработчиков для поля ввода
  // КРИТИЧНО: Теперь onSend принимает текст напрямую, не используем state для ввода
  const handleSendMessage = useCallback((text: string, files?: File[]) => {
    sendMessage(text, undefined, files);
    setMessageText(''); // Очищаем state только после отправки
    setQuotedMessage(null); // Очищаем цитату после отправки
    // Очищаем вложения после отправки
    if (files && files.length > 0) {
      setAttachments([]);
    }
  }, [sendMessage]);

  // Обработчик для отправки события "печатает..."
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTyping = useCallback(() => {
    if (!socket || !user?.id) return;
    
    const currentChat = isChecker ? selectedChat : chat;
    
    // Для ответственного используем branchId из пропсов, если чат еще не загружен
    const chatId = currentChat?.id;
    const branchIdToSend = currentChat?.branchId || (isChecker ? undefined : branchId);
    
    if (!chatId && !branchIdToSend) return; // Нет данных для отправки
    
    // Отправляем событие через Socket.IO
    socket.emit('user_typing', {
      chatId: chatId,
      branchId: branchIdToSend,
      typing: true,
    });
    
    // Очищаем предыдущий таймаут
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Отправляем событие "перестал печатать" через 3 секунды бездействия
    typingTimeoutRef.current = setTimeout(() => {
      if (socket) {
        socket.emit('user_typing', {
          chatId: chatId,
          branchId: branchIdToSend,
          typing: false,
        });
      }
    }, 3000);
  }, [socket, user?.id, isChecker, selectedChat, chat, branchId]);
  
  const handleEmojiClick = useCallback(() => {
    // Эмодзи теперь вставляется напрямую в textarea через ref в MessageInput
    setShowEmojiPicker(false);
  }, []);
  
  const handleToggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker(prev => !prev);
  }, []);
  
  const handleSaveEdit = useCallback(async (text: string, files?: File[]) => {
    if (!editingMessageId) return;
    
    const currentChat = isChecker ? selectedChat : chat;
    if (!currentChat || !token) return;
    
    const newText = text.trim();
    if (!newText) return;
    
    // Редактирование не поддерживает файлы, только текст
    if (files && files.length > 0) {
    }
    
    try {
      const response = await authFetch(`${API}/jurists/safety/chat/chats/${currentChat.id}/messages/${editingMessageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newText,
        }),
      });
      
      if (response && response.ok) {
        const updatedMessage = await response.json();
        setMessages(prev => {
          const updated = prev.map(m => 
            m.id === editingMessageId ? { ...normalizeMessage(updatedMessage), isEdited: true } : m
          );
          // Обновляем кеш
          if (currentChat.id) {
            messagesCacheRef.current.set(currentChat.id, updated);
          }
          return updated;
        });
        setEditingMessageId(null);
        setMessageText('');
      } else if (response) {
        await response.text(); // Игнорируем текст ошибки
      }
    } catch (error) {
    }
  }, [editingMessageId, isChecker, selectedChat, chat, token]);
  
  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setMessageText('');
  }, []);
  
  const handleFilesSelect = useCallback(async (files: File[] | null) => {
    if (files) {
      try {
        // Сжимаем только изображения, остальные файлы оставляем как есть
        const processedFiles = await Promise.all(
          files.map(async (file) => {
            try {
              // Сжимаем только изображения
              if (file.type.startsWith('image/')) {
                return await compressImage(file);
              }
              // Для всех остальных типов файлов возвращаем как есть
              return file;
            } catch (error) {
              // В случае ошибки при сжатии возвращаем оригинальный файл
              return file;
            }
          })
        );
        setAttachments(prev => [...prev, ...processedFiles]);
      } catch (error) {
        // В случае общей ошибки все равно добавляем файлы
        setAttachments(prev => [...prev, ...files]);
      }
    }
  }, [compressImage]);
  
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);


  return (
    <Box style={{ display: 'flex', height: '100%', backgroundColor: isDark ? theme.colors.dark[7] : theme.colors.gray[0], position: 'relative' }}>
      {loading && (
        <LoadingOverlay 
          visible={true} 
          loaderProps={{ size: 'md', variant: 'dots' }}
          overlayProps={{ opacity: 0.8 }}
        />
      )}
      {/* Левая колонка - список филиалов (только для проверяющего) */}
      {isChecker && (
      <Box style={{ width: '300px', borderRight: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: isDark ? theme.colors.dark[8] : theme.colors.gray[0] }}>
        <Box p="md" style={{ borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}` }}>
          <TextInput
            placeholder="Поиск филиалов..."
            value={branchSearchQuery}
            onChange={(e) => setBranchSearchQuery(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            size="sm"
            styles={{
              input: {
                backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[1],
                border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
              }
            }}
          />
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={0}>
            {/* Для проверяющего показываем филиалы с чатами */}
            {filteredBranches.map((branch) => (
              <BranchItem
                  key={branch.branchId}
                branch={branch}
                isSelected={selectedBranch?.branchId === branch.branchId}
                unreadCount={unreadCounts.get(branch.branchId) || 0}
                isDark={isDark}
                theme={theme}
                onSelect={handleSelectBranch}
              />
              ))}
          </Stack>
        </ScrollArea>
      </Box>
      )}

      {/* Правая колонка - чат */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isChecker && selectedBranch ? (
          selectedChat ? (
            <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Заголовок чата (филиала) */}
              <Box p="xs" px="sm" style={{ borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}` }}>
                <Stack gap={6}>
                  {/* Первая строка: Название филиала, участники и кнопки действий */}
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                      <Popover
                        opened={participantsPopoverOpened}
                        onChange={setParticipantsPopoverOpened}
                        position="bottom-start"
                        withArrow
                        shadow="md"
                        withinPortal
                        zIndex={100001}
                      >
                        <Popover.Target>
                          <Stack 
                            gap={0} 
                            style={{ cursor: 'pointer', flex: 1, userSelect: 'none' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setParticipantsPopoverOpened(!participantsPopoverOpened);
                            }}
                          >
                            <Text fw={600} size="md" style={{ lineHeight: 1.2 }}>
                              {selectedBranch?.branchName || ''}
                            </Text>
                            {allParticipantsForChecker.length > 0 && (
                              <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                                {allParticipantsForChecker.length} {allParticipantsForChecker.length === 1 ? 'участник' : allParticipantsForChecker.length < 5 ? 'участника' : 'участников'}
                              </Text>
                            )}
                          </Stack>
                        </Popover.Target>
                      <Popover.Dropdown style={{ padding: '12px', minWidth: '280px', maxWidth: '400px', zIndex: 100001 }}>
                        <Stack gap="xs">
                          <Text fw={600} size="sm" mb={4}>
                            Участники чата ({allParticipantsForChecker.length})
                          </Text>
                          <Divider />
                          {allParticipantsForChecker.length > 0 ? (
                            (() => {
                              const uniqueParticipants = Array.from(
                                new Map(allParticipantsForChecker.map(p => [p.id, p])).values()
                              );
                              return uniqueParticipants.map((p) => {
                                const responsibilityTypes = p.responsibilityTypes || [];
                                // Используем только флаг isChecker из бэкенда
                                const isChecker = p.isChecker === true;
                                
                                return (
                                  <Group key={p.id} gap="sm" wrap="nowrap" style={{ padding: '4px 0' }}>
                                    <Avatar 
                                      src={getImageSrc(p.image || null)} 
                                      size="md" 
                                      radius="xl"
                                    >
                                      {p.name?.charAt(0).toUpperCase() || '?'}
                                    </Avatar>
                                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                      <Group gap="xs" wrap="nowrap">
                                        <Text fw={isChecker ? 500 : 400} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {p.name || p.email || 'Неизвестно'}
                                        </Text>
                                        {isChecker && (
                                          <Badge size="xs" variant="light" color="blue">
                                            Проверяющий
                                          </Badge>
                                        )}
                                        {responsibilityTypes.length > 0 && (
                                          <>
                                            {responsibilityTypes.includes('ОТ') && (
                                              <Badge size="xs" variant="light" color="orange">
                                                ОТ
                                              </Badge>
                                            )}
                                            {responsibilityTypes.includes('ПБ') && (
                                              <Badge size="xs" variant="light" color="red">
                                                ПБ
                                              </Badge>
                                            )}
                                          </>
                                        )}
                                      </Group>
                                      {p.email && (
                                        <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {p.email}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Group>
                                );
                              });
                            })()
                          ) : (
                            <Text size="sm" c="dimmed" style={{ textAlign: 'center', padding: '8px' }}>
                              Нет участников
                            </Text>
                          )}
                        </Stack>
                      </Popover.Dropdown>
                    </Popover>
                    <Popover
                      opened={journalsPopoverOpened}
                      onChange={setJournalsPopoverOpened}
                      position="bottom-start"
                      withArrow
                      shadow="md"
                      withinPortal
                      zIndex={100001}
                    >
                      <Popover.Target>
                        <Group
                          gap={4}
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setJournalsPopoverOpened(!journalsPopoverOpened);
                          }}
                        >
                          <IconFileText size={16} style={{ color: isDark ? theme.colors.gray[5] : theme.colors.gray[7] }} />
                          <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                            {branchJournals.filter(j => j.status === 'approved').length}/{branchJournals.length || 0}
                          </Text>
                        </Group>
                      </Popover.Target>
                      <Popover.Dropdown style={{ padding: '8px', minWidth: '280px', maxWidth: '400px', zIndex: 100001 }}>
                        <Stack gap={4}>
                          <Text fw={600} size="xs" mb={0}>
                            Журналы филиала ({branchJournals.length})
                          </Text>
                          <Divider size="xs" />
                          {journalsLoading ? (
                            <Box style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
                              <Loader size="xs" />
                            </Box>
                          ) : sortedBranchJournals.length > 0 ? (
                            <ScrollArea 
                              h={sortedBranchJournals.length > 6 ? 420 : undefined}
                              type="auto"
                              styles={{
                                viewport: {
                                  maxHeight: sortedBranchJournals.length > 6 ? '420px' : 'none',
                                }
                              }}
                            >
                              <Stack gap={4}>
                                {sortedBranchJournals.map((journal) => {
                                  const isApproved = journal.status === 'approved';
                                  const statusColors: Record<string, string> = {
                                    approved: isDark ? theme.colors.gray[6] : theme.colors.gray[4], // Приглушенный цвет для одобренных
                                    pending: isDark ? theme.colors.yellow[7] : theme.colors.yellow[6],
                                    rejected: isDark ? theme.colors.red[7] : theme.colors.red[6],
                                    under_review: isDark ? theme.colors.blue[7] : theme.colors.blue[6],
                                  };
                                  const statusLabels: Record<string, string> = {
                                    approved: 'Принят',
                                    pending: 'Ожидает',
                                    rejected: 'Отклонен',
                                    under_review: 'На проверке',
                                  };
                                  return (
                                    <Box 
                                      key={journal.id} 
                                      style={{ 
                                        padding: '6px 8px', 
                                        borderRadius: '4px', 
                                        backgroundColor: isApproved 
                                          ? (isDark ? theme.colors.dark[5] : theme.colors.gray[0]) // Приглушенный фон для одобренных
                                          : (isDark ? theme.colors.dark[6] : theme.colors.gray[1]),
                                        opacity: isApproved ? 0.7 : 1 // Приглушенная прозрачность для одобренных
                                      }}
                                    >
                                      <Stack gap={4}>
                                        <Text 
                                          fw={isApproved ? 400 : 500} 
                                          size="xs" 
                                          c={isApproved ? 'dimmed' : undefined}
                                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}
                                        >
                                          {journal.journal_title}
                                        </Text>
                                        <Group gap={4} wrap="nowrap">
                                          <Badge size="xs" variant="light" color={journal.journal_type === 'ОТ' ? 'orange' : 'red'}>
                                            {journal.journal_type}
                                          </Badge>
                                          <Badge size="xs" variant="light" color={statusColors[journal.status] || 'gray'}>
                                            {statusLabels[journal.status] || journal.status}
                                          </Badge>
                                        </Group>
                                        {(journal.period_start || journal.period_end) && (
                                          <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                                            {journal.period_start && journal.period_end 
                                              ? `${dayjs(journal.period_start).format('DD.MM.YYYY')} - ${dayjs(journal.period_end).format('DD.MM.YYYY')}`
                                              : journal.period_start 
                                              ? `с ${dayjs(journal.period_start).format('DD.MM.YYYY')}`
                                              : journal.period_end
                                              ? `до ${dayjs(journal.period_end).format('DD.MM.YYYY')}`
                                              : ''}
                                          </Text>
                                        )}
                                      </Stack>
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </ScrollArea>
                            ) : (
                              <Text size="xs" c="dimmed" style={{ textAlign: 'center', padding: '6px' }}>
                                Нет журналов
                              </Text>
                            )}
                          </Stack>
                        </Popover.Dropdown>
                      </Popover>
                    </Group>
                    <Group gap={4}>
                      <Tooltip label="Поиск по сообщениям">
                        <ActionIcon
                          variant={showSearch ? 'filled' : 'subtle'}
                          onClick={() => setShowSearch(!showSearch)}
                          size="sm"
                        >
                          <IconSearch size={16} />
                        </ActionIcon>
                      </Tooltip>
                      {showScrollToBottom && (
                        <Tooltip label="Прокрутить вниз">
                          <ActionIcon
                            variant="subtle"
                            onClick={scrollToBottom}
                            size="sm"
                          >
                            <IconArrowDown size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                  
                  {/* Поиск по сообщениям */}
                  {showSearch && (
                    <Group gap={4}>
                      <TextInput
                        placeholder="Поиск по сообщениям..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        leftSection={<IconSearch size={14} />}
                        rightSection={
                          searchResults.length > 0 ? (
                            <Group gap={4}>
                              <Text size="xs" c="dimmed">
                                {currentSearchIndex + 1} / {searchResults.length}
                              </Text>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                onClick={() => navigateSearch('prev')}
                                disabled={searchResults.length === 0}
                              >
                                <IconArrowDown size={12} style={{ transform: 'rotate(90deg)' }} />
                              </ActionIcon>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                onClick={() => navigateSearch('next')}
                                disabled={searchResults.length === 0}
                              >
                                <IconArrowDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                              </ActionIcon>
                            </Group>
                          ) : null
                        }
                        size="xs"
                        style={{ flex: 1 }}
                      />
                      {searchQuery && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  )}
                </Stack>
              </Box>

              {/* Сообщения */}
              <ScrollArea 
                style={{ flex: 1 }} 
                viewportRef={scrollAreaRef}
                styles={{
                  viewport: {
                    backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
                  }
                }}
              >
                <Stack gap={0} p="md" style={{ width: '100%' }} ref={parentRef}>
                  {/* Индикатор загрузки дополнительных сообщений */}
                  {isLoadingMore && (
                    <Box style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                      <Loader size="sm" variant="dots" />
                    </Box>
                  )}
                  
                  {/* Элемент для Intersection Observer (загрузка при прокрутке вверх) */}
                  {hasMoreMessages && !isLoadingMore && (
                    <div ref={loadMoreRef} style={{ height: '1px' }} />
                  )}
                  
                  {normalizedMessages.length === 0 ? (
                    <Box style={{ textAlign: 'center', padding: '2rem' }}>
                      <IconMessageDots size={48} style={{ opacity: 0.3 }} />
                      <Text c="dimmed" mt="md">Нет сообщений. Начните общение!</Text>
                    </Box>
                  ) : (
                    // Используем мемоизированный список сообщений для оптимизации производительности
                    messagesElements
                  )}
                      <div ref={messagesEndRef} />
                    </Stack>
                  </ScrollArea>
                  
                  {/* Кнопка прокрутки вниз (плавающая) */}
                  {showScrollToBottom && (
                    <Tooltip label="Прокрутить вниз">
                      <ActionIcon
                                    style={{
                          position: 'absolute',
                          bottom: 100,
                          right: 20,
                          zIndex: 1000,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                        variant="filled"
                        color="blue"
                        size="lg"
                                        radius="xl"
                        onClick={scrollToBottom}
                                      >
                        <IconArrowDown size={20} />
                      </ActionIcon>
                    </Tooltip>
                                    )}

                  {/* Индикатор "печатает..." */}
                  {typingUsers.size > 0 && (
                                    <Box
                      px="md" 
                      py="xs" 
                                      style={{
                        opacity: 0.7,
                        position: 'sticky',
                        bottom: 0,
                        backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 10,
                      }}
                    >
                      <Group gap={4} align="center">
                        <Loader size="xs" variant="dots" />
                        <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                          {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'печатает' : 'печатают'}...
                        </Text>
                      </Group>
                    </Box>
                  )}
                  
                  {/* Отображение режима редактирования над полем ввода */}
                  {editingMessageId && (
                    <Box
                      px="md"
                      pt="xs"
                      pb="xs"
                                          style={{ 
                        backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                      }}
                    >
                      <Box
                        p="xs"
                                        style={{ 
                          backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                          width: '100%',
                          minHeight: '50px',
                          display: 'flex',
                          alignItems: 'flex-start',
                        }}
                      >
                                      <Group 
                          gap="xs" 
                          align="flex-start"
                          style={{ width: '100%', margin: 0 }}
                          wrap="nowrap"
                        >
                          <IconEdit 
                            size={18} 
                            style={{ 
                              color: isDark ? '#4dabf7' : '#339af0',
                              flexShrink: 0,
                              marginTop: '2px'
                            }} 
                          />
                          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ margin: 0 }}>
                              Редактирование сообщения
                            </Text>
                            {(() => {
                              const editingMessage = messages.find(m => m.id === editingMessageId);
                              if (editingMessage) {
                                return (
                                        <Text 
                                    size="sm" 
                                    c={isDark ? '#ffffff' : '#000000'}
                                          style={{ 
                                      opacity: 0.9,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      lineHeight: 1.4,
                                      margin: 0
                                    }}
                                  >
                                    {editingMessage.message || (editingMessage.attachments && editingMessage.attachments.length > 0 
                                      ? `📎 ${editingMessage.attachments.length} ${editingMessage.attachments.length === 1 ? 'файл' : 'файлов'}`
                                      : 'Сообщение')}
                                  </Text>
                                );
                              }
                              return null;
                                  })()}
                          </Stack>
                          <ActionIcon
                            size="md"
                            variant="subtle"
                            onClick={handleCancelEdit}
                            title="Отменить редактирование"
                            style={{ flexShrink: 0, margin: 0 }}
                            color="gray"
                          >
                            <IconX size={18} />
                          </ActionIcon>
                                      </Group>
                                    </Box>
                                  </Box>
                          )}

                  {/* Отображение вложений над полем ввода */}
                  {attachments && attachments.length > 0 && (
                  <Box 
                      px="md"
                      pt="xs"
                      pb="xs"
                    style={{ 
                        backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                      }}
                    >
                      <Box
                        p="xs"
                        style={{
                          backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                          width: '100%',
                          minHeight: '50px',
                          display: 'flex',
                          alignItems: 'flex-start',
                        }}
                      >
                        <Group 
                          gap="xs" 
                          align="flex-start"
                          style={{ width: '100%', margin: 0 }}
                          wrap="wrap"
                        >
                          <IconPaperclip 
                            size={18} 
                            style={{ 
                              color: isDark ? '#4dabf7' : '#339af0',
                              flexShrink: 0,
                              marginTop: '2px'
                            }} 
                          />
                          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ margin: 0 }}>
                              Прикрепленные файлы ({attachments.length})
                            </Text>
                            <Group gap="xs" wrap="wrap" style={{ margin: 0 }}>
                              {attachments.map((file, index) => {
                                const formatFileSize = (bytes: number) => {
                                  if (bytes < 1024) return `${bytes} Б`;
                                  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
                                  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
                                };
                                
                                return (
                                  <Badge
                                    key={index}
                                    variant="light"
                                    size="sm"
                                    leftSection={<IconFile size={12} />}
                                    rightSection={
                                      <Group gap={2}>
                                        {externalOnPreviewFiles && (
                      <ActionIcon
                                            size="xs"
                                            variant="transparent"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const previewAttachments = attachments.map((f, i) => ({
                                                id: `preview-${i}`,
                                                source: f,
                                                name: f.name,
                                                mimeType: f.type,
                                              }));
                                              externalOnPreviewFiles(previewAttachments, index);
                                            }}
                                            title="Предпросмотр"
                                          >
                                            <IconEye size={10} />
                      </ActionIcon>
                                        )}
                                        {handleRemoveAttachment && (
                                          <ActionIcon
                                            size="xs"
                                            variant="transparent"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveAttachment(index);
                                            }}
                                            title="Удалить"
                                          >
                                            <IconX size={10} />
                                          </ActionIcon>
                                        )}
                                      </Group>
                                    }
                                    title={`${file.name} (${formatFileSize(file.size)})`}
                                    style={{ cursor: externalOnPreviewFiles ? 'pointer' : 'default' }}
                                    onClick={externalOnPreviewFiles ? () => {
                                      const previewAttachments = attachments.map((f, i) => ({
                                        id: `preview-${i}`,
                                        source: f,
                                        name: f.name,
                                        mimeType: f.type,
                                      }));
                                      externalOnPreviewFiles(previewAttachments, index);
                                    } : undefined}
                                  >
                                    <Text size="xs" truncate style={{ maxWidth: '150px' }}>
                                      {file.name}
                                    </Text>
                                  </Badge>
                                );
                              })}
                            </Group>
                          </Stack>
                    </Group>
                  </Box>
                    </Box>
                  )}
                  
                  {/* Отображение цитируемого сообщения над полем ввода */}
                  {quotedMessage && (
                    <Box
                      px="md"
                      pt="xs"
                      pb="xs"
                      style={{
                        backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                      }}
                    >
                      <Box
                        p="xs"
                        style={{
                          backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                          width: '100%',
                          minHeight: '50px',
                          display: 'flex',
                          alignItems: 'flex-start',
                        }}
                      >
                        <Group 
                          gap="xs" 
                          align="flex-start"
                          style={{ width: '100%', margin: 0 }}
                          wrap="nowrap"
                        >
                          <IconQuote 
                            size={18} 
                            style={{ 
                              color: isDark ? '#4dabf7' : '#339af0',
                              flexShrink: 0,
                              marginTop: '2px'
                            }} 
                          />
                          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={4} wrap="nowrap" style={{ margin: 0 }}>
                              <Text size="sm" c={isDark ? '#4dabf7' : '#339af0'} style={{ flexShrink: 0, margin: 0 }}>
                                В ответ
                              </Text>
                              <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                                {quotedMessage.sender?.name || 'Пользователь'}
                              </Text>
                            </Group>
                            <Text 
                              size="sm" 
                              c={isDark ? '#ffffff' : '#000000'}
                              style={{ 
                                opacity: 0.9,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.4,
                                margin: 0
                              }}
                            >
                              {quotedMessage.message || (quotedMessage.attachments && quotedMessage.attachments.length > 0 
                                ? `📎 ${quotedMessage.attachments.length} ${quotedMessage.attachments.length === 1 ? 'файл' : 'файлов'}`
                                : 'Сообщение')}
                            </Text>
                          </Stack>
                          <ActionIcon
                            size="md"
                            variant="subtle"
                            onClick={() => setQuotedMessage(null)}
                            title="Убрать цитату"
                            style={{ flexShrink: 0, margin: 0 }}
                            color="gray"
                          >
                            <IconX size={18} />
                          </ActionIcon>
                        </Group>
                      </Box>
                    </Box>
                  )}
                  
                  {/* Поле ввода (проверяющий всегда может писать) */}
                  <MessageInput
                    key={editingMessageId || 'new-message'}
                    initialValue={editingMessageId ? messageText : ''}
                    onSend={editingMessageId ? handleSaveEdit : handleSendMessage}
                    onTyping={handleTyping}
                    isDark={isDark}
                    sending={sending}
                    showEmojiPicker={showEmojiPicker}
                    onToggleEmojiPicker={handleToggleEmojiPicker}
                    onEmojiClick={handleEmojiClick}
                    borderColor={inputContainerBorderColor}
                    backgroundColor={inputContainerBackgroundColor}
                    inputBackgroundColor={inputBackgroundColor}
                    inputBorderColor={inputBorderColor}
              onFilesSelect={handleFilesSelect}
              attachments={attachments}
            />
                </Box>
              ) : (
                <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'md' }}>
                  <Loader size="md" variant="dots" />
                  <Text c="dimmed" size="sm">Загрузка чата...</Text>
                </Box>
              )
        ) : !isChecker && chat?.checker ? (
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Заголовок чата */}
            <Box p="xs" px="sm" style={{ borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}` }}>
              <Stack gap={6}>
                {/* Первая строка: Заголовок с участниками и кнопки действий */}
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    <Popover
                      opened={participantsPopoverOpened}
                      onChange={setParticipantsPopoverOpened}
                      position="bottom-start"
                      withArrow
                      shadow="md"
                      withinPortal
                      zIndex={100001}
                    >
                      <Popover.Target>
                        <Stack 
                          gap={0} 
                          style={{ cursor: 'pointer', flex: 1, userSelect: 'none' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setParticipantsPopoverOpened(!participantsPopoverOpened);
                          }}
                        >
                        <Text fw={600} size="md" style={{ lineHeight: 1.2 }}>
                          {(() => {
                            // Для ответственных: используем название из пропсов или из branchesWithChats
                            if (!isChecker) {
                              return propBranchName || (() => {
                                const branch = branchesWithChats.find(b => b.branchId === branchId);
                                return branch?.branchName || '';
                              })();
                            }
                            // Для проверяющих: используем selectedBranch
                            return selectedBranch?.branchName || '';
                          })()}
                        </Text>
                        {allParticipants.length > 0 && (
                          <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                            {allParticipants.length} {allParticipants.length === 1 ? 'участник' : allParticipants.length < 5 ? 'участника' : 'участников'}
                          </Text>
                        )}
                      </Stack>
                    </Popover.Target>
                    <Popover.Dropdown style={{ padding: '12px', minWidth: '280px', maxWidth: '400px', zIndex: 100001 }}>
                      <Stack gap="xs">
                        <Text fw={600} size="sm" mb={4}>
                          Участники чата ({allParticipants.length})
                        </Text>
                        <Divider />
                        {allParticipants.length > 0 ? (
                          (() => {
                            const uniqueParticipants = Array.from(
                              new Map(allParticipants.map(p => [p.id, p])).values()
                            );
                            return uniqueParticipants.map((p) => {
                              const responsibilityTypes = p.responsibilityTypes || [];
                              // Используем только флаг isChecker из бэкенда
                              const isChecker = p.isChecker === true;
                              
                              return (
                                <Group key={p.id} gap="sm" wrap="nowrap" style={{ padding: '4px 0' }}>
                                  <Avatar 
                                    src={getImageSrc(p.image || null)} 
                                    size="md" 
                                    radius="xl"
                                  >
                                    {p.name?.charAt(0).toUpperCase() || '?'}
                    </Avatar>
                                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                    <Group gap="xs" wrap="nowrap">
                                      <Text fw={isChecker ? 500 : 400} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.name || p.email || 'Неизвестно'}
                                      </Text>
                                      {isChecker && (
                                        <Badge size="xs" variant="light" color="blue">
                                          Проверяющий
                                        </Badge>
                                      )}
                                      {responsibilityTypes.length > 0 && (
                                        <>
                                          {responsibilityTypes.includes('ОТ') && (
                                            <Badge size="xs" variant="light" color="orange">
                                              ОТ
                                            </Badge>
                                          )}
                                          {responsibilityTypes.includes('ПБ') && (
                                            <Badge size="xs" variant="light" color="red">
                                              ПБ
                                            </Badge>
                                          )}
                  </>
                )}
              </Group>
                                    {p.email && (
                                      <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.email}
                                      </Text>
                                    )}
                                  </Stack>
                                </Group>
                              );
                            });
                          })()
                        ) : (
                          <Text size="sm" c="dimmed" style={{ textAlign: 'center', padding: '8px' }}>
                            Нет участников
                          </Text>
                        )}
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
                  <Popover
                    opened={journalsPopoverOpened}
                    onChange={setJournalsPopoverOpened}
                    position="bottom-start"
                    withArrow
                    shadow="md"
                    withinPortal
                    zIndex={100001}
                  >
                    <Popover.Target>
                      <Group
                        gap={4}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setJournalsPopoverOpened(!journalsPopoverOpened);
                        }}
                      >
                        <IconFileText size={16} style={{ color: isDark ? theme.colors.gray[5] : theme.colors.gray[7] }} />
                        <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                          {branchJournals.filter(j => j.status === 'approved').length}/{branchJournals.length || 0}
                        </Text>
                      </Group>
                    </Popover.Target>
                    <Popover.Dropdown style={{ padding: '8px', minWidth: '280px', maxWidth: '400px', zIndex: 100001 }}>
                      <Stack gap={4}>
                        <Text fw={600} size="xs" mb={0}>
                          Журналы филиала ({branchJournals.length})
                        </Text>
                        <Divider size="xs" />
                        {journalsLoading ? (
                          <Box style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
                            <Loader size="xs" />
                          </Box>
                        ) : sortedBranchJournals.length > 0 ? (
                          <ScrollArea 
                            h={sortedBranchJournals.length > 6 ? 420 : undefined}
                            type="auto"
                            styles={{
                              viewport: {
                                maxHeight: sortedBranchJournals.length > 6 ? '420px' : 'none',
                              }
                            }}
                          >
                            <Stack gap={4}>
                              {sortedBranchJournals.map((journal) => {
                                const isApproved = journal.status === 'approved';
                                const statusColors: Record<string, string> = {
                                  approved: isDark ? theme.colors.gray[6] : theme.colors.gray[4], // Приглушенный цвет для одобренных
                                  pending: isDark ? theme.colors.yellow[7] : theme.colors.yellow[6],
                                  rejected: isDark ? theme.colors.red[7] : theme.colors.red[6],
                                  under_review: isDark ? theme.colors.blue[7] : theme.colors.blue[6],
                                };
                                const statusLabels: Record<string, string> = {
                                  approved: 'Принят',
                                  pending: 'Ожидает',
                                  rejected: 'Отклонен',
                                  under_review: 'На проверке',
                                };
                                return (
                                  <Box 
                                    key={journal.id} 
                                    style={{ 
                                      padding: '6px 8px', 
                                      borderRadius: '4px', 
                                      backgroundColor: isApproved 
                                        ? (isDark ? theme.colors.dark[5] : theme.colors.gray[0]) // Приглушенный фон для одобренных
                                        : (isDark ? theme.colors.dark[6] : theme.colors.gray[1]),
                                      opacity: isApproved ? 0.7 : 1 // Приглушенная прозрачность для одобренных
                                    }}
                                  >
                                    <Stack gap={4}>
                                      <Text 
                                        fw={isApproved ? 400 : 500} 
                                        size="xs" 
                                        c={isApproved ? 'dimmed' : undefined}
                                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}
                                      >
                                        {journal.journal_title}
                                      </Text>
                                      <Group gap={4} wrap="nowrap">
                                        <Badge size="xs" variant="light" color={journal.journal_type === 'ОТ' ? 'orange' : 'red'}>
                                          {journal.journal_type}
                                        </Badge>
                                        <Badge size="xs" variant="light" color={statusColors[journal.status] || 'gray'}>
                                          {statusLabels[journal.status] || journal.status}
                                        </Badge>
                                      </Group>
                                      {(journal.period_start || journal.period_end) && (
                                        <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                                          {journal.period_start && journal.period_end 
                                            ? `${dayjs(journal.period_start).format('DD.MM.YYYY')} - ${dayjs(journal.period_end).format('DD.MM.YYYY')}`
                                            : journal.period_start 
                                            ? `с ${dayjs(journal.period_start).format('DD.MM.YYYY')}`
                                            : journal.period_end
                                            ? `до ${dayjs(journal.period_end).format('DD.MM.YYYY')}`
                                            : ''}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Box>
                                );
                              })}
                            </Stack>
                          </ScrollArea>
                          ) : (
                            <Text size="xs" c="dimmed" style={{ textAlign: 'center', padding: '6px' }}>
                              Нет журналов
                            </Text>
                          )}
                        </Stack>
                      </Popover.Dropdown>
                    </Popover>
                  </Group>
                  <Group gap={4}>
                    <Tooltip label="Поиск по сообщениям">
                      <ActionIcon
                        variant={showSearch ? 'filled' : 'subtle'}
                        onClick={() => setShowSearch(!showSearch)}
                        size="sm"
                      >
                        <IconSearch size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {showScrollToBottom && (
                      <Tooltip label="Прокрутить вниз">
                        <ActionIcon
                          variant="subtle"
                          onClick={scrollToBottom}
                          size="sm"
                        >
                          <IconArrowDown size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
                
                {/* Поиск по сообщениям */}
                {showSearch && (
                  <Group gap={4}>
                    <TextInput
                      placeholder="Поиск по сообщениям..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.currentTarget.value)}
                      leftSection={<IconSearch size={14} />}
                      rightSection={
                        searchResults.length > 0 ? (
                          <Group gap={4}>
                            <Text size="xs" c="dimmed">
                              {currentSearchIndex + 1} / {searchResults.length}
                            </Text>
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              onClick={() => navigateSearch('prev')}
                              disabled={searchResults.length === 0}
                            >
                              <IconArrowDown size={12} style={{ transform: 'rotate(90deg)' }} />
                            </ActionIcon>
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              onClick={() => navigateSearch('next')}
                              disabled={searchResults.length === 0}
                            >
                              <IconArrowDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                            </ActionIcon>
                          </Group>
                        ) : null
                      }
                      size="xs"
                      style={{ flex: 1 }}
                    />
                    {searchQuery && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                )}
              </Stack>
            </Box>

            {/* Сообщения */}
            <ScrollArea style={{ flex: 1 }} viewportRef={scrollAreaRef} styles={{
              viewport: {
                backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
              }
            }}>
              <Box p="md" ref={parentRef}>
                {/* Индикатор загрузки дополнительных сообщений */}
                {isLoadingMore && (
                  <Box style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                    <Loader size="sm" variant="dots" />
                  </Box>
                )}
                
                {/* Элемент для Intersection Observer */}
                {hasMoreMessages && !isLoadingMore && (
                  <div ref={loadMoreRef} style={{ height: '1px' }} />
                )}
                
                {messages.length === 0 ? (
                  <Box style={{ textAlign: 'center', padding: '40px' }}>
                    <Text c="dimmed">Нет сообщений</Text>
                  </Box>
                ) : (
                  <Stack gap="xs" style={{ width: '100%' }}>
                    {/* Используем мемоизированный список сообщений для оптимизации производительности */}
                    {messagesElements}
                    <div ref={messagesEndRef} />
                  </Stack>
                )}
              </Box>
            </ScrollArea>
            
            {/* Кнопка прокрутки вниз (плавающая) */}
            {showScrollToBottom && (
              <Tooltip label="Прокрутить вниз">
                <ActionIcon
                            style={{
                    position: 'absolute',
                    bottom: 100,
                    right: 20,
                    zIndex: 1000,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                  variant="filled"
                  color="blue"
                  size="lg"
                                radius="xl"
                  onClick={scrollToBottom}
                              >
                  <IconArrowDown size={20} />
                </ActionIcon>
              </Tooltip>
                            )}

            {/* Индикатор "печатает..." */}
            {typingUsers.size > 0 && (
                            <Box
                px="md" 
                py="xs" 
                              style={{
                  opacity: 0.7,
                  position: 'sticky',
                  bottom: 0,
                  backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 10,
                }}
              >
                <Group gap={4} align="center">
                  <Loader size="xs" variant="dots" />
                  <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                    {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'печатает' : 'печатают'}...
                  </Text>
                </Group>
              </Box>
            )}
            
            {/* Отображение режима редактирования над полем ввода */}
            {editingMessageId && (
              <Box
                px="md"
                pt="xs"
                pb="xs"
                                  style={{ 
                  backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                }}
              >
                <Box
                  p="xs"
                  style={{
                    backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                    width: '100%',
                    minHeight: '50px',
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                  <Group 
                    gap="xs" 
                    align="flex-start"
                    style={{ width: '100%', margin: 0 }}
                    wrap="nowrap"
                  >
                    <IconEdit 
                      size={18} 
                      style={{ 
                        color: isDark ? '#4dabf7' : '#339af0',
                        flexShrink: 0,
                        marginTop: '2px'
                      }} 
                    />
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ margin: 0 }}>
                        Редактирование сообщения
                                </Text>
                      {(() => {
                        const editingMessage = messages.find(m => m.id === editingMessageId);
                        if (editingMessage) {
                          return (
                              <Text 
                                size="sm" 
                              c={isDark ? '#ffffff' : '#000000'}
                                style={{ 
                                opacity: 0.9,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.4,
                                margin: 0
                              }}
                            >
                              {editingMessage.message || (editingMessage.attachments && editingMessage.attachments.length > 0 
                                ? `📎 ${editingMessage.attachments.length} ${editingMessage.attachments.length === 1 ? 'файл' : 'файлов'}`
                                : 'Сообщение')}
                              </Text>
                          );
                        }
                        return null;
                      })()}
                    </Stack>
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      onClick={handleCancelEdit}
                      title="Отменить редактирование"
                      style={{ flexShrink: 0, margin: 0 }}
                      color="gray"
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  </Group>
                </Box>
              </Box>
            )}
            
            {/* Отображение цитируемого сообщения над полем ввода */}
            {quotedMessage && (
              <Box
                px="md"
                pt="xs"
                pb="xs"
                style={{
                  backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                }}
              >
                <Box
                  p="xs"
                  style={{
                    backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                    width: '100%',
                    minHeight: '50px',
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                              <Group 
                    gap="xs" 
                    align="flex-start"
                    style={{ width: '100%', margin: 0 }}
                    wrap="nowrap"
                  >
                    <IconQuote 
                      size={18} 
                      style={{ 
                        color: isDark ? '#4dabf7' : '#339af0',
                        flexShrink: 0,
                        marginTop: '2px'
                      }} 
                    />
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={4} wrap="nowrap" style={{ margin: 0 }}>
                        <Text size="sm" c={isDark ? '#4dabf7' : '#339af0'} style={{ flexShrink: 0, margin: 0 }}>
                          В ответ
                        </Text>
                        <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                          {quotedMessage.sender?.name || 'Пользователь'}
                        </Text>
                      </Group>
                                <Text 
                        size="sm" 
                        c={isDark ? '#ffffff' : '#000000'}
                                  style={{ 
                          opacity: 0.9,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: 1.4,
                          margin: 0
                        }}
                      >
                        {quotedMessage.message || (quotedMessage.attachments && quotedMessage.attachments.length > 0 
                          ? `📎 ${quotedMessage.attachments.length} ${quotedMessage.attachments.length === 1 ? 'файл' : 'файлов'}`
                          : 'Сообщение')}
                                </Text>
                    </Stack>
                    <ActionIcon
                      size="md"
                      variant="subtle"
                      onClick={() => setQuotedMessage(null)}
                      title="Убрать цитату"
                      style={{ flexShrink: 0, margin: 0 }}
                      color="gray"
                    >
                      <IconX size={18} />
                    </ActionIcon>
                              </Group>
                            </Box>
                          </Box>
            )}
            
            {/* Отображение вложений над полем ввода */}
            {attachments && attachments.length > 0 && (
              <Box
                px="md"
                pt="xs"
                pb="xs"
                style={{
                  backgroundColor: isDark ? 'rgba(37, 38, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                }}
              >
                <Box
                  p="xs"
                  style={{
                    backgroundColor: isDark ? 'rgba(77, 171, 247, 0.2)' : 'rgba(51, 154, 240, 0.15)',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? 'rgba(77, 171, 247, 0.4)' : 'rgba(51, 154, 240, 0.3)'}`,
                    width: '100%',
                    minHeight: '50px',
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                  <Group 
                    gap="xs" 
                    align="flex-start"
                    style={{ width: '100%', margin: 0 }}
                    wrap="wrap"
                  >
                    <IconPaperclip 
                      size={18} 
                      style={{ 
                        color: isDark ? '#4dabf7' : '#339af0',
                        flexShrink: 0,
                        marginTop: '2px'
                      }} 
                    />
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={500} c={isDark ? '#ffffff' : '#000000'} style={{ margin: 0 }}>
                        Прикрепленные файлы ({attachments.length})
                      </Text>
                      <Group gap="xs" wrap="wrap" style={{ margin: 0 }}>
                        {attachments.map((file, index) => {
                          const formatFileSize = (bytes: number) => {
                            if (bytes < 1024) return `${bytes} Б`;
                            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
                            return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
                          };
                          
                          return (
                            <Badge
                              key={index}
                              variant="light"
                              size="sm"
                              leftSection={<IconFile size={12} />}
                              rightSection={
                                <Group gap={2}>
                                  {externalOnPreviewFiles && (
                <ActionIcon
                                      size="xs"
                                      variant="transparent"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const previewAttachments = attachments.map((f, i) => ({
                                          id: `preview-${i}`,
                                          source: f,
                                          name: f.name,
                                          mimeType: f.type,
                                        }));
                                        externalOnPreviewFiles(previewAttachments, index);
                                      }}
                                      title="Предпросмотр"
                                    >
                                      <IconEye size={10} />
                </ActionIcon>
                                  )}
                                  {handleRemoveAttachment && (
                                    <ActionIcon
                                      size="xs"
                                      variant="transparent"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveAttachment(index);
                                      }}
                                      title="Удалить"
                                    >
                                      <IconX size={10} />
                                    </ActionIcon>
                                  )}
                                </Group>
                              }
                              title={`${file.name} (${formatFileSize(file.size)})`}
                              style={{ cursor: externalOnPreviewFiles ? 'pointer' : 'default' }}
                              onClick={externalOnPreviewFiles ? () => {
                                const previewAttachments = attachments.map((f, i) => ({
                                  id: `preview-${i}`,
                                  source: f,
                                  name: f.name,
                                  mimeType: f.type,
                                }));
                                externalOnPreviewFiles(previewAttachments, index);
                              } : undefined}
                            >
                              <Text size="xs" truncate style={{ maxWidth: '150px' }}>
                                {file.name}
                              </Text>
                            </Badge>
                          );
                        })}
                      </Group>
                    </Stack>
              </Group>
            </Box>
              </Box>
            )}
            
            {/* Поле ввода */}
            <MessageInput
              key={editingMessageId || 'new-message'}
              initialValue={editingMessageId ? messageText : ''}
              onSend={editingMessageId ? handleSaveEdit : handleSendMessage}
              onTyping={handleTyping}
              isDark={isDark}
              sending={sending}
              showEmojiPicker={showEmojiPicker}
              onToggleEmojiPicker={handleToggleEmojiPicker}
              onEmojiClick={handleEmojiClick}
              borderColor={inputContainerBorderColor}
              backgroundColor={inputContainerBackgroundColor}
              inputBackgroundColor={inputBackgroundColor}
              inputBorderColor={inputBorderColor}
              onFilesSelect={handleFilesSelect}
              attachments={attachments}
            />
          </Box>
        ) : null}
      </Box>
      
      {/* Модальное окно предпросмотра файлов - рендерим только если нет внешнего обработчика */}
      {!externalOnPreviewFiles && (
        <FilePreviewModal
          opened={previewOpened}
          onClose={() => setPreviewOpened(false)}
          attachments={previewFiles}
          initialIndex={previewIndex}
          requireAuth={true}
        />
      )}

      {/* Модальное окно подтверждения удаления */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => {
          setDeleteModalOpened(false);
          setMessageToDelete(null);
        }}
        title="Подтверждение удаления"
        centered
        zIndex={100001}
      >
        <Stack gap="md">
          <Text>Вы уверены, что хотите удалить это сообщение?</Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => {
                setDeleteModalOpened(false);
                setMessageToDelete(null);
              }}
            >
              Отмена
            </Button>
            <Button
              color="red"
              onClick={confirmDeleteMessage}
            >
              Удалить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

