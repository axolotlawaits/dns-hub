import { Modal, Group, ThemeIcon, Text } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import './CustomModal.css';

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

export const CustomModal: React.FC<CustomModalProps> = ({
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
  overlayProps = { backgroundOpacity: 0.5 },
  styles = {}
}) => {
  const defaultStyles = {
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
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      borderBottom: '1px solid #e2e8f0',
      borderRadius: '16px 16px 0 0',
      ...styles.header
    },
    title: {
      fontSize: '20px',
      fontWeight: 700,
      color: '#1e293b',
      margin: 0,
      ...styles.title
    },
    overlay: {
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      ...styles.overlay
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" align="center">
          {icon && (
            <ThemeIcon size="md" color="blue" variant="light">
              {icon}
            </ThemeIcon>
          )}
          <Text size="lg" fw={600} style={defaultStyles.title}>
            {title}
          </Text>
        </Group>
      }
      size={size}
      centered={centered}
      withCloseButton={withCloseButton}
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={closeOnEscape}
      overlayProps={overlayProps}
      styles={defaultStyles}
      className="custom-modal"
    >
      {children}
    </Modal>
  );
};

// Предустановленные конфигурации для часто используемых случаев
export const CalendarModal: React.FC<Omit<CustomModalProps, 'icon'>> = (props) => (
  <CustomModal
    {...props}
    icon={<IconCalendar size={16} />}
  />
);

export const FullWidthModal: React.FC<CustomModalProps> = (props) => (
  <CustomModal {...props} />
);

export const LargeModal: React.FC<CustomModalProps> = (props) => (
  <CustomModal {...props} />
);
