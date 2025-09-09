import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../config/constants';
import { useUserContext } from '../../hooks/useUserContext';
import { notificationSystem } from '../../utils/Push';
import { 
  Button, 
  Title, 
  Box, 
  LoadingOverlay, 
  Group, 
  ActionIcon, 
  Text, 
  Stack, 
  Paper, 
  Modal, 
  Badge, 
  Image, 
  Avatar,
  Tabs,
  Accordion,
  Grid,
  Tooltip,
  Progress,
  Alert
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { 
  IconPencil, 
  IconTrash, 
  IconUpload, 
  IconDownload, 
  IconPlus, 
  IconCalendar, 
  IconArchive, 
  IconEye,
  IconShield,
  IconFlame,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconX,
  IconBell,
  IconFileText,
  IconUsers,
  IconBuilding
} from '@tabler/icons-react';
import { DynamicFormModal, type FormConfig } from '../../utils/formModal';
import { FilePreviewModal } from '../../utils/FilePreviewModal';
import { FilterGroup } from '../../utils/filter';
import type { ColumnFiltersState } from '@tanstack/react-table';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Branch {
  uuid: string;
  name: string;
  code: string;
}

interface SafetyJournal {
  id: string;
  createdAt: string;
  updatedAt?: string;
  userAdd: User;
  userUpdated?: User;
  journalType: 'LABOR_SAFETY' | 'FIRE_SAFETY' | 'ELECTRICAL_SAFETY' | 'INDUSTRIAL_SAFETY';
  title: string;
  description?: string;
  location: string;
  responsiblePerson: string;
  period: string;
  startDate: string;
  endDate?: string;
  lastEntryDate?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | 'SUSPENDED';
  isCompleted: boolean;
  branch?: Branch;
  entries: SafetyJournalEntry[];
  attachments: SafetyJournalAttachment[];
  _count: {
    entries: number;
    attachments: number;
  };
}

interface SafetyJournalEntry {
  id: string;
  createdAt: string;
  updatedAt?: string;
  userAdd: User;
  entryDate: string;
  entryType: 'INSPECTION' | 'INSTRUCTION' | 'VIOLATION' | 'CORRECTIVE_ACTION' | 'TRAINING' | 'INCIDENT' | 'MAINTENANCE';
  title: string;
  description: string;
  participants?: string;
  location?: string;
  findings?: string;
  actionsTaken?: string;
  responsiblePerson?: string;
  deadline?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';
  attachments: SafetyJournalAttachment[];
}

interface SafetyJournalAttachment {
  id: string;
  createdAt: string;
  userAdd: User;
  source: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
}

// Константы для типов журналов
const JOURNAL_TYPES = {
  LABOR_SAFETY: { label: 'Охрана труда', icon: '🛡️', color: 'blue' },
  FIRE_SAFETY: { label: 'Пожарная безопасность', icon: '🔥', color: 'red' },
  ELECTRICAL_SAFETY: { label: 'Электробезопасность', icon: '⚡', color: 'yellow' },
  INDUSTRIAL_SAFETY: { label: 'Промышленная безопасность', icon: '🏭', color: 'green' }
};

const ENTRY_TYPES = {
  INSPECTION: { label: 'Проверка', icon: '🔍', color: 'blue' },
  INSTRUCTION: { label: 'Инструктаж', icon: '📚', color: 'green' },
  VIOLATION: { label: 'Нарушение', icon: '⚠️', color: 'red' },
  CORRECTIVE_ACTION: { label: 'Корректирующие действия', icon: '🔧', color: 'orange' },
  TRAINING: { label: 'Обучение', icon: '🎓', color: 'purple' },
  INCIDENT: { label: 'Происшествие', icon: '🚨', color: 'red' },
  MAINTENANCE: { label: 'Техническое обслуживание', icon: '🔧', color: 'gray' }
};

const STATUS_COLORS = {
  ACTIVE: 'green',
  COMPLETED: 'blue',
  ARCHIVED: 'gray',
  SUSPENDED: 'yellow'
};

const ENTRY_STATUS_COLORS = {
  OPEN: 'blue',
  IN_PROGRESS: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'gray',
  OVERDUE: 'red'
};

// Компонент карточки журнала
const JournalCard = React.memo(function JournalCard({
  journal,
  onEdit,
  onDelete,
  onViewEntries,
  onOpenFilePreview
}: {
  journal: SafetyJournal;
  onEdit: (journal: SafetyJournal) => void;
  onDelete: (journal: SafetyJournal) => void;
  onViewEntries: (journal: SafetyJournal) => void;
  onOpenFilePreview: (files: string[], currentIndex: number) => void;
}) {
  const journalTypeInfo = JOURNAL_TYPES[journal.journalType];
  const completionPercentage = journal._count.entries > 0 ? Math.min(100, (journal._count.entries / 10) * 100) : 0;
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <IconCheck size={16} color="green" />;
      case 'COMPLETED': return <IconCheck size={16} color="blue" />;
      case 'ARCHIVED': return <IconArchive size={16} color="gray" />;
      case 'SUSPENDED': return <IconClock size={16} color="yellow" />;
      default: return <IconAlertTriangle size={16} color="red" />;
    }
  };

  return (
    <Paper
      withBorder
      radius="md"
      p="lg"
      shadow="sm"
      style={{
        background: 'linear-gradient(135deg, var(--theme-bg-primary) 0%, var(--theme-bg-secondary) 100%)',
        border: '1px solid var(--theme-border-primary)',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
      }}
    >
      <Stack gap="md">
        {/* Заголовок */}
        <Group justify="space-between" align="flex-start">
          <Group gap="md" align="flex-start">
            <Box
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, var(--color-${journalTypeInfo.color}-500), var(--color-${journalTypeInfo.color}-600))`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                color: 'white',
                fontWeight: '600'
              }}
            >
              {journalTypeInfo.icon}
            </Box>
            <Stack gap="xs">
              <Text size="lg" fw={700} style={{ color: 'var(--theme-text-primary)' }}>
                {journal.title}
              </Text>
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {journal.location} • {journal.responsiblePerson}
              </Text>
              <Group gap="xs">
                <Badge 
                  color={journalTypeInfo.color} 
                  variant="light" 
                  style={{ textTransform: 'none' }}
                >
                  {journalTypeInfo.label}
                </Badge>
                <Badge 
                  color={STATUS_COLORS[journal.status]} 
                  variant="outline" 
                  style={{ textTransform: 'none' }}
                >
                  {getStatusIcon(journal.status)}
                  <Text ml={4} size="xs">
                    {journal.status === 'ACTIVE' ? 'Активный' : 
                     journal.status === 'COMPLETED' ? 'Завершен' :
                     journal.status === 'ARCHIVED' ? 'Архив' : 'Приостановлен'}
                  </Text>
                </Badge>
              </Group>
            </Stack>
          </Group>
          <Group gap="xs">
            <Tooltip label="Просмотр записей">
              <ActionIcon
                variant="light"
                color="blue"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewEntries(journal);
                }}
              >
                <IconEye size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Редактировать">
              <ActionIcon
                variant="light"
                color="orange"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(journal);
                }}
              >
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Удалить">
              <ActionIcon
                variant="light"
                color="red"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(journal);
                }}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Описание */}
        {journal.description && (
          <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
            {journal.description}
          </Text>
        )}

        {/* Прогресс и статистика */}
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
              Прогресс заполнения
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {journal._count.entries} записей
            </Text>
          </Group>
          <Progress 
            value={completionPercentage} 
            color={completionPercentage === 100 ? 'green' : 'blue'}
            size="sm"
            radius="md"
          />
        </Stack>

        {/* Даты */}
        <Group justify="space-between">
          <Stack gap="xs">
            <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
              Начало: {dayjs(journal.startDate).format('DD.MM.YYYY')}
            </Text>
            {journal.endDate && (
              <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                Окончание: {dayjs(journal.endDate).format('DD.MM.YYYY')}
              </Text>
            )}
            {journal.lastEntryDate && (
              <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                Последняя запись: {dayjs(journal.lastEntryDate).format('DD.MM.YYYY')}
              </Text>
            )}
          </Stack>
          <Group gap="xs">
            <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
              Период: {journal.period}
            </Text>
          </Group>
        </Group>

        {/* Вложения */}
        {journal.attachments.length > 0 && (
          <Group gap="xs">
            <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
              Файлы: {journal._count.attachments}
            </Text>
            {journal.attachments.slice(0, 3).map((attachment, index) => (
              <ActionIcon
                key={attachment.id}
                variant="light"
                color="blue"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFilePreview([attachment.source], index);
                }}
              >
                <IconFileText size={12} />
              </ActionIcon>
            ))}
          </Group>
        )}

        {/* Футер */}
        <Box
          style={{
            borderTop: '1px solid var(--theme-border-secondary)',
            paddingTop: '12px',
            marginTop: '8px'
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="xs" align="center">
              <Avatar
                size="sm"
                radius="xl"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  color: 'white',
                  fontWeight: '600'
                }}
              >
                {journal.userAdd.name.charAt(0).toUpperCase()}
              </Avatar>
              <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                {journal.userAdd.name}
              </Text>
            </Group>
            <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
              {dayjs(journal.createdAt).format('DD.MM.YYYY')}
            </Text>
          </Group>
        </Box>
      </Stack>
    </Paper>
  );
});

// Основной компонент
export default function SafetyJournal() {
  const { user } = useUserContext();
  const [journals, setJournals] = useState<SafetyJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedJournal, setSelectedJournal] = useState<SafetyJournal | null>(null);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  
  // Модальные окна
  const [formModalOpened, { open: openFormModal, close: closeFormModal }] = useDisclosure(false);
  const [entriesModalOpened, { open: openEntriesModal, close: closeEntriesModal }] = useDisclosure(false);
  const [filePreviewOpened, { open: openFilePreview, close: closeFilePreview }] = useDisclosure(false);
  const [filePreviewFiles, setFilePreviewFiles] = useState<string[]>([]);
  const [filePreviewIndex, setFilePreviewIndex] = useState(0);

  // Загрузка данных
  const loadJournals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (filters.length > 0) {
        filters.forEach(filter => {
          if (filter.value) {
            params.append(filter.id, filter.value as string);
          }
        });
      }
      
      const response = await fetch(`${API}/safety/journal?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setJournals(data.data);
      } else {
        setError(data.message || 'Ошибка загрузки журналов');
      }
    } catch (err) {
      setError('Ошибка соединения с сервером');
      console.error('Error loading journals:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadJournals();
  }, [loadJournals]);

  // Обработчики
  const handleCreateJournal = () => {
    setSelectedJournal(null);
    openFormModal();
  };

  const handleEditJournal = (journal: SafetyJournal) => {
    setSelectedJournal(journal);
    openFormModal();
  };

  const handleDeleteJournal = async (journal: SafetyJournal) => {
    if (!confirm(`Удалить журнал "${journal.title}"?`)) return;
    
    try {
      const response = await fetch(`${API}/safety/journal/${journal.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.success) {
        notificationSystem.showSuccess('Журнал удален');
        loadJournals();
      } else {
        notificationSystem.showError(data.message || 'Ошибка удаления журнала');
      }
    } catch (err) {
      notificationSystem.showError('Ошибка соединения с сервером');
    }
  };

  const handleViewEntries = (journal: SafetyJournal) => {
    setSelectedJournal(journal);
    openEntriesModal();
  };

  const handleOpenFilePreview = (files: string[], currentIndex: number) => {
    setFilePreviewFiles(files);
    setFilePreviewIndex(currentIndex);
    openFilePreview();
  };

  // Конфигурация формы
  const formConfig: FormConfig = {
    title: selectedJournal ? 'Редактировать журнал' : 'Создать журнал',
    fields: [
      {
        name: 'journalType',
        type: 'select',
        label: 'Тип журнала',
        placeholder: 'Выберите тип журнала',
        required: true,
        options: Object.entries(JOURNAL_TYPES).map(([value, info]) => ({
          value,
          label: `${info.icon} ${info.label}`
        }))
      },
      {
        name: 'title',
        type: 'text',
        label: 'Название журнала',
        placeholder: 'Введите название журнала',
        required: true
      },
      {
        name: 'description',
        type: 'textarea',
        label: 'Описание',
        placeholder: 'Введите описание журнала'
      },
      {
        name: 'location',
        type: 'text',
        label: 'Место проведения',
        placeholder: 'Введите место проведения',
        required: true
      },
      {
        name: 'responsiblePerson',
        type: 'text',
        label: 'Ответственное лицо',
        placeholder: 'Введите ФИО ответственного лица',
        required: true
      },
      {
        name: 'period',
        type: 'text',
        label: 'Период ведения',
        placeholder: 'Например: январь 2025',
        required: true
      },
      {
        name: 'startDate',
        type: 'datetime-local',
        label: 'Дата начала',
        required: true
      },
      {
        name: 'endDate',
        type: 'datetime-local',
        label: 'Дата окончания'
      },
      {
        name: 'status',
        type: 'select',
        label: 'Статус',
        options: [
          { value: 'ACTIVE', label: 'Активный' },
          { value: 'COMPLETED', label: 'Завершен' },
          { value: 'ARCHIVED', label: 'Архив' },
          { value: 'SUSPENDED', label: 'Приостановлен' }
        ]
      }
    ],
    onSubmit: async (data) => {
      try {
        const url = selectedJournal 
          ? `${API}/safety/journal/${selectedJournal.id}`
          : `${API}/safety/journal`;
        
        const method = selectedJournal ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            userAddId: user?.id
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          notificationSystem.showSuccess(
            selectedJournal ? 'Журнал обновлен' : 'Журнал создан'
          );
          closeFormModal();
          loadJournals();
        } else {
          notificationSystem.showError(result.message || 'Ошибка сохранения');
        }
      } catch (err) {
        notificationSystem.showError('Ошибка соединения с сервером');
      }
    }
  };

  // Фильтрация журналов по вкладкам
  const filteredJournals = useMemo(() => {
    if (activeTab === 'all') return journals;
    return journals.filter(journal => journal.journalType === activeTab);
  }, [journals, activeTab]);

  if (loading) {
    return (
      <Box style={{ position: 'relative', minHeight: '400px' }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  return (
    <Box style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Заголовок */}
      <Box
        style={{
          background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
          padding: '2rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Box
          style={{
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '200px',
            height: '200px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-5%',
            width: '150px',
            height: '150px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Stack gap="md" style={{ position: 'relative', zIndex: 2 }}>
          <Group gap="md" align="center">
            <Box
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: 'white',
                fontWeight: '600'
              }}
            >
              🛡️
            </Box>
            <Stack gap="xs">
              <Title order={1} style={{ color: 'white', margin: 0 }}>
                Журналы охраны труда и пожарной безопасности
              </Title>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                Управление журналами по охране труда и пожарной безопасности
              </Text>
            </Stack>
          </Group>
          <Group gap="md">
            <Button
              leftSection={<IconPlus size={20} />}
              onClick={handleCreateJournal}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              Добавить журнал
            </Button>
          </Group>
        </Stack>
      </Box>

      {/* Контент */}
      <Box p="xl">
        {/* Фильтры */}
        <Paper withBorder radius="md" p="lg" mb="xl">
          <Stack gap="md">
            <Group gap="md" align="center">
              <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                🔍 Фильтры
              </Text>
            </Group>
            <FilterGroup
              filters={filters}
              onFiltersChange={setFilters}
              filterConfigs={[
                {
                  id: 'journalType',
                  type: 'select',
                  label: 'Тип журнала',
                  options: Object.entries(JOURNAL_TYPES).map(([value, info]) => ({
                    value,
                    label: `${info.icon} ${info.label}`
                  }))
                },
                {
                  id: 'status',
                  type: 'select',
                  label: 'Статус',
                  options: [
                    { value: 'ACTIVE', label: 'Активный' },
                    { value: 'COMPLETED', label: 'Завершен' },
                    { value: 'ARCHIVED', label: 'Архив' },
                    { value: 'SUSPENDED', label: 'Приостановлен' }
                  ]
                }
              ]}
            />
          </Stack>
        </Paper>

        {/* Вкладки */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'all')} mb="xl">
          <Tabs.List>
            <Tabs.Tab value="all" leftSection={<IconFileText size={16} />}>
              Все журналы
            </Tabs.Tab>
            {Object.entries(JOURNAL_TYPES).map(([value, info]) => (
              <Tabs.Tab key={value} value={value} leftSection={<span>{info.icon}</span>}>
                {info.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        {/* Ошибка */}
        {error && (
          <Alert color="red" mb="xl">
            {error}
          </Alert>
        )}

        {/* Список журналов */}
        {filteredJournals.length === 0 ? (
          <Paper withBorder radius="md" p="xl" style={{ textAlign: 'center' }}>
            <Stack gap="md" align="center">
              <Box
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'var(--theme-bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px'
                }}
              >
                📋
              </Box>
              <Text size="lg" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>
                Журналы не найдены
              </Text>
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                Создайте первый журнал для начала работы
              </Text>
            </Stack>
          </Paper>
        ) : (
          <Grid>
            {filteredJournals.map((journal) => (
              <Grid.Col key={journal.id} span={{ base: 12, md: 6, lg: 4 }}>
                <JournalCard
                  journal={journal}
                  onEdit={handleEditJournal}
                  onDelete={handleDeleteJournal}
                  onViewEntries={handleViewEntries}
                  onOpenFilePreview={handleOpenFilePreview}
                />
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Box>

      {/* Модальные окна */}
      <DynamicFormModal
        opened={formModalOpened}
        onClose={closeFormModal}
        config={formConfig}
        initialData={selectedJournal}
      />

      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={closeFilePreview}
        attachments={filePreviewFiles.map((file, index) => ({ source: file, id: index.toString() }))}
        initialIndex={filePreviewIndex}
      />
    </Box>
  );
}
