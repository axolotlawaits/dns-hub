import { useState } from 'react';
import { Button, Box, Group, ActionIcon, Text, Stack, Tooltip, Card, ThemeIcon, Modal, Textarea, SimpleGrid, Badge } from '@mantine/core';
import dayjs from 'dayjs';
import { IconClock, IconUpload, IconShield, IconFlame, IconCircleCheck, IconCircleX, IconAlertCircle, IconX, IconFile, IconCheck } from '@tabler/icons-react';
import { SafetyJournal } from './SafetyJournal';

const JOURNAL_STATUS = {
  approved: { label: 'Одобрен', icon: IconCircleCheck, color: 'green' },
  pending: { label: 'В ожидании файлов', icon: IconClock, color: 'yellow' },
  rejected: { label: 'Отклонен', icon: IconCircleX, color: 'red' },
  under_review: { label: 'На проверке', icon: IconAlertCircle, color: 'blue' }
};

const JournalCards = function JournalCards({
  journals,
  onApproveJournal,
  onRejectJournal,
  onViewFile,
  onUploadFiles,
  canManageStatuses
}: {
  journals: SafetyJournal[];
  onApproveJournal: (journal: SafetyJournal, status: 'approved', comment?: string) => void;
  onRejectJournal: (journal: SafetyJournal, status: 'rejected', rejectMessage: string) => void;
  onViewFile: (journal: SafetyJournal) => void;
  onUploadFiles: (journal: SafetyJournal) => void;
  canManageStatuses: boolean;
}) {

  const [rejectModalOpen, setRejectModalOpen] = useState<string | null>(null)
  const [rejectMessage, setRejectMessage] = useState('')
  const [approveModalOpen, setApproveModalOpen] = useState<string | null>(null)
  const [approveMessage, setApproveMessage] = useState('')
  
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {journals.map((journal) => {
        const statusInfo = JOURNAL_STATUS[journal.status as keyof typeof JOURNAL_STATUS];
        const StatusIcon = statusInfo?.icon;
        const hasFiles = journal.filled_at !== null && journal.files && journal.files.length > 0;
        const activeFilesCount = journal.files ? journal.files.filter(f => !f.is_deleted).length : 0;
        
        return (
          <Card
            key={journal.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{ 
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={() => onViewFile(journal)}
          >
            <Stack gap="md" style={{ flex: 1 }}>
              {/* Заголовок и тип журнала */}
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="xs" align="center" style={{ flex: 1, minWidth: 0 }}>
                  {journal.journal_type === 'ОТ' ? (
                    <ThemeIcon size="md" color="blue" variant="light">
                      <IconShield size={20} />
                    </ThemeIcon>
                  ) : (
                    <ThemeIcon size="md" color="orange" variant="light">
                      <IconFlame size={20} />
                    </ThemeIcon>
                  )}
                  <Text size="sm" fw={600} lineClamp={2} style={{ flex: 1 }}>
                    {journal.journal_title}
                  </Text>
                </Group>
              </Group>

              {/* Статус */}
              <Group gap="xs" align="center">
                {StatusIcon && (
                  <StatusIcon 
                    size={16} 
                    color={`var(--mantine-color-${statusInfo?.color}-6)`} 
                  />
                )}
                <Badge 
                  size="sm" 
                  color={statusInfo?.color}
                  variant="light"
                >
                  {statusInfo?.label}
                </Badge>
              </Group>

              {/* Период */}
              {journal.period_start && journal.period_end && (
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>Период:</Text>
                  <Text size="sm">
                    {dayjs(journal.period_start).format('DD.MM.YYYY')} - {dayjs(journal.period_end).format('DD.MM.YYYY')}
                  </Text>
                </Box>
              )}

              {/* Дата предоставления */}
              {journal.filled_at && (
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>Дата предоставления:</Text>
                  <Text size="sm">
                    {dayjs(journal.filled_at).format('DD.MM.YYYY')}
                  </Text>
                </Box>
              )}

              {/* Файлы */}
              <Box>
                <Group gap="xs" align="center" justify="space-between">
                  <Group gap="xs" align="center">
                    {activeFilesCount > 0 ? (
                      <>
                        <ThemeIcon size="sm" color="blue" variant="light">
                          <IconFile size={14} />
                        </ThemeIcon>
                        <Text size="sm">
                          {activeFilesCount} файл(ов)
                        </Text>
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">Нет файлов</Text>
                    )}
                  </Group>
                  <Tooltip label="Загрузить файлы">
                    <ActionIcon
                      size="sm"
                      color="blue"
                      variant="light"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUploadFiles(journal);
                      }}
                    >
                      <IconUpload size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Box>

              {/* Управление статусом */}
              {canManageStatuses && (
                <Box mt="auto">
                  {!hasFiles || activeFilesCount === 0 ? (
                    <Text size="xs" c="dimmed" ta="center">
                      Загрузите файлы
                    </Text>
                  ) : (
                    <Group gap="xs" justify="center">
                      <Tooltip label="Одобрить">
                        <ActionIcon 
                          size="md" 
                          color="green" 
                          variant={journal.status === 'approved' ? 'filled' : 'light'} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setApproveModalOpen(journal.id);
                          }}
                        >
                          <IconCheck size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Отклонить">
                        <ActionIcon 
                          size="md" 
                          color="red" 
                          variant={journal.status === 'rejected' ? 'filled' : 'light'} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectModalOpen(journal.id);
                          }}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Box>
              )}

              {/* Модалка подтверждения */}
              <Modal 
                opened={journal.id === approveModalOpen} 
                onClose={() => {
                  setApproveModalOpen(null);
                  setApproveMessage('');
                }} 
                title='Одобрить журнал' 
                centered 
                zIndex={99999}
              >
                <Stack>
                  <Textarea
                    placeholder="Комментарий (необязательно)..."
                    value={approveMessage}
                    onChange={(e) => setApproveMessage(e.currentTarget.value)}
                  />
                  <Group grow>
                    <Button 
                      onClick={() => {
                        setApproveModalOpen(null);
                        setApproveMessage('');
                      }} 
                      variant='light'
                    >
                      Отмена
                    </Button>
                    <Button 
                      onClick={() => {
                        onApproveJournal(journal, 'approved', approveMessage || undefined);
                        setApproveModalOpen(null);
                        setApproveMessage('');
                      }}
                      color="green"
                    >
                      Подтвердить
                    </Button>
                  </Group>
                </Stack>
              </Modal>

              {/* Модалка отклонения */}
              <Modal 
                opened={journal.id === rejectModalOpen} 
                onClose={() => {
                  setRejectModalOpen(null);
                  setRejectMessage('');
                }} 
                title='Укажите причину' 
                centered 
                zIndex={99999}
              >
                <Stack>
                  <Textarea
                    placeholder="Комментарий..."
                    value={rejectMessage}
                    onChange={(e) => setRejectMessage(e.currentTarget.value)}
                  />
                  <Group grow>
                    <Button 
                      onClick={() => {
                        setRejectModalOpen(null);
                        setRejectMessage('');
                      }} 
                      variant='light'
                    >
                      Отмена
                    </Button>
                    <Button 
                      onClick={() => {
                        onRejectJournal(journal, 'rejected', rejectMessage);
                        setRejectModalOpen(null);
                        setRejectMessage('');
                      }}
                    >
                      Подтвердить
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
};

export default JournalCards;

