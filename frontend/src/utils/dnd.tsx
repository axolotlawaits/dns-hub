import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
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
      ref={drag}
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
      ref={drop}
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
export const FileDropZone = ({ onFilesDrop }: { onFilesDrop: (files: File[]) => void }) => {
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

  return (
    <Box
      ref={drop}
      style={{
        border: `2px dashed ${isOver ? '#228be6' : '#ddd'}`,
        borderRadius: '4px',
        padding: '16px',
        textAlign: 'center',
        cursor: 'pointer',
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

// Обертка провайдера DnD
export const DndProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
};