import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal, Box, Paper, Stack, Text, Group, Select, ActionIcon, Badge, ScrollArea, Divider, Image, Button } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconDownload, IconEye } from '@tabler/icons-react';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { API } from '../../../config/constants';

type RKCalendarProps = {
  opened: boolean;
  onClose: () => void;
  rkList: any[];
  title?: string;
};

type MonthItem = {
  date: string;
  rrs: string;
  branch: string;
  rkId: string;
  attachmentId: string;
  attachment?: any;
};

export default function RKCalendarModal({ opened, onClose, rkList, title = 'Календарь событий' }: RKCalendarProps) {
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [monthModalOpened, setMonthModalOpened] = useState(false);
  const [selectedMonthData, setSelectedMonthData] = useState<{ month: number; year: number; items: MonthItem[] } | null>(null);
  const [attachmentModalOpened, setAttachmentModalOpened] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<{ item: MonthItem; rk: any } | null>(null);
  const [filePreviewOpened, setFilePreviewOpened] = useState(false);
  const [filePreviewData, setFilePreviewData] = useState<{ files: string[]; currentIndex: number } | null>(null);

  // Получаем доступные годы из данных
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    (rkList || []).forEach((rk: any) => {
      (rk?.rkAttachment || []).forEach((att: any) => {
        if (!att?.agreedTo) return;
        const d = dayjs(att.agreedTo);
        if (d.isValid()) {
          years.add(d.year());
        }
      });
    });
    return Array.from(years).sort((a, b) => b - a); // Сортируем по убыванию
  }, [rkList]);

  const monthColumns = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({ 
      key: i, 
      label: dayjs().month(i).format('MMMM'), 
      items: [] as MonthItem[] 
    }));
    
    (rkList || []).forEach((rk: any) => {
      const rrs = rk?.branch?.rrs || '-';
      const branch = rk?.branch?.name || '-';
      (rk?.rkAttachment || []).forEach((att: any) => {
        if (!att?.agreedTo) return;
        const d = dayjs(att.agreedTo);
        if (!d.isValid() || d.year() !== selectedYear) return;
        months[d.month()].items.push({ 
          date: d.format('DD.MM.YYYY'), 
          rrs, 
          branch,
          rkId: rk.id,
          attachmentId: att.id,
          attachment: att
        });
      });
    });
    
    months.forEach(m => m.items.sort((a, b) => dayjs(a.date, 'DD.MM.YYYY').valueOf() - dayjs(b.date, 'DD.MM.YYYY').valueOf()));
    return months;
  }, [rkList, selectedYear]);

  const handleMonthClick = (monthIndex: number) => {
    const monthData = monthColumns[monthIndex];
    if (monthData.items.length > 0) {
      setSelectedMonthData({
        month: monthIndex,
        year: selectedYear,
        items: monthData.items
      });
      setMonthModalOpened(true);
    }
  };

  const handleItemClick = (e: React.MouseEvent, item: MonthItem) => {
    e.stopPropagation(); // Останавливаем всплытие, чтобы не открывалась модалка месяца
    const rk = rkList.find((r: any) => r.id === item.rkId);
    if (rk) {
      setSelectedAttachment({ item, rk });
      setAttachmentModalOpened(true);
    }
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={title}
        size="90vw"
        centered
      >
        <Stack gap="md">
          {/* Навигация по годам */}
          <Group justify="center" gap="md">
            <ActionIcon
              variant="light"
              onClick={() => setSelectedYear(prev => prev - 1)}
              disabled={!availableYears.includes(selectedYear - 1)}
            >
              <IconChevronLeft size={20} />
            </ActionIcon>
            
            <Select
              value={String(selectedYear)}
              onChange={(val) => val && setSelectedYear(parseInt(val))}
              data={availableYears.map(y => ({ value: String(y), label: String(y) }))}
              style={{ minWidth: 100 }}
              styles={{
                input: {
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '18px'
                }
              }}
            />
            
            <ActionIcon
              variant="light"
              onClick={() => setSelectedYear(prev => prev + 1)}
              disabled={!availableYears.includes(selectedYear + 1)}
            >
              <IconChevronRight size={20} />
            </ActionIcon>
          </Group>

          {/* Календарь месяцев */}
          <Box style={{ height: '70vh', overflowY: 'auto' }}>
            <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
              {monthColumns.map((m) => (
                <Paper 
                  key={m.key} 
                  withBorder 
                  p="sm" 
                  radius="md" 
                  shadow="xs"
                  style={{
                    cursor: m.items.length > 0 ? 'pointer' : 'default',
                    opacity: m.items.length > 0 ? 1 : 0.7
                  }}
                  onClick={() => handleMonthClick(m.key)}
                >
                  <Group justify="space-between" mb="xs">
                    <Text fw={700} ta="center" style={{ textTransform: 'capitalize', flex: 1 }}>
                      {m.label}
                    </Text>
                    {m.items.length > 0 && (
                      <Badge size="sm" color="blue" variant="filled">
                        {m.items.length}
                      </Badge>
                    )}
                  </Group>
                  <Stack gap={6} style={{ maxHeight: '80px', overflow: 'hidden' }}>
                    {m.items.length === 0 ? (
                      <Text size="xs" c="dimmed" ta="center">Нет событий</Text>
                    ) : (
                      <>
                        {m.items.slice(0, 2).map((it, idx) => (
                          <Paper 
                            key={idx} 
                            p={6} 
                            radius="sm" 
                            withBorder
                            style={{
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onClick={(e) => handleItemClick(e, it)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)';
                              e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <Text size="xs" fw={600} lineClamp={1}>{it.date}</Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>{it.rrs}</Text>
                          </Paper>
                        ))}
                        {m.items.length > 2 && (
                          <Text size="xs" c="dimmed" ta="center">
                            +{m.items.length - 2} еще
                          </Text>
                        )}
                      </>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Box>
        </Stack>
      </Modal>

      {/* Модалка просмотра записей месяца */}
      <Modal
        opened={monthModalOpened}
        onClose={() => setMonthModalOpened(false)}
        title={selectedMonthData ? `${dayjs().month(selectedMonthData.month).format('MMMM')} ${selectedMonthData.year}` : ''}
        size="lg"
        centered
      >
        {selectedMonthData && (
          <ScrollArea h={500}>
            <Stack gap="md">
              {selectedMonthData.items.map((item, idx) => {
                const rk = rkList.find((r: any) => r.id === item.rkId);
                return (
                  <Paper 
                    key={idx} 
                    p="md" 
                    withBorder
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => {
                      if (rk) {
                        setSelectedAttachment({ item, rk });
                        setAttachmentModalOpened(true);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = 'var(--mantine-shadow-md)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={600}>{item.date}</Text>
                        <Badge color="blue" variant="light">
                          {item.rrs}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        Филиал: {item.branch}
                      </Text>
                      {item.attachment && (
                        <Stack gap="xs" mt="xs">
                          {item.attachment.clarification && (
                            <Text size="sm" lineClamp={2}>
                              <strong>Уточнение:</strong> {item.attachment.clarification}
                            </Text>
                          )}
                          {item.attachment.typeStructure && (
                            <Group gap="xs">
                              <Text size="sm" c="dimmed">Тип:</Text>
                              <Badge color={item.attachment.typeStructure.colorHex || 'gray'}>
                                {item.attachment.typeStructure.name}
                              </Badge>
                            </Group>
                          )}
                          {item.attachment.approvalStatus && (
                            <Group gap="xs">
                              <Text size="sm" c="dimmed">Статус:</Text>
                              <Badge color={item.attachment.approvalStatus.colorHex || 'gray'}>
                                {item.attachment.approvalStatus.name}
                              </Badge>
                            </Group>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        )}
      </Modal>

      {/* Модалка просмотра детальной информации о записи */}
      <Modal
        opened={attachmentModalOpened}
        onClose={() => setAttachmentModalOpened(false)}
        title={selectedAttachment ? `Запись от ${selectedAttachment.item.date}` : ''}
        size="xl"
        centered
      >
        {selectedAttachment && selectedAttachment.item.attachment && (
          <Stack gap="md">
            {/* Информация о записи */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group justify="space-between">
                  <Text fw={700} size="lg">Информация о записи</Text>
                  <Badge color="blue" size="lg">
                    {selectedAttachment.item.rrs}
                  </Badge>
                </Group>
                
                <Group>
                  <Text size="sm" c="dimmed">Дата:</Text>
                  <Text size="sm" fw={500}>{selectedAttachment.item.date}</Text>
                </Group>
                
                <Group>
                  <Text size="sm" c="dimmed">Филиал:</Text>
                  <Text size="sm" fw={500}>{selectedAttachment.item.branch}</Text>
                </Group>

                {selectedAttachment.item.attachment.clarification && (
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Уточнение:</Text>
                    <Paper p="sm" withBorder style={{ background: 'var(--mantine-color-gray-0)' }}>
                      <Text size="sm">{selectedAttachment.item.attachment.clarification}</Text>
                    </Paper>
                  </Box>
                )}

                <Group gap="md">
                  {selectedAttachment.item.attachment.typeStructure && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Тип:</Text>
                      <Badge 
                        color={selectedAttachment.item.attachment.typeStructure.colorHex || 'gray'} 
                        variant="outline"
                        style={{ 
                          textTransform: 'none',
                          fontWeight: '500',
                          borderRadius: '8px',
                          padding: '4px 12px'
                        }}
                      >
                        {selectedAttachment.item.attachment.typeStructure.name}
                      </Badge>
                    </Group>
                  )}

                  {selectedAttachment.item.attachment.approvalStatus && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Статус:</Text>
                      <Badge 
                        color={selectedAttachment.item.attachment.approvalStatus.colorHex || 'gray'} 
                        variant="light"
                        style={{ 
                          textTransform: 'none',
                          fontWeight: '500',
                          borderRadius: '8px',
                          padding: '4px 12px'
                        }}
                      >
                        {selectedAttachment.item.attachment.approvalStatus.name}
                      </Badge>
                    </Group>
                  )}
                </Group>

                {selectedAttachment.item.attachment.sizeXY && (
                  <Group>
                    <Text size="sm" c="dimmed">Размер:</Text>
                    <Text size="sm">{selectedAttachment.item.attachment.sizeXY}</Text>
                  </Group>
                )}

                {selectedAttachment.item.attachment.createdAt && (
                  <Group>
                    <Text size="sm" c="dimmed">Создано:</Text>
                    <Text size="sm">
                      {dayjs(selectedAttachment.item.attachment.createdAt).format('DD.MM.YYYY HH:mm')}
                    </Text>
                  </Group>
                )}

                {selectedAttachment.item.attachment.agreedTo && (
                  <Group>
                    <Text size="sm" c="dimmed">Согласовано до:</Text>
                    <Text size="sm" fw={500}>
                      {dayjs(selectedAttachment.item.attachment.agreedTo).format('DD.MM.YYYY HH:mm')}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Paper>

            {/* Превью файла в стиле AttachmentCard */}
            {selectedAttachment.item.attachment.source && (
              <Paper
                withBorder
                radius="md"
                p="sm"
                shadow="xs"
                style={{ position: 'relative' }}
              >
                <ActionIcon
                  component="a"
                  href={`${API}/public/add/RK/${selectedAttachment.item.attachment.source}`}
                  download={selectedAttachment.item.attachment.source.split('/').pop()}
                  variant="light"
                  color="blue"
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  aria-label="Скачать"
                >
                  <IconDownload size={16} />
                </ActionIcon>
                
                <Group justify="flex-start" align="center" mb="sm">
                  {(() => {
                    const fileName = selectedAttachment.item.attachment.source.split('/').pop() || 'Файл';
                    const fileUrl = `${API}/public/add/RK/${selectedAttachment.item.attachment.source}`;
                    const extension = fileName.split('.').pop()?.toLowerCase() || '';
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension);
                    
                    return isImage ? (
                      <Image 
                        src={fileUrl} 
                        h={200} 
                        w="auto" 
                        fit="contain" 
                        radius="sm" 
                        alt={fileName}
                        style={{ maxWidth: '100%' }}
                      />
                    ) : (
                      <Box style={{ textAlign: 'center', padding: '20px' }}>
                        <Text size="xl" mb="xs">
                          {extension === 'pdf' ? '📄' : 
                           ['doc', 'docx'].includes(extension) ? '📝' :
                           ['xls', 'xlsx'].includes(extension) ? '📊' :
                           ['zip', 'rar', '7z'].includes(extension) ? '📦' : '📄'}
                        </Text>
                        <Text size="sm" c="blue" fw={500}>
                          {fileName}
                        </Text>
                      </Box>
                    );
                  })()}
                </Group>

                <Group justify="center">
                  <Button
                    leftSection={<IconEye size={18} />}
                    onClick={() => {
                      const fileUrl = `${API}/public/add/RK/${selectedAttachment.item.attachment.source}`;
                      setFilePreviewData({ files: [fileUrl], currentIndex: 0 });
                      setFilePreviewOpened(true);
                    }}
                  >
                    Просмотреть файл
                  </Button>
                </Group>
              </Paper>
            )}

            {selectedAttachment.rk && (
              <>
                <Divider />
                <Paper p="md" withBorder>
                  <Text size="sm" fw={500} mb="xs">Информация о РК:</Text>
                  <Stack gap="xs">
                    {selectedAttachment.rk.branch && (
                      <Group gap="xs">
                        <Text size="sm" c="dimmed">Филиал:</Text>
                        <Text size="sm">{selectedAttachment.rk.branch.name}</Text>
                        {selectedAttachment.rk.branch.code && (
                          <Text size="sm" c="dimmed">({selectedAttachment.rk.branch.code})</Text>
                        )}
                      </Group>
                    )}
                    {selectedAttachment.rk.userAdd && (
                      <Group gap="xs">
                        <Text size="sm" c="dimmed">Добавил:</Text>
                        <Text size="sm">{selectedAttachment.rk.userAdd.name}</Text>
                      </Group>
                    )}
                  </Stack>
                </Paper>
              </>
            )}
          </Stack>
        )}
      </Modal>

      {/* Модалка просмотра файла */}
      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={() => {
          setFilePreviewOpened(false);
          setFilePreviewData(null);
        }}
        attachments={filePreviewData?.files.map((file, index) => {
          const fileName = file.split('/').pop() || '';
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const isPdf = ext === 'pdf';
          const mimeType = isPdf ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          return {
            id: `file-${index}`,
            source: file,
            name: fileName,
            mimeType
          };
        }) || []}
        initialIndex={filePreviewData?.currentIndex || 0}
      />
    </>
  );
}


