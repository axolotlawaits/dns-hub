import { Modal, Image, Loader, Stack, Text, Group, Paper, Box, ActionIcon, Tooltip, Button } from '@mantine/core';
import { Carousel } from '@mantine/carousel';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config/constants';
import { IconFile, IconFileText, IconFileTypePdf, IconPhoto, IconMusic, IconVideo, IconDownload, IconChevronLeft, IconChevronRight, IconX, IconTrash, IconExternalLink } from '@tabler/icons-react';
import './styles/FilePreviewModal.css';

// Компонент для загрузки файлов с заголовками авторизации
  const AuthFileLoader = ({ src, onMimeTypeDetected, onLoad, onError, children }: any) => {
    const [fileBlob, setFileBlob] = useState<Blob | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
      if (!src) return;

      if (src.startsWith('http') && !src.startsWith('blob:')) {
        // Для внешних URL добавляем заголовки авторизации
        const token = localStorage.getItem('token');
        const headers: HeadersInit = {};
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {

        }

        fetch(src, { headers })
          .then(response => {
            
            if (!response.ok) {
              throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
            // Получаем MIME-тип из заголовков
            const contentType = response.headers.get('content-type');

            if (contentType && onMimeTypeDetected) {
              onMimeTypeDetected(contentType);
            }
            return response.blob();
          })
          .then(blob => {

            setFileBlob(blob);
            setLoading(false);
            if (onLoad) onLoad();
          })
          .catch((error) => {
            console.error('AuthFileLoader: Error loading file:', error);
            setError(true);
            setLoading(false);
            if (onError) onError();
          });
      } else {
        // Для локальных URL и blob URL используем как есть
        setFileBlob(null);
        setLoading(false);
        if (onLoad) onLoad();
      }

      return () => {
        if (fileBlob) {
          URL.revokeObjectURL(URL.createObjectURL(fileBlob));
        }
      };
    }, [src, onMimeTypeDetected, onLoad, onError]);

  if (loading) {
    return <Loader size="md" />;
  }

  if (error) {
    return <Text c="red">Ошибка загрузки файла</Text>;
  }

  return children(fileBlob ? URL.createObjectURL(fileBlob) : src);
};

// Компонент для загрузки изображений с заголовками авторизации
const AuthImage = ({ src, alt, onMimeTypeDetected, ...props }: any) => {
  return (
    <AuthFileLoader src={src} onMimeTypeDetected={onMimeTypeDetected}>
      {(blobUrl: string) => (
        <Image src={blobUrl} alt={alt} {...props} />
      )}
    </AuthFileLoader>
  );
};

interface Attachment {
  id: string;
  source: string | File;
  name?: string;
  mimeType?: string;
}

interface FilePreviewModalProps {
  opened: boolean;
  onClose: () => void;
  attachments: Attachment[];
  initialIndex?: number;
  onDeleteFile?: (fileId: string) => Promise<void>;
  requireAuth?: boolean; // Флаг для SafetyJournal - требует передачи токена
}

const SUPPORTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const SUPPORTED_AUDIO_EXTS = ['mp3', 'ogg', 'wav'];
const SUPPORTED_VIDEO_EXTS = ['mp4', 'webm', 'ogg'];
const SUPPORTED_PDF_EXTS = ['pdf'];
const SUPPORTED_TEXT_EXTS = ['txt', 'csv', 'json', 'xml'];

const getFileIcon = (ext: string) => {
  if (SUPPORTED_IMAGE_EXTS.includes(ext)) return IconPhoto;
  if (SUPPORTED_PDF_EXTS.includes(ext)) return IconFileTypePdf;
  if (SUPPORTED_TEXT_EXTS.includes(ext)) return IconFileText;
  if (SUPPORTED_AUDIO_EXTS.includes(ext)) return IconMusic;
  if (SUPPORTED_VIDEO_EXTS.includes(ext)) return IconVideo;
  return IconFile;
};

const getFileColor = (ext: string) => {
  if (SUPPORTED_IMAGE_EXTS.includes(ext)) return 'var(--color-green-500)';
  if (SUPPORTED_PDF_EXTS.includes(ext)) return 'var(--color-red-500)';
  if (SUPPORTED_TEXT_EXTS.includes(ext)) return 'var(--color-blue-500)';
  if (SUPPORTED_AUDIO_EXTS.includes(ext)) return 'var(--color-purple-500)';
  if (SUPPORTED_VIDEO_EXTS.includes(ext)) return 'var(--color-orange-500)';
  return 'var(--color-gray-500)';
};

