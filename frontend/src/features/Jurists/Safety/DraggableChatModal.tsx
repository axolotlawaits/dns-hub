import { useState, useRef, useEffect, ReactNode } from 'react';
import { Box, Group, ActionIcon } from '@mantine/core';
import { IconX, IconMinus, IconArrowsMaximize, IconArrowsMinimize } from '@tabler/icons-react';
import { createPortal } from 'react-dom';

interface DraggableChatModalProps {
  onClose: () => void;
  isDark: boolean;
  children: ReactNode;
}

export default function DraggableChatModal({ 
  onClose, 
  isDark,
  children
}: DraggableChatModalProps) {
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const savedStateRef = useRef<{ position: { x: number; y: number }, size: { width: number; height: number } } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isMaximized && !isMinimized) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      } else if (isResizing && !isMaximized && !isMinimized) {
        const newWidth = Math.max(400, Math.min(1920, resizeStart.width + (e.clientX - resizeStart.x)));
        const newHeight = Math.max(300, Math.min(1080, resizeStart.height + (e.clientY - resizeStart.y)));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, isMaximized, isMinimized, dragOffset, resizeStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (headerRef.current && modalRef.current && !isMaximized && !isMinimized) {
      const rect = modalRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (modalRef.current && !isMaximized && !isMinimized) {
      e.preventDefault();
      e.stopPropagation();
      const rect = modalRef.current.getBoundingClientRect();
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
      });
      setIsResizing(true);
    }
  };

  const handleMinimize = () => {
    // Сохраняем текущее состояние перед сворачиванием
    if (!isMinimized) {
      savedStateRef.current = {
        position: { ...position },
        size: { ...size },
      };
    }
    setIsMinimized(true);
    setIsMaximized(false);
  };

  const handleRestore = () => {
    setIsMinimized(false);
    // Восстанавливаем сохраненное состояние, если оно есть
    if (savedStateRef.current) {
      setPosition(savedStateRef.current.position);
      setSize(savedStateRef.current.size);
    }
  };

  const handleMaximize = () => {
    if (isMaximized) {
      // Восстанавливаем предыдущее состояние
      if (savedStateRef.current) {
        setPosition(savedStateRef.current.position);
        setSize(savedStateRef.current.size);
      }
      setIsMaximized(false);
      setIsMinimized(false);
    } else {
      // Если модалка свернута, сначала разворачиваем, потом максимизируем
      if (isMinimized) {
        setIsMinimized(false);
        // Восстанавливаем сохраненное состояние перед максимизацией
        if (savedStateRef.current) {
          setPosition(savedStateRef.current.position);
          setSize(savedStateRef.current.size);
        }
      }
      // Сохраняем текущее состояние перед максимизацией
      savedStateRef.current = {
        position: { ...position },
        size: { ...size },
      };
      setIsMaximized(true);
    }
  };

  // Ограничиваем позицию в пределах экрана
  const constrainedPosition = isMaximized
    ? { x: 0, y: 0 }
    : isMinimized
    ? { x: window.innerWidth - 350, y: window.innerHeight - 50 } // Фиксированная позиция справа снизу
    : {
        x: Math.max(0, Math.min(position.x, window.innerWidth - size.width)),
        y: Math.max(0, Math.min(position.y, window.innerHeight - size.height)),
      };

  const modalSize = isMaximized
    ? { width: window.innerWidth, height: window.innerHeight }
    : isMinimized
    ? { width: 350, height: 50 } // Компактный размер для свернутой модалки
    : size;

  const modalContent = (
    <Box
      ref={modalRef}
      style={{
        position: 'fixed',
        left: `${constrainedPosition.x}px`,
        top: `${constrainedPosition.y}px`,
        width: `${modalSize.width}px`,
        height: `${modalSize.height}px`,
        backgroundColor: isDark ? 'var(--theme-bg-primary)' : 'var(--theme-bg-elevated)',
        border: `1px solid ${isDark ? 'var(--theme-border)' : 'var(--theme-border-primary)'}`,
        borderRadius: isMaximized ? '0' : '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 900,
        overflow: 'hidden',
        transition: isDragging || isResizing ? 'none' : 'all 0.2s ease',
      }}
    >
      {/* Заголовок с возможностью перетаскивания */}
      <Box
        ref={headerRef}
        onMouseDown={isMinimized ? undefined : handleMouseDown}
        onDoubleClick={isMinimized ? handleRestore : undefined}
        style={{          
          borderBottom: isMinimized ? 'none' : `1px solid ${isDark ? 'var(--theme-border)' : 'var(--theme-border-primary)'}`,
          backgroundColor: isDark ? 'var(--theme-bg-secondary)' : 'var(--theme-bg-elevated)',
          cursor: isMinimized ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <Box style={{ flex: 1 }} />
        <Group gap={4}>
          {isMinimized ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={handleRestore}
              style={{ cursor: 'pointer' }}
              title="Развернуть"
            >
              <IconArrowsMaximize size={18} />
            </ActionIcon>
          ) : (
            <>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={handleMinimize}
                style={{ cursor: 'pointer' }}
                title="Свернуть"
              >
                <IconMinus size={18} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={handleMaximize}
                style={{ cursor: 'pointer' }}
                title={isMaximized ? "Восстановить" : "На весь экран"}
              >
                {isMaximized ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
              </ActionIcon>
            </>
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onClose}
            style={{ cursor: 'pointer' }}
            title="Закрыть"
          >
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Box>

      {/* Содержимое чата */}
      {!isMinimized && (
        <Box style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {children}
          
          {/* Ручка для изменения размера (правый нижний угол) */}
          {!isMaximized && (
            <Box
              ref={resizeHandleRef}
              onMouseDown={handleResizeStart}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '20px',
                height: '20px',
                cursor: 'nwse-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                borderTopLeftRadius: '8px',
                zIndex: 10,
              }}
              title="Изменить размер"
            >
              {/* Три полоски для визуального указателя */}
              <Box style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <Box
                  style={{
                    width: '12px',
                    height: '2px',
                    backgroundColor: isDark ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)',
                    borderRadius: '1px',
                  }}
                />
                <Box
                  style={{
                    width: '12px',
                    height: '2px',
                    backgroundColor: isDark ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)',
                    borderRadius: '1px',
                  }}
                />
                <Box
                  style={{
                    width: '12px',
                    height: '2px',
                    backgroundColor: isDark ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)',
                    borderRadius: '1px',
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );

  return createPortal(modalContent, document.body);
}

