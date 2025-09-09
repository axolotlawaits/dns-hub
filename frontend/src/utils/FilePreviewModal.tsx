import { Modal, Image, Loader, Stack, Text, Group, Paper, Box, ActionIcon, Badge, Tooltip } from '@mantine/core';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config/constants';
import { IconFile, IconFileText, IconFileTypePdf, IconPhoto, IconMusic, IconVideo, IconDownload, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import './FilePreviewModal.css';

interface Attachment {
  id: string;
  source: string | File;
}

interface FilePreviewModalProps {
  opened: boolean;
  onClose: () => void;
  attachments: Attachment[];
  initialIndex?: number;
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
}: FilePreviewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fileContent, setFileContent] = useState<string>('');
  const currentAttachment = attachments[currentIndex];

  const {
    isImage,
    isPdf,
    isText,
    isAudio,
    isVideo,
    fileName,
    fileUrl,
    fileExt
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
    const ext = typeof source === 'string'
      ? source.split('.').pop()?.toLowerCase() || ''
      : source.name.split('.').pop()?.toLowerCase() || '';

    const isImage = SUPPORTED_IMAGE_EXTS.includes(ext);
    const isPdf = SUPPORTED_PDF_EXTS.includes(ext);
    const isText = SUPPORTED_TEXT_EXTS.includes(ext);
    const isAudio = SUPPORTED_AUDIO_EXTS.includes(ext);
    const isVideo = SUPPORTED_VIDEO_EXTS.includes(ext);

    return {
      ext,
      isImage,
      isPdf,
      isText,
      isAudio,
      isVideo,
      fileName: typeof source === 'string'
        ? decodeURIComponent(source.split('\\').pop() || source.split('/').pop() || 'Файл')
        : source.name,
      fileUrl: typeof source === 'string'
        ? `${API}/${source}`
        : URL.createObjectURL(source),
      fileExt: ext
    };
  }, [currentAttachment, API]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => {
      const nextIndex = prev < attachments.length - 1 ? prev + 1 : prev;
      return nextIndex;
    });
    setLoading(true);
  }, [attachments.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => {
      const prevIndex = prev > 0 ? prev - 1 : prev;
      return prevIndex;
    });
    setLoading(true);
  }, []);

  const handleFileSelect = (index: number) => {
    setCurrentIndex(index);
    setLoading(true);
  };

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

    if (isText && typeof currentAttachment.source === 'string') {
      fetch(fileUrl)
        .then(response => response.text())
        .then(text => {
          setFileContent(text);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
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

  if (!opened || attachments.length === 0) return null;

  const FileNavigation = () => (
    <Group justify="space-between" align="center">
      <ActionIcon
        size="xl"
        radius="xl"
        disabled={currentIndex <= 0}
        onClick={handlePrev}
        style={{
          background: currentIndex <= 0 
            ? 'var(--theme-bg-secondary)' 
            : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          color: currentIndex <= 0 ? 'var(--theme-text-disabled)' : 'white',
          border: 'none',
          opacity: currentIndex <= 0 ? 0.5 : 1,
          cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer'
        }}
      >
        <IconChevronLeft size={20} />
      </ActionIcon>
      
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
      
      <ActionIcon
        size="xl"
        radius="xl"
        disabled={currentIndex >= attachments.length - 1}
        onClick={handleNext}
        style={{
          background: currentIndex >= attachments.length - 1 
            ? 'var(--theme-bg-secondary)' 
            : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          color: currentIndex >= attachments.length - 1 ? 'var(--theme-text-disabled)' : 'white',
          border: 'none',
          opacity: currentIndex >= attachments.length - 1 ? 0.5 : 1,
          cursor: currentIndex >= attachments.length - 1 ? 'not-allowed' : 'pointer'
        }}
      >
        <IconChevronRight size={20} />
      </ActionIcon>
    </Group>
  );

  const FileSelector = () => (
    <Box>
      <Text 
        style={{ 
          fontSize: '16px', 
          fontWeight: '600',
          color: 'var(--theme-text-primary)',
          marginBottom: '12px'
        }}
      >
        Файлы ({attachments.length})
      </Text>
      <Group gap="12px" wrap="wrap">
      {attachments.map((attachment, index) => {
        const src = typeof attachment.source === 'string'
          ? attachment.source.split('\\').pop() || attachment.source.split('/').pop() || 'Файл'
          : attachment.source.name;
          
          const ext = typeof attachment.source === 'string'
            ? attachment.source.split('.').pop()?.toLowerCase() || ''
            : attachment.source.name.split('.').pop()?.toLowerCase() || '';
          
          const FileIcon = getFileIcon(ext);
          const isActive = currentIndex === index;
          
        return (
            <Box
            key={attachment.id || `attachment-${index}`}
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
              <Group gap="12px" align="center">
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
                    style={{
                      color: isActive ? 'rgba(255, 255, 255, 0.8)' : 'var(--theme-text-secondary)',
                      fontSize: '12px',
                      marginTop: '2px'
                    }}
                  >
                    {ext.toUpperCase()}
                  </Text>
                </Box>
                {isActive && (
                  <Badge
                    size="sm"
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    Активный
                  </Badge>
                )}
              </Group>
            </Box>
        );
      })}
    </Group>
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
              fontWeight: '600'
            }}
          >
            Не удалось открыть файл
          </Text>
        </Box>
      );
    }

    if (isImage) {
      return (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            overflow: 'hidden'
          }}
        >
          <Image
            src={fileUrl}
            alt={fileName}
            fit="contain"
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 300px)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
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
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '20px',
            minHeight: '400px',
            overflow: 'hidden'
          }}
        >
          <iframe
            title="PDF Viewer"
            src={`${fileUrl}#toolbar=0&navpanes=0`}
            style={{
              width: '100%',
              height: 'calc(100vh - 350px)',
              border: 'none',
              minHeight: 400,
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
            }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
        </Box>
      );
    }

    if (isText) {
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
          <Paper 
            withBorder 
            p="md" 
            style={{
            width: '100%',
            height: 'calc(100vh - 300px)',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
              backgroundColor: 'var(--theme-bg-primary)',
              borderRadius: '8px',
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
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px'
          }}
        >
          <Box
            style={{
              width: '100%',
              maxWidth: '400px',
              background: 'var(--theme-bg-primary)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid var(--theme-border-secondary)'
            }}
          >
          <audio
            controls
            src={fileUrl}
              style={{ 
                width: '100%',
                height: '40px'
              }}
            onLoadedData={() => setLoading(false)}
            onError={() => setError(true)}
          >
            Ваш браузер не поддерживает элемент audio.
          </audio>
          </Box>
        </Box>
      );
    }

    if (isVideo) {
      return (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            overflow: 'hidden'
          }}
        >
          <video
            controls
            style={{ 
              maxWidth: '100%', 
              maxHeight: 'calc(100vh - 300px)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
            }}
            src={fileUrl}
            onLoadedData={() => setLoading(false)}
            onError={() => setError(true)}
          >
            Ваш браузер не поддерживает видео.
          </video>
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
          Формат файла {fileExt.toUpperCase()} не поддерживает встроенный просмотр
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
      zIndex={9999999}
      className="file-preview-modal"
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
          background: 'var(--theme-bg-primary)',
          zIndex: '9999999 !important'
        },
        overlay: {
          zIndex: '9999998 !important'
        }
      }}
    >
      <Box
        style={{
          background: 'var(--theme-bg-primary)',
          minHeight: '100vh',
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
                <Text 
                  style={{ 
                    color: 'rgba(255, 255, 255, 0.8)', 
                    fontSize: '14px',
                    marginTop: '4px'
                  }}
                >
                  {fileExt.toUpperCase()} • {currentIndex + 1} из {attachments.length}
                </Text>
              </Box>
            </Group>
            
            <Group gap="12px">
              <Tooltip label="Скачать файл">
                <ActionIcon
                  size="lg"
                  radius="xl"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = fileUrl;
                    link.download = fileName;
                    link.click();
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
              
              <Tooltip label="Закрыть">
                <ActionIcon
                  size="lg"
                  radius="xl"
                  onClick={onClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  <IconX size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Box>

        {/* Основной контент */}
        <Box style={{ flex: 1, padding: '24px' }}>
          <Stack gap="md" style={{ height: '100%' }}>
            {renderContent()}
          </Stack>
        </Box>

        {/* Нижняя панель с навигацией */}
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderTop: '1px solid var(--theme-border-primary)',
            padding: '20px 24px'
      }}
    >
      <Stack gap="md">
        <FileSelector />
        <FileNavigation />
      </Stack>
        </Box>
      </Box>
    </Modal>
  );
};