export const FilePreviewModal = ({
  opened,
  onClose,
  attachments,
  initialIndex = 0,
  onDeleteFile,
  requireAuth = false,
}: FilePreviewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fileContent, setFileContent] = useState<string>('');
  const currentAttachment = attachments[currentIndex];

  const [fileMimeType, setFileMimeType] = useState<string>('');

  const {
    isImage,
    isPdf,
    isText,
    isAudio,
    isVideo,
    fileName,
    fileUrl,
    fileExt,
    downloadUrl
  } = useMemo(() => {
    if (!currentAttachment) {
      return {
        ext: '',
        isImage: false,
        isPdf: false,
        isText: false,
        isAudio: false,
        isVideo: false,
        fileName: '',
        fileUrl: '',
        fileExt: ''
      };
    }

    const source = currentAttachment.source;
    const providedName = (currentAttachment as any).name as string | undefined;
    const providedMime = (currentAttachment as any).mimeType as string | undefined;
    let ext = typeof source === 'string'
      ? source.split('.').pop()?.toLowerCase() || ''
      : source.name.split('.').pop()?.toLowerCase() || '';

    // Если расширение не найдено, попробуем определить по MIME-типу
    const effectiveMime = providedMime || fileMimeType;
    if (!ext && effectiveMime) {
      if (effectiveMime.startsWith('image/')) ext = 'jpg';
      else if (effectiveMime === 'application/pdf') ext = 'pdf';
      else if (effectiveMime.startsWith('text/')) ext = 'txt';
      else if (effectiveMime.startsWith('audio/')) ext = 'mp3';
      else if (effectiveMime.startsWith('video/')) ext = 'mp4';
    }

    const isImage = SUPPORTED_IMAGE_EXTS.includes(ext) || (effectiveMime || '').startsWith('image/');
    const isPdf = SUPPORTED_PDF_EXTS.includes(ext) || (effectiveMime === 'application/pdf');
    const isText = SUPPORTED_TEXT_EXTS.includes(ext) || (effectiveMime || '').startsWith('text/');
    const isAudio = SUPPORTED_AUDIO_EXTS.includes(ext) || (effectiveMime || '').startsWith('audio/');
    const isVideo = SUPPORTED_VIDEO_EXTS.includes(ext) || (effectiveMime || '').startsWith('video/');

    // Вычисляем URL для скачивания: меняем /view на /download, если это наш прокси
    const computeDownloadUrl = (url: string) => {
      if (!url) return url;
      // Заменяем /view на /download, сохраняя query/anchor
      return url.replace(/\/view(?=(\?|#|$))/i, '/download');
    };

    return {
      ext,
      isImage,
      isPdf,
      isText,
      isAudio,
      isVideo,
      fileName: providedName
        || (typeof source === 'string'
          ? decodeURIComponent(source.split('\\').pop() || source.split('/').pop() || 'Файл')
          : source.name),
      fileUrl: typeof source === 'string'
        ? source.startsWith('http') || source.startsWith('blob:') ? source : `${API}/${source}`
        : URL.createObjectURL(source),
      fileExt: ext,
      downloadUrl: typeof source === 'string'
        ? computeDownloadUrl(source.startsWith('http') || source.startsWith('blob:') ? source : `${API}/${source}`)
        : ''
    };
  }, [currentAttachment, API, fileMimeType]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => {
      const nextIndex = prev < attachments.length - 1 ? prev + 1 : prev;
      if (nextIndex !== prev) {
        setLoading(true);
        // Небольшая задержка для плавного перехода
        setTimeout(() => {
          setCurrentIndex(nextIndex);
        }, 50);
      }
      return prev; // Возвращаем текущий индекс, так как обновление происходит в setTimeout
    });
  }, [attachments.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => {
      const prevIndex = prev > 0 ? prev - 1 : prev;
      if (prevIndex !== prev) {
        setLoading(true);
        // Небольшая задержка для плавного перехода
        setTimeout(() => {
          setCurrentIndex(prevIndex);
        }, 50);
      }
      return prev; // Возвращаем текущий индекс, так как обновление происходит в setTimeout
    });
  }, []);

  const handleFileSelect = (index: number) => {
    if (index === currentIndex) return; // Не переключаем если уже выбран этот файл
    
    setLoading(true);
    // Небольшая задержка для плавного перехода
    setTimeout(() => {
      setCurrentIndex(index);
    }, 50);
  };

  // Функция для открытия файла в новой вкладке с токеном авторизации
  const openInNewTab = useCallback(async () => {
    if (!currentAttachment) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token && requireAuth) {
        console.error('Токен авторизации не найден');
        return;
      }

      // Для всех файлов скачиваем и создаем blob URL для лучшего UX
      if (fileUrl.startsWith('http')) {
        const headers: Record<string, string> = {};
        
        // Добавляем токен авторизации если требуется
        if (requireAuth && token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(fileUrl, { headers });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // Открываем blob URL в новой вкладке
        window.open(blobUrl, '_blank');
        
        // Очищаем blob URL через некоторое время для освобождения памяти
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60000); // 1 минута
      } else {
        // Для локальных файлов или других протоколов открываем напрямую
        window.open(fileUrl, '_blank');
      }
    } catch (error) {
      console.error('Ошибка при открытии файла в новой вкладке:', error);
      // Fallback: пытаемся открыть напрямую
      try {
        window.open(fileUrl, '_blank');
      } catch (fallbackError) {
        console.error('Fallback также не сработал:', fallbackError);
      }
    }
  }, [currentAttachment, fileUrl, requireAuth]);


  useEffect(() => {
    if (!opened) {
      setCurrentIndex(initialIndex);
      setLoading(true);
      setError(false);
    }
  }, [opened, initialIndex]);

  useEffect(() => {
    if (!currentAttachment) return;

    setLoading(true);
    // Если MIME пришел извне — используем его сразу
    if ((currentAttachment as any).mimeType) {
      setFileMimeType((currentAttachment as any).mimeType);
    } else {
      setFileMimeType('');
    }

    // Получаем MIME-тип файла для правильного определения типа, только если он не был предоставлен
    if (!(currentAttachment as any).mimeType && typeof currentAttachment.source === 'string' && fileUrl.startsWith('http') && !fileUrl.startsWith('blob:')) {
      const headers: HeadersInit = {};
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Делаем HEAD запрос для получения заголовков
      fetch(fileUrl, { method: 'HEAD', headers })
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch headers');
          }
          const contentType = response.headers.get('content-type');
          if (contentType) {
            setFileMimeType(contentType);
          }
        })
        .catch(() => {
          // Если не удалось получить заголовки, продолжаем без MIME-типа
        });
    }

    if (isText && typeof currentAttachment.source === 'string') {
      const headers: HeadersInit = {};
      
      // Добавляем токен авторизации для внешних URL
      if (fileUrl.startsWith('http') && !fileUrl.startsWith('blob:')) {
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      fetch(fileUrl, { headers })
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch');
          }
          return response.text();
        })
        .then(text => {
          setFileContent(text);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    } else if (isText && currentAttachment.source instanceof File) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
        setLoading(false);
      };
      reader.readAsText(currentAttachment.source);
    } else {
      const timer = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(timer);
    }

    return () => {
      if (typeof currentAttachment.source !== 'string') {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [currentAttachment, fileUrl, isText]);



  const FileSelector = () => (
    <Box className="file-selector">
      <Carousel
        withIndicators={false}
        withControls={attachments.length > 3}
        slideSize="200px"
        slideGap="12px"
        styles={{
          control: {
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border-primary)',
            color: 'var(--theme-text-primary)',
            '&:hover': {
              background: 'var(--theme-bg-secondary)',
            }
          },
          indicator: {
            background: 'var(--theme-border-primary)',
            '&[data-active]': {
              background: 'var(--color-primary-500)',
            }
          }
        }}
      >
      {attachments.map((attachment, index) => {
        const src = attachment.name || 
          (typeof attachment.source === 'string'
            ? (() => {
                // Извлекаем имя файла из пути или URL
                const path = attachment.source;
                
                // Если это URL с параметрами, убираем их
                const cleanPath = path.split('?')[0];
                
                // Разбиваем по слешам и берем последнюю часть
                const pathParts = cleanPath.split(/[\\\/]/);
                let fileName = pathParts[pathParts.length - 1];
                
                // Если последняя часть пустая или это ID (только цифры/буквы), берем предпоследнюю
                if (!fileName || fileName.length < 3 || /^[a-f0-9-]+$/i.test(fileName)) {
                  fileName = pathParts[pathParts.length - 2] || 'Файл';
                }
                
                // Декодируем URL
                return decodeURIComponent(fileName);
              })()
            : attachment.source.name);
          
          const ext = typeof attachment.source === 'string'
            ? src.split('.').pop()?.toLowerCase() || ''
            : attachment.source.name.split('.').pop()?.toLowerCase() || '';
          
          const FileIcon = getFileIcon(ext);
          const isActive = currentIndex === index;
          
        return (
          <Carousel.Slide key={attachment.id || `attachment-${index}`}>
            <Box
            onClick={() => handleFileSelect(index)}
              style={{
                background: isActive 
                  ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                  : 'var(--theme-bg-elevated)',
                border: isActive 
                  ? '1px solid var(--color-primary-500)'
                  : '1px solid var(--theme-border-primary)',
                borderRadius: '12px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '200px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <Group gap="12px" align="center" w={200}>
                <Box
                  style={{
                    width: '32px',
                    height: '32px',
                    background: isActive 
                      ? 'rgba(255, 255, 255, 0.2)'
                      : getFileColor(ext) + '20',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileIcon 
                    size={18} 
                    color={isActive ? 'white' : getFileColor(ext)} 
                  />
                </Box>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    truncate="end"
                    style={{
                      color: isActive ? 'white' : 'var(--theme-text-primary)',
                      fontWeight: '600',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {src}
                  </Text>
                  <Text
                    truncate="end"
                    style={{
                      color: isActive ? 'rgba(255, 255, 255, 0.8)' : 'var(--theme-text-secondary)',
                      fontSize: '12px',
                      marginTop: '2px'
                    }}
                  >
                    {ext.toUpperCase()}
                  </Text>
                </Box>
              </Group>
            </Box>
          </Carousel.Slide>
        );
      })}
      </Carousel>
    </Box>
  );


  const renderContent = () => {
    if (loading) {
      return (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px'
          }}
        >
          <Loader size="lg" color="var(--color-primary-500)" />
          <Text 
            style={{ 
              marginTop: '16px',
              color: 'var(--theme-text-primary)',
              fontSize: '16px',
              fontWeight: '500'
            }}
          >
            Загружается файл...
          </Text>
        </Box>
      );
    }

    if (error) {
      return (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--color-red-200)',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px'
          }}
        >
          <Box
            style={{
              width: '64px',
              height: '64px',
              background: 'var(--color-red-100)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <IconX size={32} color="var(--color-red-500)" />
          </Box>
          <Text 
            style={{ 
              color: 'var(--color-red-500)',
              fontSize: '16px',
              fontWeight: '600',
              textAlign: 'center'
            }}
          >
            Файл не найден или недоступен
          </Text>
          <Text 
            style={{ 
              color: 'var(--theme-text-secondary)',
              fontSize: '14px',
              marginTop: '8px',
              textAlign: 'center'
            }}
          >
            Возможно, файл был удален или у вас нет прав на его просмотр
          </Text>
        </Box>
      );
    }

    if (isImage) {
      return (
        <Box
          className="image-container"
        >
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <AuthImage
            src={fileUrl}
            alt={fileName}
            fit="contain"
            onMimeTypeDetected={setFileMimeType}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              objectFit: 'contain',
              objectPosition: 'center'
            }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
        </Box>
      );
    }

    if (isPdf) {
      return (
        <Box
          className="image-container"
        >
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <AuthFileLoader 
            src={fileUrl} 
            onMimeTypeDetected={setFileMimeType}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          >
            {(blobUrl: string) => (
              <iframe
                title="PDF Viewer"
                src={`${blobUrl}#toolbar=0&navpanes=0`}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
                  border: 'none'
                }}
              />
            )}
          </AuthFileLoader>
        </Box>
      );
    }

    if (isText) {
      return (
        <Box
          className="image-container"
        >
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <Paper 
            withBorder 
            p="md" 
            style={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              backgroundColor: 'var(--theme-bg-primary)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              border: '1px solid var(--theme-border-secondary)'
            }}
          >
            <pre style={{ 
              margin: 0,
              color: 'var(--theme-text-primary)',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {fileContent}
            </pre>
          </Paper>
        </Box>
      );
    }

    if (isAudio) {
      return (
        <Box
          className="image-container"
        >
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <Box
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--theme-bg-primary)',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid var(--theme-border-secondary)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <AuthFileLoader 
              src={fileUrl} 
              onMimeTypeDetected={setFileMimeType}
              onLoad={() => setLoading(false)}
              onError={() => setError(true)}
            >
              {(blobUrl: string) => (
                <audio
                  controls
                  src={blobUrl}
                  style={{ 
                    width: '100%',
                    height: '40px'
                  }}
                >
                  Ваш браузер не поддерживает элемент audio.
                </audio>
              )}
            </AuthFileLoader>
          </Box>
        </Box>
      );
    }

    if (isVideo) {
      return (
        <Box
          className="image-container"
        >
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <AuthFileLoader 
            src={fileUrl} 
            onMimeTypeDetected={setFileMimeType}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          >
            {(blobUrl: string) => (
              <video
                controls
                style={{ 
                  width: '100%',
                  height: '100%',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
                }}
                src={blobUrl}
              >
                Ваш браузер не поддерживает видео.
              </video>
            )}
          </AuthFileLoader>
        </Box>
      );
    }

    // Если файл не определен, попробуем отобразить его как iframe
    if (currentAttachment && typeof currentAttachment.source === 'string' && fileUrl.startsWith('http')) {
      return (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '20px',
            minHeight: '400px',
            overflow: 'hidden'
          }}
        >
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '20px',
                padding: '8px 20px',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Text 
                style={{
                  fontWeight: '600',
                  color: 'var(--theme-text-primary)',
                  fontSize: '14px'
                }}
              >
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border-primary)',
                color: 'var(--theme-text-primary)'
              }}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <AuthFileLoader 
            src={fileUrl} 
            onMimeTypeDetected={setFileMimeType}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          >
            {(blobUrl: string) => (
              <iframe
                title="File Viewer"
                src={blobUrl}
                style={{
                  width: '100%',
                  height: 'calc(100vh - 350px)',
                  border: 'none',
                  minHeight: 400,
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
                }}
              />
            )}
          </AuthFileLoader>
        </Box>
      );
    }

    return (
      <Box
        style={{
          background: 'var(--theme-bg-elevated)',
          borderRadius: '16px',
          border: '1px solid var(--theme-border-primary)',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px'
        }}
      >
        <Box
          style={{
            width: '64px',
            height: '64px',
            background: 'var(--color-gray-100)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}
        >
          <IconFile size={32} color="var(--color-gray-500)" />
        </Box>
        <Text 
          style={{ 
            color: 'var(--theme-text-primary)',
            fontSize: '16px',
            fontWeight: '600',
            textAlign: 'center'
          }}
        >
          Формат файла {fileExt.toUpperCase() || 'неизвестный'} не поддерживает встроенный просмотр
        </Text>
        <Text 
          style={{ 
            color: 'var(--theme-text-secondary)',
            fontSize: '14px',
            marginTop: '8px',
            textAlign: 'center'
          }}
        >
          Используйте кнопку "Скачать файл" для просмотра
        </Text>
      </Box>
    );
  };
  
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      zIndex={1000}
      className="file-preview-modal"
      withCloseButton={false}
      styles={{
        body: { 
          padding: '0',
          background: 'var(--theme-bg-primary)',
          minHeight: '100vh'
        },
        header: { 
          padding: '0',
          background: 'transparent',
          border: 'none'
        },
        content: {
          background: 'var(--theme-bg-primary)'
        }
      }}
    >
      <Box
        style={{
          background: 'var(--theme-bg-primary)',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Современный заголовок */}
        <Box
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
            padding: '20px 24px',
            borderBottom: '1px solid var(--theme-border-primary)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Декоративные элементы */}
          <Box
            style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '100px',
              height: '100px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              zIndex: 1
            }}
          />
          
          <Group justify="space-between" align="center" style={{ position: 'relative', zIndex: 2 }}>
            <Group gap="16px" align="center">
              <Box
                style={{
                  width: '48px',
                  height: '48px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}
              >
                {(() => {
                  const FileIcon = getFileIcon(fileExt);
                  return <FileIcon size={24} color="white" />;
                })()}
              </Box>
              <Box>
                <Text 
                  style={{ 
                    color: 'white', 
                    fontSize: '24px',
                    fontWeight: '700',
                    margin: 0
                  }}
                >
                  {fileName}
                </Text>
              </Box>
            </Group>
            
            <Group gap="12px">
              <Tooltip label="Скачать файл">
                <ActionIcon
                  size="lg"
                  radius="xl"
                  onClick={async () => {
                    try {
                      const url = downloadUrl || fileUrl;
                      // Всегда предпочитаем /download вариант
                      const finalUrl = url.replace(/\/view(?=(\?|#|$))/i, '/download');
                      if (url.startsWith('http')) {
                        const headers: HeadersInit = {};
                        const token = localStorage.getItem('token');
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                        const res = await fetch(finalUrl, { headers });
                        if (!res.ok) throw new Error(String(res.status));
                        const blob = await res.blob();
                        const objectUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = objectUrl;
                        a.download = fileName || 'file';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(objectUrl);
                      } else {
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = fileName;
                        link.click();
                      }
                    } catch (e) {
                      // Фоллбэк — открыть в новой вкладке по /download
                      const fallbackUrl = (downloadUrl || fileUrl).replace(/\/view(?=(\?|#|$))/i, '/download');
                      window.open(fallbackUrl, '_blank');
                    }
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  <IconDownload size={20} />
                </ActionIcon>
              </Tooltip>
              
              {onDeleteFile && currentAttachment?.id && (
                <Tooltip label="Удалить файл">
                  <ActionIcon
                    size="lg"
                    radius="xl"
                    onClick={async () => {
                      if (confirm('Вы уверены, что хотите удалить этот файл?')) {
                        await onDeleteFile(currentAttachment.id);
                      }
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.8)',
                      color: 'white',
                      border: '2px solid rgba(239, 68, 68, 0.9)',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                      transform: 'scale(1.05)'
                    }}
                  >
                    <IconTrash size={20} />
                  </ActionIcon>
                </Tooltip>
              )}
              
              
              <Tooltip label="Закрыть">
                <ActionIcon
                  size="lg"
                  radius="xl"
                  onClick={onClose}
                  style={{
                    background: 'rgba(239, 68, 68, 0.8)',
                    color: 'white',
                    border: '2px solid rgba(239, 68, 68, 0.9)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    transform: 'scale(1.05)'
                  }}
                >
                  <IconX size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Box>

        {/* Основной контент с кнопками навигации */}
        <Box 
          style={{ 
            flex: 1,
            padding: '24px', 
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0 // Важно для правильной работы flex
          }}
        >
          {/* Кнопка "Назад" слева */}
          <ActionIcon
            size="xl"
            radius="xl"
            disabled={currentIndex <= 0}
            onClick={handlePrev}
            style={{
              position: 'absolute',
              left: '40px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: currentIndex <= 0 
                ? 'var(--theme-bg-secondary)' 
                : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
              color: currentIndex <= 0 ? 'var(--theme-text-disabled)' : 'white',
              border: 'none',
              opacity: currentIndex <= 0 ? 0.5 : 1,
              cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
          >
            <IconChevronLeft size={20} />
          </ActionIcon>

          {/* Кнопка "Вперед" справа */}
          <ActionIcon
            size="xl"
            radius="xl"
            disabled={currentIndex >= attachments.length - 1}
            onClick={handleNext}
            style={{
              position: 'absolute',
              right: '40px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: currentIndex >= attachments.length - 1 
                ? 'var(--theme-bg-secondary)' 
                : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
              color: currentIndex >= attachments.length - 1 ? 'var(--theme-text-disabled)' : 'white',
              border: 'none',
              opacity: currentIndex >= attachments.length - 1 ? 0.5 : 1,
              cursor: currentIndex >= attachments.length - 1 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
          >
            <IconChevronRight size={20} />
          </ActionIcon>

          <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
            <Box className="content-wrapper" style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              minHeight: 0,
              maxHeight: '100%',
              overflow: 'hidden'
            }}>
              {renderContent()}
            </Box>
          </Stack>
        </Box>

        {/* Нижняя панель с файлами */}
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderTop: '1px solid var(--theme-border-primary)',
            padding: '20px 24px'
          }}
        >
          <FileSelector />
        </Box>
      </Box>

    </Modal>
  );
};
