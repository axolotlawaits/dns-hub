import { useState } from 'react';
import { Button, Box, Group, ActionIcon, Text, Stack, Tooltip, Card, ThemeIcon, Modal, Textarea } from '@mantine/core';
import dayjs from 'dayjs';
import { IconClock, IconUpload, IconShield, IconFlame, IconCircleCheck, IconCircleX, IconAlertCircle, IconX, IconFile, IconCheck, IconMessageDots } from '@tabler/icons-react';
import { SafetyJournal } from './SafetyJournal';

const JOURNAL_STATUS = {
  approved: { label: 'Одобрен', icon: IconCircleCheck, color: 'green' },
  pending: { label: 'В ожидании файлов', icon: IconClock, color: 'yellow' },
  rejected: { label: 'Отклонен', icon: IconCircleX, color: 'red' },
  under_review: { label: 'На проверке', icon: IconAlertCircle, color: 'blue' }
};

const LocalJournalTable = function LocalJournalTable({
  journals,
  onApproveJournal,
  onRejectJournal,
  onViewFile,
  onUploadFiles,
  canManageStatuses
}: {
  journals: SafetyJournal[];
  onApproveJournal: (journal: SafetyJournal) => void;
  onRejectJournal: (journal: SafetyJournal, status: 'rejected', rejectMessage: string) => void;
  onViewFile: (journal: SafetyJournal) => void;
  onUploadFiles: (journal: SafetyJournal) => void;
  canManageStatuses: boolean;
}) {

  const [rejectModalOpen, setRejectModalOpen] = useState<string | null>(null)
  const [rejectMessage, setRejectMessage] = useState('')
  
  return (
    <Card shadow="sm" radius="lg" padding="md" className="table-container">
      <Box style={{ overflowX: 'auto', position: 'relative' }}>
        <table className='modern-table'>
          <thead>
            <tr className='table-header-row'>
              <th className='table-header-cell' style={{ width: '300px' }}>Журнал</th>
              <th className='table-header-cell' style={{ width: '120px' }}>Статус</th>
              <th className='table-header-cell' style={{ width: '180px' }}>Дата предоставления на проверку</th>
              <th className='table-header-cell' style={{ width: '150px' }}>Период</th>
              <th className='table-header-cell' style={{ width: '200px' }}>Файл для проверки</th>
              {canManageStatuses && (
                <th className='table-header-cell' style={{ width: '200px' }}>Управление статусом</th>
              )}
            </tr>
          </thead>
          <tbody>
            {journals.map((journal) => (
              <tr key={journal.id} className='table-row'>
                <td className='table-cell'>
                  {journal.journal_type === 'ОТ' ?
                    <IconShield 
                      size={16}
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 0,
                      }}
                    />
                  :
                    <IconFlame 
                      size={16}
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 0,
                      }}
                    />
                  }
                  <Tooltip label={journal.journal_title} multiline w={275}>
                    <Text size="sm" fw={500} truncate='end'>
                      {journal.journal_title}
                    </Text>
                  </Tooltip>
                </td>
                <td className='table-cell'>
                  <Group gap="xs" align="center">
                    {(() => {
                      const statusInfo = JOURNAL_STATUS[journal.status as keyof typeof JOURNAL_STATUS];
                      const IconComponent = statusInfo?.icon;
                      return (
                        <>
                          {IconComponent && <IconComponent size={16} color={`var(--mantine-color-${statusInfo?.color}-6)`} />}
                          <Text size="sm">{statusInfo?.label}</Text>
                          {journal.status !== 'approved' && journal.comment &&
                            <Tooltip label={journal.comment} multiline w={250}>
                              <ActionIcon 
                                size="sm" 
                                color="orange" 
                                variant='light'
                              >
                                <IconMessageDots size={14} />
                              </ActionIcon>
                            </Tooltip>
                          }
                        </>
                      );
                    })()}
                  </Group>
                </td>
                <td className='table-cell'>
                  <Text size="sm" c="dimmed">
                    {journal.filled_at ? dayjs(journal.filled_at).format('YYYY-MM-DD') : '-'}
                  </Text>
                </td>
                <td className='table-cell'>
                  <Text size="sm" c="dimmed">
                    {journal.period_start && journal.period_end && 
                      `${dayjs(journal.period_start).format('DD-MM-YYYY')} - ${dayjs(journal.period_end).format('DD-MM-YYYY')}`
                    }
                  </Text>
                </td>
                <td className='table-cell' onClick={() => onViewFile(journal)}>
                  <Group gap="xs" align="center">
                    {journal.files && journal.files.filter(f => !f.is_deleted).length > 0 ? (
                      <>
                        <ThemeIcon size="sm" color="blue" variant="light">
                          <IconFile size={14} />
                        </ThemeIcon>
                        <Text size="sm">
                          {journal.files.filter(f => !f.is_deleted).length} файл(ов)
                        </Text>
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">Нет файлов</Text>
                    )}
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
                </td>
                {canManageStatuses && (
                  <td className='table-cell'>
                    <Group gap="xs" align="center">
                      {(() => {
                        const hasFiles = journal.filled_at !== null && journal.files && journal.files.length > 0;
                        const activeFilesCount = journal.files ? journal.files.filter(f => !f.is_deleted).length : 0;
                        
                        if (!hasFiles || activeFilesCount === 0) {
                          return (
                            <Text size="xs" c="dimmed">
                              Загрузите файлы
                            </Text>
                          );
                        }
                        
                        return (
                          <>
                            <Tooltip label="Одобрить">
                              <ActionIcon 
                                size="sm" 
                                color="green" 
                                variant={journal.status === 'approved' ? 'filled' : 'light'} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onApproveJournal(journal);
                                }}
                              >
                                <IconCheck size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Отклонить">
                              <ActionIcon 
                                size="sm" 
                                color="red" 
                                variant={journal.status === 'rejected' ? 'filled' : 'light'} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectModalOpen(journal.id);
                                }}
                              >
                                <IconX size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Modal opened={journal.id === rejectModalOpen} onClose={() => setRejectModalOpen(null)} title='Укажите причину' centered zIndex={99999}>
                              <Stack>
                                <Textarea
                                  placeholder="Комментарий..."
                                  value={rejectMessage}
                                  onChange={(e) => setRejectMessage(e.currentTarget.value)}
                                />
                                <Group grow>
                                  <Button onClick={() => setRejectModalOpen(null)} variant='light'>Отмена</Button>
                                  <Button onClick={() => {onRejectJournal(journal, 'rejected', rejectMessage), setRejectModalOpen(null)}}>Подтвердить</Button>
                                </Group>
                                
                              </Stack>
                            </Modal>
                          </>
                        );
                      })()}
                    </Group>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Card>
  );
};

export default LocalJournalTable