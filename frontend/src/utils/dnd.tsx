import { useDrag, useDrop } from 'react-dnd';
import React from 'react';
import { Group, Text, ActionIcon, Box } from '@mantine/core';
import { IconTrash, IconGripVertical } from '@tabler/icons-react';

export interface DraggableItem {
  id: string;
  [key: string]: any; // Дополнительные поля
}

export interface DropZoneProps {
  onDrop: (item: DraggableItem) => void;
  acceptTypes: string[];
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export interface DraggableProps {
  item: DraggableItem;
  type: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

// Универсальный компонент для перетаскивания
export const Draggable = ({ item, type, children, style = {} }: DraggableProps) => {
  const [{ isDragging }, drag] = useDrag({
    type,
    item: () => item,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  });

  return (
    <Box
      ref={drag as any}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
        ...style,
      }}
    >
      <Group gap="xs">
        <IconGripVertical size={16} style={{ cursor: 'grab' }} />
        {children}
      </Group>
    </Box>
  );
};

// Универсальная зона для сброса
export const DropZone = ({ 
  onDrop, 
  acceptTypes, 
  children, 
  style = {} 
}: DropZoneProps) => {
  const [{ isOver }, drop] = useDrop({
    accept: acceptTypes,
    drop: (item: DraggableItem) => onDrop(item),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  return (
    <Box
      ref={drop as any}
      style={{
        border: `2px dashed ${isOver ? '#228be6' : '#ddd'}`,
        borderRadius: '4px',
        padding: '16px',
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </Box>
  );
};

// Компонент для работы с файлами
export const FileDropZone = ({ onFilesDrop, acceptedTypes }: { onFilesDrop: (files: File[]) => void, acceptedTypes: string }) => {
  const [{ isOver }, drop] = useDrop({
    accept: 'file',
    drop: (item: { files: File[] }) => onFilesDrop(item.files),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesDrop(Array.from(e.target.files));
    }
  };

  // Нативные обработчики drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesDrop(files);
    }
  };

  return (
    <Box
      ref={drop as any}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${isOver ? '#228be6' : '#ddd'}`,
        borderRadius: '4px',
        padding: '16px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <Text color={isOver ? 'blue' : 'gray'}>
        Перетащите файлы сюда или выберите файлы
      </Text>
      <input
        id="file-input"
        type="file"
        multiple
        hidden
        onChange={handleFileInput}
        accept={acceptedTypes}
      />
    </Box>
  );
};

// Компонент элемента с возможностью удаления
export const ListItemWithActions = ({
  item,
  onDelete,
  renderContent,
}: {
  item: DraggableItem;
  onDelete?: (id: string) => void;
  renderContent: (item: DraggableItem) => React.ReactNode;
}) => {
  return (
    <Group justify="space-between" wrap="nowrap">
      {renderContent(item)}
      {onDelete && (
        <ActionIcon color="red" variant="subtle" onClick={() => onDelete(item.id)}>
          <IconTrash size={16} />
        </ActionIcon>
      )}
    </Group>
  );
};

// Обертка провайдера DnD - теперь просто passthrough, так как провайдер глобальный в App.tsx
export const DndProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};