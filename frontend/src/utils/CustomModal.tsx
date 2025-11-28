import { Modal, Group, ThemeIcon, Text } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { memo, useMemo } from 'react';
import './styles/CustomModal.css';

interface CustomModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  size?: string | number;
  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
  centered?: boolean;
  withCloseButton?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  zIndex?: number;
  overlayProps?: {
    backgroundOpacity?: number;
  };
  styles?: {
    content?: React.CSSProperties;
    body?: React.CSSProperties;
    header?: React.CSSProperties;
    title?: React.CSSProperties;
    overlay?: React.CSSProperties;
  };
}

const CustomModalComponent: React.FC<CustomModalProps> = ({
  opened,
  onClose,
  title,
  icon,
  children,
  size,
  width = 'auto',
  height = 'auto',
  maxWidth = '95vw',
  maxHeight = '90vh',
  centered = true,
  withCloseButton = true,
  closeOnClickOutside = true,
  closeOnEscape = true,
  zIndex,
  overlayProps = { backgroundOpacity: 0.5 },
  styles = {}
}) => {
  // Мемоизируем стили для оптимизации производительности
  const defaultStyles = useMemo(() => ({
    content: {
      width: width,
      height: height,
      maxWidth: maxWidth,
      maxHeight: maxHeight,
      borderRadius: '16px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      border: '1px solid var(--theme-border)',
      ...styles.content
    },
    body: {
      padding: '24px',
      background: 'var(--theme-bg-primary)',
      borderRadius: '0 0 16px 16px',
      ...styles.body
    },
    header: {
      padding: '24px 24px 16px 24px',
      background: 'var(--theme-bg-elevated)',
      borderBottom: '1px solid var(--theme-border)',
      borderRadius: '16px 16px 0 0',
      ...styles.header
    },
    title: {
      fontSize: '20px',
      fontWeight: 700,
      color: 'var(--theme-text-primary)',
      margin: 0,
      ...styles.title
    },
    overlay: {
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      ...styles.overlay
    }
  }), [width, height, maxWidth, maxHeight, styles]);

  // Мемоизируем заголовок для оптимизации
  const modalTitle = useMemo(() => (
    <Group gap="sm" align="center">
      {icon && (
        <ThemeIcon size="md" color="blue" variant="light">
          {icon}
        </ThemeIcon>
      )}
      <Text size="lg" fw={600} className="custom-modal-title">
        {title}
      </Text>
    </Group>
  ), [icon, title]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={modalTitle}
      size={size}
      centered={centered}
      withCloseButton={withCloseButton}
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={closeOnEscape}
      zIndex={zIndex}
      overlayProps={overlayProps}
      styles={defaultStyles}
      className="custom-modal"
    >
      {children}
    </Modal>
  );
};

export const CustomModal = memo(CustomModalComponent);
CustomModal.displayName = 'CustomModal';

// Предустановленные конфигурации для часто используемых случаев
export const CalendarModal: React.FC<Omit<CustomModalProps, 'icon'>> = (props) => (
  <CustomModal
    {...props}
    icon={<IconCalendar size={16} />}
  />
);

CalendarModal.displayName = 'CalendarModal';

// FullWidthModal - модальное окно на всю ширину экрана
export const FullWidthModal: React.FC<CustomModalProps> = (props) => (
  <CustomModal
    {...props}
    width="95vw"
    maxWidth="95vw"
    height="90vh"
    maxHeight="90vh"
  />
);

FullWidthModal.displayName = 'FullWidthModal';

// LargeModal - большое модальное окно
export const LargeModal: React.FC<CustomModalProps> = (props) => (
  <CustomModal
    {...props}
    size="xl"
    width="90vw"
    maxWidth="1200px"
    height="85vh"
    maxHeight="85vh"
  />
);

LargeModal.displayName = 'LargeModal';
