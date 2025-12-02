import { Modal, Loader, Stack, Text, Group, Paper, Box, ActionIcon, Tooltip, Button, Slider } from '@mantine/core';
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { API } from '../config/constants';
import { IconFile, IconFileText, IconFileTypePdf, IconPhoto, IconMusic, IconVideo, IconDownload, IconChevronLeft, IconChevronRight, IconX, IconTrash, IconExternalLink, IconRotate2, IconRotateClockwise2, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './styles/FilePreviewModal.css';

// Настройка worker для PDF.js - используем локальный worker из node_modules
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

// Интерфейсы для типизации
interface AuthFileLoaderProps {
  src: string;
  onMimeTypeDetected?: (mimeType: string) => void;
  onLoad?: () => void;
  onError?: () => void;
  children: (url: string) => React.ReactNode;
}

interface AuthImageProps {
  src: string;
  alt?: string;
  onMimeTypeDetected?: (mimeType: string) => void;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  className?: string;
}

// Компонент для загрузки файлов с заголовками авторизации
const AuthFileLoader = ({ src, onMimeTypeDetected, onLoad, onError, children }: AuthFileLoaderProps) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
      if (!src) return;

      let currentBlobUrl: string | null = null;

      if (src.startsWith('http') && !src.startsWith('blob:')) {
        // Для защищённых URL добавляем заголовки авторизации
        const fetchWithAuthRetry = async () => {
          const doFetch = async (token?: string | null) => {
            const headers: HeadersInit = {};
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(src, { headers, credentials: 'include' });
            if (response.status === 401) {
              throw Object.assign(new Error('Unauthorized'), { status: 401 });
            }
            if (!response.ok) {
              throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && onMimeTypeDetected) {
              onMimeTypeDetected(contentType);
            }
            return response.blob();
          };

          try {
            // Первая попытка с текущим токеном
            const token = localStorage.getItem('token');
            const blob = await doFetch(token);
            const newBlobUrl = URL.createObjectURL(blob);
            currentBlobUrl = newBlobUrl;
            setBlobUrl(newBlobUrl);
            setLoading(false);
            if (onLoad) onLoad();
          } catch (err: any) {
            // Если получили 401, пробуем обновить токен и повторить запрос
            if (err?.status === 401) {
              try {
                const refreshResponse = await fetch(`${API}/refresh-token`, {
                  method: 'POST',
                  credentials: 'include',
                });

                if (refreshResponse.ok) {
                  const newToken = await refreshResponse.json();
                  localStorage.setItem('token', newToken);
                  const blob = await doFetch(newToken);
                  const newBlobUrl = URL.createObjectURL(blob);
                  currentBlobUrl = newBlobUrl;
                  setBlobUrl(newBlobUrl);
                  setLoading(false);
                  if (onLoad) onLoad();
                  return;
                }
              } catch (refreshError) {
                console.error('AuthFileLoader: token refresh failed', refreshError);
              }
            }

            console.error('AuthFileLoader: Error loading file:', err);
            setError(true);
            setLoading(false);
            if (onError) onError();
          }
        };

        void fetchWithAuthRetry();
      } else {
        // Для локальных URL и blob URL используем как есть
        setBlobUrl(null);
        setLoading(false);
        if (onLoad) onLoad();
      }

      return () => {
        // Очистка при размонтировании или изменении src
        if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(currentBlobUrl);
          } catch (error) {
            console.warn('Failed to revoke blob URL:', error);
          }
        }
      };
    }, [src, onMimeTypeDetected, onLoad, onError]);

    // Очистка при размонтировании компонента
    useEffect(() => {
      return () => {
        if (blobUrl && blobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (error) {
            console.warn('Failed to revoke blob URL on unmount:', error);
          }
        }
      };
    }, [blobUrl]);

  if (loading) {
    return <Loader size="md" />;
  }

  if (error) {
    return <Text c="red">Ошибка загрузки файла</Text>;
  }

  return children(blobUrl || src);
};

// Компонент для загрузки изображений с заголовками авторизации
const AuthImage = ({ src, alt, onMimeTypeDetected, onLoad, onError, ...props }: AuthImageProps) => {
  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    if (onLoad) {
      onLoad(event);
    }
  }, [onLoad]);

  return (
    <AuthFileLoader 
      src={src} 
      onMimeTypeDetected={onMimeTypeDetected}
      onError={onError}
    >
      {(blobUrl: string) => (
        <img 
          src={blobUrl} 
          alt={alt || ''} 
          onLoad={handleLoad}
          onError={onError}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block'
          }}
          {...props} 
        />
      )}
    </AuthFileLoader>
  );
};

// Компонент для превью PDF (рендерит первую страницу как изображение)
interface PdfThumbnailProps {
  src: string;
  className?: string;
}

