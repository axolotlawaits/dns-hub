import { useEffect, useRef } from 'react';
import { Box, Text, Image, Stack } from '@mantine/core';
import { API } from '../../../../../config/constants';
// Теперь description уже в формате HTML

interface TelegramPreviewProps {
  name: string;
  description: string;
  images: string[] | File[];
}

export function TelegramPreview({ name, description, images }: TelegramPreviewProps) {
  const blobUrlsRef = useRef<string[]>([]);

  // Получаем URL изображений
  const imageUrls = images.map((img) => {
    if (img instanceof File) {
      const blobUrl = URL.createObjectURL(img);
      blobUrlsRef.current.push(blobUrl);
      return blobUrl;
    }
    if (typeof img === 'string') {
      return img.startsWith('http') ? img : `${API}/public/add/merch/${img}`;
    }
    return '';
  }).filter(Boolean);

  // Cleanup: освобождаем blob URLs при размонтировании
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          // Игнорируем ошибки при очистке
        }
      });
      blobUrlsRef.current = [];
    };
  }, []);

  // Описание уже в формате HTML - используем как есть
  // Формируем полный HTML с названием, если оно есть
  const htmlDescription = name && description 
    ? `<b>${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b><br><br>${description}`
    : name 
      ? `<b>${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`
      : description || '';

  return (
    <Box
      style={{
        background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 50%, #1e1e1e 100%)',
        borderRadius: '12px',
        padding: '12px',
        maxWidth: '400px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        minHeight: '500px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Фоновый паттерн Telegram */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(255, 255, 255, 0.01) 2px,
              rgba(255, 255, 255, 0.01) 4px
            )
          `,
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
      {/* Заголовок чата */}
      <Box
        style={{
          background: '#2b2b2b',
          padding: '12px 16px',
          borderRadius: '8px 8px 0 0',
          marginBottom: '8px',
          borderBottom: '1px solid #3a3a3a',
          position: 'relative',
          zIndex: 1
        }}
      >
        <Text
          size="sm"
          fw={600}
          style={{
            color: '#ffffff'
          }}
        >
          Мерч бот
        </Text>
        <Text
          size="xs"
          style={{
            color: '#999999',
            marginTop: '2px'
          }}
        >
          онлайн
        </Text>
      </Box>

      <Stack gap="xs" style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        {/* Сообщение сверху (имитация) */}
        <Box
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '4px'
          }}
        >
          <Box
            style={{
              background: '#2b2b2b',
              borderRadius: '12px 12px 12px 4px',
              padding: '8px 12px',
              maxWidth: '75%',
              border: '1px solid #3a3a3a'
            }}
          >
            <Text
              size="sm"
              style={{
                color: '#ffffff',
                lineHeight: '1.4'
              }}
            >
              Привет! 👋
            </Text>
            <Text
              size="xs"
              style={{
                color: '#999999',
                marginTop: '4px',
                textAlign: 'right'
              }}
            >
              10:23
            </Text>
          </Box>
        </Box>

        {/* Сообщение сверху 2 (имитация) */}
        <Box
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '4px'
          }}
        >
          <Box
            style={{
              background: '#2b2b2b',
              borderRadius: '12px 12px 12px 4px',
              padding: '8px 12px',
              maxWidth: '75%',
              border: '1px solid #3a3a3a'
            }}
          >
            <Text
              size="sm"
              style={{
                color: '#ffffff',
                lineHeight: '1.4'
              }}
            >
              Посмотрите на наши новые товары!
            </Text>
            <Text
              size="xs"
              style={{
                color: '#999999',
                marginTop: '4px',
                textAlign: 'right'
              }}
            >
              10:24
            </Text>
          </Box>
        </Box>

        {/* Наши сообщения - Изображения (отдельно от текста, отправляются первыми) */}
        {imageUrls.length > 0 && (
          <>
            {imageUrls.map((url, index) => (
              <Box
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: '4px'
                }}
              >
                <Box
                  style={{
                    borderRadius: '12px 12px 4px 12px',
                    overflow: 'hidden',
                    maxWidth: '75%',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                    background: '#0088cc'
                  }}
                >
                  <Image
                    src={url}
                    alt={`Preview ${index + 1}`}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      maxHeight: '300px',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <Box
                    style={{
                      padding: '4px 8px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    <Text
                      size="xs"
                      style={{
                        color: 'rgba(255, 255, 255, 0.9)'
                      }}
                    >
                      {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 13 13"
                      style={{
                        fill: 'rgba(255, 255, 255, 0.9)',
                        flexShrink: 0
                      }}
                    >
                      <path d="M5.5 4.5L2.5 7.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M8.5 4.5L11.5 7.5L8.5 10.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </Box>
                </Box>
              </Box>
            ))}
          </>
        )}

        {/* Наши сообщения - Текст (отправляется после фотографий) */}
        {htmlDescription && (
          <Box
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: '4px'
            }}
          >
            <Box
              style={{
                background: 'linear-gradient(135deg, #0088cc 0%, #0077b5 100%)',
                borderRadius: '12px 12px 4px 12px',
                padding: '8px 12px',
                maxWidth: '75%',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
              }}
            >
              <Text
                size="sm"
                style={{
                  color: '#ffffff',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4'
                }}
                dangerouslySetInnerHTML={{
                  __html: htmlDescription
                }}
              />
              <Box
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px'
                }}
              >
                <Text
                  size="xs"
                  style={{
                    color: 'rgba(255, 255, 255, 0.7)'
                  }}
                >
                  {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  style={{
                    fill: 'rgba(255, 255, 255, 0.7)',
                    flexShrink: 0
                  }}
                >
                  <path d="M5.5 4.5L2.5 7.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M8.5 4.5L11.5 7.5L8.5 10.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </Box>
            </Box>
          </Box>
        )}

        {/* Сообщение снизу (имитация) */}
        <Box
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginTop: '8px'
          }}
        >
          <Box
            style={{
              background: '#2b2b2b',
              borderRadius: '12px 12px 12px 4px',
              padding: '8px 12px',
              maxWidth: '75%',
              border: '1px solid #3a3a3a'
            }}
          >
            <Text
              size="sm"
              style={{
                color: '#ffffff',
                lineHeight: '1.4'
              }}
            >
              Спасибо! 😊
            </Text>
            <Text
              size="xs"
              style={{
                color: '#999999',
                marginTop: '4px',
                textAlign: 'right'
              }}
            >
              {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Box>
        </Box>
      </Stack>

      {/* Поле ввода (имитация) */}
      <Box
        style={{
          background: '#2b2b2b',
          padding: '8px 12px',
          borderRadius: '0 0 8px 8px',
          marginTop: '8px',
          borderTop: '1px solid #3a3a3a',
          position: 'relative',
          zIndex: 1
        }}
      >
        <Text
          size="xs"
          style={{
            color: '#999999'
          }}
        >
          Написать сообщение...
        </Text>
      </Box>
    </Box>
  );
}