const PdfThumbnail = ({ src, className }: PdfThumbnailProps) => {
  const [pageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const onDocumentLoadSuccess = useCallback(() => {
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setError(true);
    setLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback(() => {
    setLoading(false);
  }, []);

  if (error) {
    return (
      <Box className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--mantine-color-gray-1)' }}>
        <IconFileTypePdf size={48} color="var(--mantine-color-red-6)" />
      </Box>
    );
  }

  return (
    <Box className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {loading && (
        <Box style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--mantine-color-gray-1)' }}>
          <Loader size="sm" />
        </Box>
      )}
      <Document
        file={src}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={null}
        className="pdf-thumbnail-document"
      >
        <Page
          pageNumber={pageNumber}
          onLoadSuccess={onPageLoadSuccess}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          className="pdf-thumbnail-page"
          width={undefined}
          height={undefined}
          canvasRef={canvasRef}
        />
      </Document>
    </Box>
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
const MIN_IMAGE_ZOOM = 25;
const MAX_IMAGE_ZOOM = 400;

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
  const [rotation, setRotation] = useState(0);
  const [imageZoom, setImageZoom] = useState(100);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [overlayHeights, setOverlayHeights] = useState({ top: 0, bottom: 0 });

  const topOverlayRef = useRef<HTMLDivElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);

  const attachmentMeta = useMemo(() => {
    return attachments.map((attachment, index) => {
      const source = attachment.source;
      const providedName = attachment.name;
      const providedMime = attachment.mimeType;

      let ext = typeof source === 'string'
        ? source.split('.').pop()?.toLowerCase() || ''
        : source.name.split('.').pop()?.toLowerCase() || '';

      if (!ext && providedMime) {
        if (providedMime.startsWith('image/')) ext = 'jpg';
        else if (providedMime === 'application/pdf') ext = 'pdf';
        else if (providedMime.startsWith('video/')) ext = 'mp4';
      }

      const isImage = SUPPORTED_IMAGE_EXTS.includes(ext) || (providedMime || '').startsWith('image/');
      const isVideo = SUPPORTED_VIDEO_EXTS.includes(ext) || (providedMime || '').startsWith('video/');
      const isPdf = SUPPORTED_PDF_EXTS.includes(ext) || providedMime === 'application/pdf';

      const resolvedUrl = typeof source === 'string'
        ? (source.startsWith('http') || source.startsWith('blob:') ? source : `${API}/${source}`)
        : URL.createObjectURL(source);

      let inferredName = providedName;
      if (!inferredName) {
        if (typeof source === 'string') {
          const cleanPath = source.split('?')[0];
          const pathParts = cleanPath.split(/[\\\/]/);
          let fileName = pathParts[pathParts.length - 1];
          if (!fileName || fileName.length < 3 || /^[a-f0-9-]+$/i.test(fileName)) {
            fileName = pathParts[pathParts.length - 2] || 'Файл';
          }
          inferredName = decodeURIComponent(fileName);
        } else {
          inferredName = source.name;
        }
      }

      return {
        id: attachment.id || `attachment-${index}`,
        name: inferredName,
        ext,
        previewUrl: resolvedUrl,
        shouldRevoke: typeof source !== 'string',
        isImage,
        isVideo,
        isPdf,
      };
    });
  }, [attachments, API]);

  useEffect(() => {
    return () => {
      attachmentMeta.forEach((meta) => {
        if (meta.shouldRevoke && meta.previewUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(meta.previewUrl);
          } catch (error) {
            console.warn('Failed to revoke blob URL:', error);
          }
        }
      });
    };
  }, [attachmentMeta]);

  // Нормализация угла поворота в диапазон 0-360
  const normalizeRotation = (angle: number): number => {
    return ((angle % 360) + 360) % 360;
  };

  // Получение нормализованного угла поворота
  const normalizedRotation = normalizeRotation(rotation);

  // Проверка, нужно ли применять специальную логику размеров (для 90 и 270 градусов)
  const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270;
  const [fileMimeType, setFileMimeType] = useState<string>('');
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const rotationContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });

  const naturalWidth = imageNaturalSize.width || containerSize.width || 1;
  const naturalHeight = imageNaturalSize.height || containerSize.height || 1;
  const displayedWidth = isRotated90or270 ? naturalHeight : naturalWidth;
  const displayedHeight = isRotated90or270 ? naturalWidth : naturalHeight;

  const baseScale = useMemo(() => {
    if (!displayedWidth || !displayedHeight || !containerSize.width || !containerSize.height) {
      return 1;
    }

    const availableWidth = containerSize.width;
    const availableHeight = Math.max(
      containerSize.height - overlayHeights.top - overlayHeights.bottom,
      1
    );

    const widthScale = availableWidth / displayedWidth;
    const heightScale = availableHeight / displayedHeight;
    const scale = Math.min(widthScale, heightScale);

    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, [
    displayedWidth,
    displayedHeight,
    containerSize.width,
    containerSize.height,
    overlayHeights.top,
    overlayHeights.bottom
  ]);

  const effectiveScale = useMemo(
    () => baseScale * (imageZoom / 100),
    [baseScale, imageZoom]
  );

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
    const providedName = currentAttachment.name;
    const providedMime = currentAttachment.mimeType;
    
    // Сначала пытаемся извлечь расширение из providedName (если оно есть)
    let ext = '';
    if (providedName) {
      const nameParts = providedName.split(/[\\\/]/);
      const fileNameOnly = nameParts[nameParts.length - 1];
      ext = fileNameOnly.split('.').pop()?.toLowerCase() || '';
    }
    
    // Если расширение не найдено в имени, пытаемся извлечь из source
    if (!ext) {
      ext = typeof source === 'string'
        ? source.split('.').pop()?.toLowerCase() || ''
        : source.name.split('.').pop()?.toLowerCase() || '';
    }

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

    // Извлекаем имя файла без пути и расширения
    let baseFileName = providedName;
    if (!baseFileName) {
      if (typeof source === 'string') {
        const cleanPath = source.split('?')[0];
        const pathParts = cleanPath.split(/[\\\/]/);
        const fullFileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'Файл');
        // Убираем расширение из имени файла
        const lastDotIndex = fullFileName.lastIndexOf('.');
        baseFileName = lastDotIndex > 0 ? fullFileName.slice(0, lastDotIndex) : fullFileName;
      } else {
        const fullFileName = source.name;
        const lastDotIndex = fullFileName.lastIndexOf('.');
        baseFileName = lastDotIndex > 0 ? fullFileName.slice(0, lastDotIndex) : fullFileName;
      }
    } else {
      // Если имя предоставлено, извлекаем только имя файла (без пути)
      // Обрабатываем случай, когда providedName может содержать путь
      const pathParts = baseFileName.split(/[\\\/]/);
      const fileNameOnly = pathParts[pathParts.length - 1];
      // Убираем расширение из имени файла
      const lastDotIndex = fileNameOnly.lastIndexOf('.');
      baseFileName = lastDotIndex > 0 ? fileNameOnly.slice(0, lastDotIndex) : fileNameOnly;
    }

    return {
      ext,
      isImage,
      isPdf,
      isText,
      isAudio,
      isVideo,
      fileName: baseFileName,
      fileUrl: typeof source === 'string'
        ? source.startsWith('http') || source.startsWith('blob:') ? source : `${API}/${source}`
        : URL.createObjectURL(source),
      fileExt: ext,
      downloadUrl: typeof source === 'string'
        ? (source.startsWith('http') || source.startsWith('blob:') ? source : `${API}/${source}`)
        : ''
    };
  }, [currentAttachment, API, fileMimeType]);

  useEffect(() => {
    setRotation(0);
    setImageZoom(100);
    setImageOffset({ x: 0, y: 0 });
    setImageNaturalSize({ width: 0, height: 0 });
  }, [currentIndex]);

  useEffect(() => {
    if (!isImage) {
      setImageZoom(100);
      setImageOffset({ x: 0, y: 0 });
    }
  }, [isImage]);

  useEffect(() => {
    setImageOffset({ x: 0, y: 0 });
  }, [normalizedRotation]);

  // Измеряем высоту оверлеев для правильного расчета масштаба
  useLayoutEffect(() => {
    const measureOverlays = () => {
      const topOverlay = topOverlayRef.current;
      const bottomControls = bottomControlsRef.current;

      const topHeight = topOverlay ? topOverlay.getBoundingClientRect().height : 0;
      const bottomHeight = bottomControls ? bottomControls.getBoundingClientRect().height : 0;

      setOverlayHeights({ top: topHeight, bottom: bottomHeight });
    };

    measureOverlays();
    // Переизмеряем при изменении размеров окна или содержимого
    const resizeObserver = new ResizeObserver(measureOverlays);
    
    if (topOverlayRef.current) {
      resizeObserver.observe(topOverlayRef.current);
    }
    if (bottomControlsRef.current) {
      resizeObserver.observe(bottomControlsRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [isImage, currentIndex, imageZoom]);

  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    setLoading(false);
    // Для PNG и других изображений получаем реальные размеры
    const img = target as HTMLImageElement;
    if (img?.naturalWidth && img?.naturalHeight) {
      setImageNaturalSize({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    } else if (img?.width && img?.height) {
      // Fallback на отображаемые размеры, если natural размеры недоступны
      setImageNaturalSize({
        width: img.width,
        height: img.height
      });
    }
  }, []);

  const handleImageError = useCallback(() => {
    setError(true);
    setLoading(false);
    setImageNaturalSize({ width: 0, height: 0 });
  }, []);

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const padding = 8;
      const availableWidth = containerSize.width;
      const availableHeight = Math.max(
        containerSize.height - overlayHeights.top - overlayHeights.bottom,
        1
      );

      const excessWidth = Math.max(0, displayedWidth * scale - availableWidth);
      const excessHeight = Math.max(0, displayedHeight * scale - availableHeight);

      const halfWidth = (excessWidth + padding) / 2;
      const halfHeight = (excessHeight + padding) / 2;

      return {
        x: Math.min(Math.max(x, -halfWidth), halfWidth),
        y: Math.min(Math.max(y, -halfHeight), halfHeight)
      };
    },
    [
      displayedWidth,
      displayedHeight,
      containerSize.width,
      containerSize.height,
      overlayHeights.top,
      overlayHeights.bottom
    ]
  );

  const handleZoomChange = useCallback(
    (value: number) => {
      const limitedValue = Math.min(Math.max(value, MIN_IMAGE_ZOOM), MAX_IMAGE_ZOOM);
      setImageZoom(limitedValue);
      if (limitedValue <= 100) {
        setImageOffset({ x: 0, y: 0 });
      } else {
        const scale = limitedValue / 100;
        const availableWidth = containerSize.width || 1;
        const availableHeight = Math.max(
          (containerSize.height || 1) - overlayHeights.top - overlayHeights.bottom,
          1
        );
        
        if (isPdf) {
          // Для PDF рассчитываем offset на основе размера контейнера
          const excessWidth = Math.max(0, availableWidth * scale - availableWidth);
          const excessHeight = Math.max(0, availableHeight * scale - availableHeight);
          const maxOffsetX = excessWidth / 2;
          const maxOffsetY = excessHeight / 2;
          setImageOffset(current => ({
            x: Math.min(Math.max(current.x, -maxOffsetX), maxOffsetX),
            y: Math.min(Math.max(current.y, -maxOffsetY), maxOffsetY)
          }));
        } else {
          // Для изображений используем расчет с учетом реальных размеров изображения
          const actualScale = baseScale * scale;
          const excessWidth = Math.max(0, displayedWidth * actualScale - availableWidth);
          const excessHeight = Math.max(0, displayedHeight * actualScale - availableHeight);
          const maxOffsetX = excessWidth / 2;
          const maxOffsetY = excessHeight / 2;
          setImageOffset(current => ({
            x: Math.min(Math.max(current.x, -maxOffsetX), maxOffsetX),
            y: Math.min(Math.max(current.y, -maxOffsetY), maxOffsetY)
          }));
        }
      }
    },
    [baseScale, isPdf, containerSize, overlayHeights, displayedWidth, displayedHeight]
  );


  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (imageZoom <= 100) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (e) {
        // Pointer capture may not be supported
      }
      setIsDragging(true);
      dragStartRef.current = {
        x: event.clientX - imageOffset.x,
        y: event.clientY - imageOffset.y
      };
    },
    [imageZoom, imageOffset.x, imageOffset.y]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.preventDefault();
      setImageOffset(() => {
        const nextX = event.clientX - dragStartRef.current.x;
        const nextY = event.clientY - dragStartRef.current.y;
        
        if (isPdf) {
          // Для PDF рассчитываем offset на основе размера контейнера
          const scale = imageZoom / 100;
          const availableWidth = containerSize.width || 1;
          const availableHeight = Math.max(
            (containerSize.height || 1) - overlayHeights.top - overlayHeights.bottom,
            1
          );
          const excessWidth = Math.max(0, availableWidth * scale - availableWidth);
          const excessHeight = Math.max(0, availableHeight * scale - availableHeight);
          const maxOffsetX = excessWidth / 2;
          const maxOffsetY = excessHeight / 2;
          return {
            x: Math.min(Math.max(nextX, -maxOffsetX), maxOffsetX),
            y: Math.min(Math.max(nextY, -maxOffsetY), maxOffsetY)
          };
        } else {
          // Для изображений используем clampOffset с учетом реальных размеров
          return clampOffset(nextX, nextY, effectiveScale);
        }
      });
    },
    [isDragging, clampOffset, effectiveScale, isPdf, imageZoom, containerSize, overlayHeights]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (e) {
        // Ignore if releasePointerCapture is unsupported
      }
      setIsDragging(false);
    },
    [isDragging]
  );

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => {
      const nextIndex = prev < attachments.length - 1 ? prev + 1 : prev;
      if (nextIndex !== prev) {
        setLoading(true);
        // Небольшая задержка для плавного перехода
        setTimeout(() => {
          setCurrentIndex(nextIndex);
        }, 50);
        return prev; // Возвращаем текущий индекс, так как обновление происходит в setTimeout
      }
      return prev;
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
        return prev; // Возвращаем текущий индекс, так как обновление происходит в setTimeout
      }
      return prev;
    });
  }, []);

  const handleFileSelect = useCallback((index: number) => {
    if (index === currentIndex) return; // Не переключаем если уже выбран этот файл

    setLoading(true);
    // Небольшая задержка для плавного перехода
    setTimeout(() => {
      setCurrentIndex(index);
    }, 50);
  }, [currentIndex]);

  // Функция для открытия файла в новой вкладке с токеном авторизации
  const openInNewTab = useCallback(async () => {
    if (!currentAttachment) return;
    
    try {
      const fetchWithAuthRetry = async () => {
        const doFetch = async (token?: string | null) => {
          const headers: Record<string, string> = {};
          if (requireAuth && token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch(fileUrl, { headers, credentials: 'include' });
          if (response.status === 401 && requireAuth) {
            throw Object.assign(new Error('Unauthorized'), { status: 401 });
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.blob();
        };

        const openBlob = (blob: Blob) => {
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        };

        if (fileUrl.startsWith('http')) {
          try {
            const token = localStorage.getItem('token');
            const blob = await doFetch(token);
            openBlob(blob);
          } catch (err: any) {
            if (requireAuth && err?.status === 401) {
              try {
                const refreshResponse = await fetch(`${API}/refresh-token`, {
                  method: 'POST',
                  credentials: 'include',
                });
                if (refreshResponse.ok) {
                  const newToken = await refreshResponse.json();
                  localStorage.setItem('token', newToken);
                  const blob = await doFetch(newToken);
                  openBlob(blob);
                  return;
                }
              } catch (refreshError) {
                console.error('openInNewTab: token refresh failed', refreshError);
              }
            }
            throw err;
          }
        } else {
          // Для локальных файлов или других протоколов открываем напрямую
          window.open(fileUrl, '_blank');
        }
      };

      await fetchWithAuthRetry();
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

  // Измеряем размеры контейнера для правильного расчета размеров при повороте
  useEffect(() => {
    const updateSize = () => {
      const target = rotationContainerRef.current || imageContainerRef.current;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const styles = getComputedStyle(target);
      const paddingX =
        parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const paddingY =
        parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');

      setContainerSize({
        width: Math.max(rect.width - paddingX, 0),
        height: Math.max(rect.height - paddingY, 0)
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    
    // Добавляем обработчик wheel с passive: false для возможности preventDefault
    const container = rotationContainerRef.current || imageContainerRef.current;
    if (container && (isImage || isPdf)) {
      const wheelHandler = (e: WheelEvent) => {
        if (isImage || isPdf) {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY > 0 ? -10 : 10;
          setImageZoom(prev => {
            const next = Math.min(Math.max(prev + delta, MIN_IMAGE_ZOOM), MAX_IMAGE_ZOOM);
            if (next <= 100) {
              setImageOffset({ x: 0, y: 0 });
            } else {
              const scale = next / 100;
              const availableWidth = containerSize.width || 1;
              const availableHeight = Math.max(
                (containerSize.height || 1) - overlayHeights.top - overlayHeights.bottom,
                1
              );
              
              if (isPdf) {
                // Для PDF рассчитываем offset на основе размера контейнера
                const excessWidth = Math.max(0, availableWidth * scale - availableWidth);
                const excessHeight = Math.max(0, availableHeight * scale - availableHeight);
                const maxOffsetX = excessWidth / 2;
                const maxOffsetY = excessHeight / 2;
                setImageOffset(current => ({
                  x: Math.min(Math.max(current.x, -maxOffsetX), maxOffsetX),
                  y: Math.min(Math.max(current.y, -maxOffsetY), maxOffsetY)
                }));
              } else {
                // Для изображений используем расчет с учетом реальных размеров изображения
                const actualScale = baseScale * scale;
                const excessWidth = Math.max(0, displayedWidth * actualScale - availableWidth);
                const excessHeight = Math.max(0, displayedHeight * actualScale - availableHeight);
                const maxOffsetX = excessWidth / 2;
                const maxOffsetY = excessHeight / 2;
                setImageOffset(current => ({
                  x: Math.min(Math.max(current.x, -maxOffsetX), maxOffsetX),
                  y: Math.min(Math.max(current.y, -maxOffsetY), maxOffsetY)
                }));
              }
            }
            return next;
          });
        }
      };
      
      container.addEventListener('wheel', wheelHandler, { passive: false });
      return () => {
        window.removeEventListener('resize', updateSize);
        container.removeEventListener('wheel', wheelHandler);
      };
    }
    
    return () => window.removeEventListener('resize', updateSize);
  }, [opened, currentIndex, normalizedRotation, isImage, isPdf, containerSize, overlayHeights, baseScale, displayedWidth, displayedHeight]);

  useEffect(() => {
    if (!currentAttachment) return;

    setLoading(true);
    // Если MIME пришел извне — используем его сразу
    if (currentAttachment.mimeType) {
      setFileMimeType(currentAttachment.mimeType);
    } else {
      setFileMimeType('');
    }

    // Вычисляем fileUrl для использования в эффекте
    const computedFileUrl = typeof currentAttachment.source === 'string'
      ? (currentAttachment.source.startsWith('http') || currentAttachment.source.startsWith('blob:') 
          ? currentAttachment.source 
          : `${API}/${currentAttachment.source}`)
      : URL.createObjectURL(currentAttachment.source);

    // Получаем MIME-тип файла для правильного определения типа, только если он не был предоставлен
    if (!currentAttachment.mimeType && typeof currentAttachment.source === 'string' && computedFileUrl.startsWith('http') && !computedFileUrl.startsWith('blob:')) {
      const headers: HeadersInit = {};
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Делаем HEAD запрос для получения заголовков
      fetch(computedFileUrl, { method: 'HEAD', headers })
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch headers');
          }
          const contentType = response.headers.get('content-type');
          if (contentType) {
            setFileMimeType(contentType);
          }
        })
        .catch((error) => {
          // Если не удалось получить заголовки, продолжаем без MIME-типа
          console.warn('Failed to fetch MIME type:', error);
        });
    }

    if (isText && typeof currentAttachment.source === 'string') {
      const headers: HeadersInit = {};
      
      // Добавляем токен авторизации для внешних URL
      if (computedFileUrl.startsWith('http') && !computedFileUrl.startsWith('blob:')) {
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      fetch(computedFileUrl, { headers })
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
        .catch((error) => {
          console.error('Failed to fetch text file:', error);
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
      // Очистка blob URL только если это локальный файл
      if (currentAttachment && typeof currentAttachment.source !== 'string' && computedFileUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(computedFileUrl);
        } catch (error) {
          console.warn('Failed to revoke blob URL:', error);
        }
      }
    };
  }, [currentAttachment, isText, API]);

  const fileSelectorContent = useMemo(() => (
    <Stack gap="10px" className="file-selector">
      {attachmentMeta.map((meta, index) => {
        const isActive = currentIndex === index;
        const FileIcon = getFileIcon(meta.ext);

        return (
          <Box
            key={meta.id}
            onClick={() => handleFileSelect(index)}
            className={`file-preview-modal__thumbnail${isActive ? ' file-preview-modal__thumbnail--active' : ''}`}
          >
            <Box className="file-preview-modal__thumbnail-preview">
              {meta.isImage && (
                <AuthFileLoader src={meta.previewUrl}>
                  {(blobUrl: string) => (
                    <img
                      src={blobUrl}
                      alt={meta.name}
                      className="file-preview-modal__thumbnail-media"
                    />
                  )}
                </AuthFileLoader>
              )}

              {meta.isVideo && (
                <AuthFileLoader src={meta.previewUrl}>
                  {(blobUrl: string) => (
                    <video
                      src={blobUrl}
                      className="file-preview-modal__thumbnail-media"
                      muted
                      loop
                      playsInline
                      autoPlay
                    />
                  )}
                </AuthFileLoader>
              )}

              {meta.isPdf && (
                <AuthFileLoader src={meta.previewUrl}>
                  {(blobUrl: string) => (
                    <PdfThumbnail src={blobUrl} className="file-preview-modal__thumbnail-media" />
                  )}
                </AuthFileLoader>
              )}

              {!meta.isImage && !meta.isVideo && !meta.isPdf && (
                <Box
                  className="file-preview-modal__thumbnail-icon"
                  style={{
                    background: isActive ? 'rgba(255, 255, 255, 0.2)' : `${getFileColor(meta.ext)}33`
                  }}
                >
                  <FileIcon size={28} color={isActive ? 'white' : getFileColor(meta.ext)} />
                </Box>
              )}
            </Box>

            <Box className="file-preview-modal__thumbnail-info">
              <Text
                className={`file-preview-modal__thumbnail-name${isActive ? ' is-active' : ''}`}
                lineClamp={2}
              >
                {meta.name}
              </Text>
              <Text className="file-preview-modal__thumbnail-ext">
                {meta.ext ? meta.ext.toUpperCase() : 'ФАЙЛ'}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Stack>
  ), [attachmentMeta, currentIndex, handleFileSelect]);



  const renderContent = () => {
    if (loading) {
      return (
        <Box className="file-preview-modal__status file-preview-modal__status--loading">
          <Loader size="lg" color="var(--color-primary-500)" />
          <Text className="file-preview-modal__status-title">
            Загружается файл...
          </Text>
        </Box>
      );
    }

    if (error) {
      return (
        <Box className="file-preview-modal__status file-preview-modal__status--error">
          <Box className="file-preview-modal__status-icon">
            <IconX size={32} color="var(--color-red-500)" />
          </Box>
          <Text className="file-preview-modal__status-title">
            Файл не найден или недоступен
          </Text>
          <Text className="file-preview-modal__status-subtitle">
            Возможно, файл был удален или у вас нет прав на его просмотр
          </Text>
        </Box>
      );
    }

    if (isImage) {
      const cursor = imageZoom > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default';

      return (
        <Box className="image-container" ref={imageContainerRef}>
          <Box className="image-controls-overlay" ref={topOverlayRef}>
            <Group
              justify="space-between"
              align="center"
              className="file-preview-modal__overlay-controls"
            >
              <Box className="file-counter file-preview-modal__overlay-counter">
              <Text className="file-counter-text">
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>
              <Group gap="xs">
              <ActionIcon 
                  className="rotate-button file-preview-modal__overlay-button"
                  variant="subtle"
                  aria-label="Повернуть влево"
                  onClick={() => setRotation(prev => normalizeRotation(prev - 90))}
              > 
                <IconRotate2 stroke={1.5} />
              </ActionIcon>
              <ActionIcon 
                  className="rotate-button file-preview-modal__overlay-button"
                  variant="subtle"
                  aria-label="Повернуть вправо"
                  onClick={() => setRotation(prev => normalizeRotation(prev + 90))}
              > 
                <IconRotateClockwise2 stroke={1.5} />
              </ActionIcon>
            </Group>
            <Button
                className="open-new-tab-button file-preview-modal__overlay-open"
              variant="outline"
                size="xs"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
            >
                Открыть
            </Button>
          </Group>
          </Box>
          <Box
            ref={rotationContainerRef}
            className="rotation-container"
          >
            <Box
              className="rotation-wrapper"
              style={{
                transform: `rotate(${normalizedRotation}deg)`,
                width: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%',
                height: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%'
              }}
            >
              <Box
                className="zoom-wrapper"
                style={{
                  transform: `translate3d(${imageOffset.x}px, ${imageOffset.y}px, 0) scale(${effectiveScale})`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease',
                  cursor,
                  touchAction: imageZoom > 100 ? 'none' : 'auto',
                  userSelect: 'none'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <AuthImage
                  src={fileUrl}
                  alt={fileName}
                  fit="contain"
                  className="file-preview-modal__image"
                  onMimeTypeDetected={setFileMimeType}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              </Box>
          </Box>
          </Box>
          <Group gap="sm" align="center" justify="center" className="image-zoom-bar" ref={bottomControlsRef}>
            <IconZoomOut size={16} className="file-preview-modal__zoom-icon" />
            <Slider
              size='sm'
              value={imageZoom}
              min={MIN_IMAGE_ZOOM}
              max={MAX_IMAGE_ZOOM}
              step={5}
              onChange={handleZoomChange}
              className="file-preview-modal__zoom-slider"
            />
            <IconZoomIn size={16} className="file-preview-modal__zoom-icon" />
            <Text size="sm" className="file-preview-modal__zoom-value">
              {imageZoom}%
            </Text>
          </Group>
        </Box>
      );
    }

    if (isPdf) {
      return (
        <Box className="image-container" ref={imageContainerRef}>
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box className="file-counter">
              <Text className="file-counter-text">
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>
            <Group>
              <ActionIcon 
                className="rotate-button"
                variant="default" 
                aria-label="Settings" 
                onClick={() => setRotation((prev) => normalizeRotation(prev - 90))}
              > 
                <IconRotate2 stroke={1.5} />
              </ActionIcon>
              <ActionIcon 
                className="rotate-button"
                variant="default" 
                aria-label="Settings" 
                onClick={() => setRotation((prev) => normalizeRotation(prev + 90))}
              > 
                <IconRotateClockwise2 stroke={1.5} />
              </ActionIcon>
            </Group>
            <Button
              className="open-new-tab-button"
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          <Box
            ref={rotationContainerRef}
            className="rotation-container"
            style={{
              overflow: 'hidden',
              cursor: imageZoom > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              position: 'relative'
            }}
            onMouseDown={(e) => {
              if (imageZoom > 100) {
                setIsDragging(true);
                dragStartRef.current = { 
                  x: e.clientX - imageOffset.x, 
                  y: e.clientY - imageOffset.y 
                };
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && imageZoom > 100) {
                const scale = imageZoom / 100;
                const availableWidth = containerSize.width || 1;
                const availableHeight = Math.max(
                  (containerSize.height || 1) - overlayHeights.top - overlayHeights.bottom,
                  1
                );
                const excessWidth = Math.max(0, availableWidth * scale - availableWidth);
                const excessHeight = Math.max(0, availableHeight * scale - availableHeight);
                const maxOffsetX = excessWidth / 2;
                const maxOffsetY = excessHeight / 2;
                setImageOffset({
                  x: Math.min(Math.max(e.clientX - dragStartRef.current.x, -maxOffsetX), maxOffsetX),
                  y: Math.min(Math.max(e.clientY - dragStartRef.current.y, -maxOffsetY), maxOffsetY)
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <Box
              className="rotation-wrapper"
              style={{
                transform: `rotate(${normalizedRotation}deg) scale(${imageZoom / 100}) translate(${imageOffset.x}px, ${imageOffset.y}px)`,
                width: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%',
                height: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%',
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                overflow: 'hidden'
              }}
            >
              <AuthFileLoader 
                src={fileUrl} 
                onMimeTypeDetected={setFileMimeType}
                onLoad={() => setLoading(false)}
                onError={() => setError(true)}
              >            
                {(blobUrl: string) => (
                  <iframe
                    title="PDF Viewer"
                    src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      overflow: 'hidden',
                      display: 'block'
                    }}
                    scrolling="no"
                    frameBorder="0"
                  />
                )}
              </AuthFileLoader>
            </Box>
          </Box>
          {/* Панель зума для PDF */}
          <Group gap="sm" align="center" justify="center" className="image-zoom-bar" ref={bottomControlsRef} style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
            <IconZoomOut size={16} className="file-preview-modal__zoom-icon" />
            <Slider
              value={imageZoom}
              onChange={handleZoomChange}
              min={MIN_IMAGE_ZOOM}
              max={MAX_IMAGE_ZOOM}
              step={5}
              className="file-preview-modal__zoom-slider"
              style={{ width: 200 }}
            />
            <IconZoomIn size={16} className="file-preview-modal__zoom-icon" />
            <Text size="sm" className="file-preview-modal__zoom-value">
              {imageZoom}%
            </Text>
          </Group>
        </Box>
      );
    }

    if (isText) {
      return (
        <Box className="image-container" ref={imageContainerRef}>
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center" className="file-preview-modal__info-bar">
            {/* Подсчет "4 из 5" слева */}
            <Box className="file-preview-modal__info-counter">
              {currentIndex + 1} из {attachments.length}
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              className="file-preview-modal__info-open"
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <Paper 
            withBorder 
            p="md" 
            className="file-preview-modal__text-viewer"
          >
            <pre className="file-preview-modal__text-pre">
              {fileContent}
            </pre>
          </Paper>
        </Box>
      );
    }

    if (isAudio) {
      return (
        <Box className="image-container" ref={imageContainerRef}>
          {/* Кнопка для открытия в новой вкладке */}
          <Group justify="space-between" align="center" className="file-preview-modal__info-bar">
            {/* Подсчет "4 из 5" слева */}
            <Box className="file-preview-modal__info-counter">
              {currentIndex + 1} из {attachments.length}
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              className="file-preview-modal__info-open"
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <Box className="file-preview-modal__audio-wrapper">
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
                  className="file-preview-modal__audio-player"
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
          <Group justify="space-between" align="center" className="file-preview-modal__info-bar">
            {/* Подсчет "4 из 5" слева */}
            <Box className="file-preview-modal__info-counter">
              {currentIndex + 1} из {attachments.length}
            </Box>

            {/* Кнопка "Открыть в новой вкладке" справа */}
            <Button
              className="file-preview-modal__info-open"
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
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
              <Box className="file-preview-modal__video-container">
                <video
                  controls
                  className="file-preview-modal__video-player"
                  src={blobUrl}
                >
                  Ваш браузер не поддерживает видео.
                </video>
              </Box>
            )}
          </AuthFileLoader>
        </Box>
      );
    }

    // Если файл не определен, попробуем отобразить его как iframe
    if (currentAttachment && typeof currentAttachment.source === 'string' && fileUrl.startsWith('http')) {
      return (
        <Box className="file-preview-modal__iframe-wrapper">
          <Group justify="space-between" align="center">
            {/* Подсчет "4 из 5" слева */}
            <Box className="file-counter">
              <Text className="file-counter-text">
                {currentIndex + 1} из {attachments.length}
              </Text>
            </Box>
            <Group>
              <ActionIcon 
                className="rotate-button"
                variant="default" 
                aria-label="Settings" 
                onClick={() => setRotation((prev) => normalizeRotation(prev - 90))}
              > 
                <IconRotate2 stroke={1.5} />
              </ActionIcon>
              <ActionIcon 
                className="rotate-button"
                variant="default" 
                aria-label="Settings" 
                onClick={() => setRotation((prev) => normalizeRotation(prev + 90))}
              > 
                <IconRotateClockwise2 stroke={1.5} />
              </ActionIcon>
            </Group>
            <Button
              className="open-new-tab-button"
              variant="outline"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              onClick={openInNewTab}
            >
              Открыть в новой вкладке
            </Button>
          </Group>
          
          <Box
            ref={rotationContainerRef}
            className="rotation-container"
          >
            <Box
              className="rotation-wrapper"
              style={{
                transform: `rotate(${normalizedRotation}deg)`,
                width: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%',
                height: isRotated90or270
                  ? `${Math.min(containerSize.height, containerSize.width)}px`
                  : '100%'
              }}
            >
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
                  />
                )}
              </AuthFileLoader>
            </Box>
          </Box>
        </Box>
      );
    }

    return (
      <Box className="file-preview-modal__fallback">
        <Box className="file-preview-modal__fallback-icon">
          <IconFile size={32} color="var(--color-gray-500)" />
        </Box>
        <Text className="file-preview-modal__fallback-title">
          Формат файла {fileExt.toUpperCase() || 'неизвестный'} не поддерживает встроенный просмотр
        </Text>
        <Text className="file-preview-modal__fallback-subtitle">
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
    >
      <Box className="file-preview-modal__container">
        {/* Современный заголовок */}
        <Box className="file-preview-modal__header">
          <Box className="file-preview-modal__header-decor" />
          
          <Group justify="space-between" align="center" className="file-preview-modal__header-content">
            <Group gap="12px" align="center">
              <Box className="file-preview-modal__file-icon">
                {(() => {
                  const FileIcon = getFileIcon(fileExt);
                  return <FileIcon size={20} color="white" />;
                })()}
              </Box>
              <Box>
                <Text className="file-preview-modal__file-title">
                  {fileName}
                </Text>
                {fileExt && (
                  <Text size="xs" c="dimmed" className="file-preview-modal__file-extension">
                    {fileExt.toUpperCase()}
                  </Text>
                )}
              </Box>
            </Group>
            
            <Group gap="8px" className="file-preview-modal__actions">
              <Tooltip label="Скачать файл">
                <ActionIcon
                  size="md"
                  radius="xl"
                  onClick={async () => {
                    try {
                      const url = downloadUrl || fileUrl;
                      // Создаем URL для скачивания, заменяя /view на /download
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
                        link.href = finalUrl;
                        link.download = fileName;
                        link.click();
                      }
                    } catch (e) {
                      // Фоллбэк — открыть в новой вкладке по /download
                      const fallbackUrl = (downloadUrl || fileUrl).replace(/\/view(?=(\?|#|$))/i, '/download');
                      window.open(fallbackUrl, '_blank');
                    }
                  }}
                  className="file-preview-modal__action-btn"
                >
                  <IconDownload size={20} />
                </ActionIcon>
              </Tooltip>
              
              {onDeleteFile && currentAttachment?.id && (
                <Tooltip label="Удалить файл">
                  <ActionIcon
                    size="md"
                    radius="xl"
                    onClick={async () => {
                      if (confirm('Вы уверены, что хотите удалить этот файл?')) {
                        await onDeleteFile(currentAttachment.id);
                      }
                    }}
                    className="file-preview-modal__action-btn file-preview-modal__action-btn--danger"
                  >
                    <IconTrash size={20} />
                  </ActionIcon>
                </Tooltip>
              )}
              
              
              <Tooltip label="Закрыть">
                <ActionIcon
                size="md"
                  radius="xl"
                  onClick={onClose}
                  className="file-preview-modal__action-btn file-preview-modal__action-btn--danger"
                >
                  <IconX size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Box>

        {/* Основной контент с кнопками навигации */}
        <Box className="file-preview-modal__content">
          {/* Левая колонка с файлами */}
          <Box className="file-preview-modal__sidebar">
            <Text className="file-preview-modal__sidebar-title">
              Файлы
            </Text>
            <Box className="file-preview-modal__sidebar-scroll">
              {fileSelectorContent}
            </Box>
          </Box>

          {/* Просмотр файла */}
          <Box className="file-preview-modal__viewer">
          {/* Кнопка "Назад" слева */}
          <ActionIcon
            size="xl"
            radius="xl"
            disabled={currentIndex <= 0}
            onClick={handlePrev}
              data-disabled={currentIndex <= 0}
              className="file-preview-modal__nav-button file-preview-modal__nav-button--prev"
          >
            <IconChevronLeft size={20} />
          </ActionIcon>

          {/* Кнопка "Вперед" справа */}
          <ActionIcon
            size="xl"
            radius="xl"
            disabled={currentIndex >= attachments.length - 1}
            onClick={handleNext}
              data-disabled={currentIndex >= attachments.length - 1}
              className="file-preview-modal__nav-button file-preview-modal__nav-button--next"
          >
            <IconChevronRight size={20} />
          </ActionIcon>

            <Stack gap="md" className="file-preview-modal__viewer-stack">
              <Box className="content-wrapper">
              {renderContent()}
            </Box>
          </Stack>
        </Box>
        </Box>
      </Box>

    </Modal>
  );
};
