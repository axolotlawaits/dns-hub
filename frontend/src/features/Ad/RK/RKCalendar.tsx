import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Modal, Box, Paper, Stack, Text } from '@mantine/core';

type RKCalendarProps = {
  opened: boolean;
  onClose: () => void;
  rkList: any[];
  title?: string;
};

export default function RKCalendarModal({ opened, onClose, rkList, title = 'Календарь событий' }: RKCalendarProps) {
  const monthColumns = useMemo(() => {
    const year = dayjs().year();
    const months = Array.from({ length: 12 }, (_, i) => ({ key: i, label: dayjs().month(i).format('MMMM'), items: [] as { date: string; rrs: string; branch: string }[] }));
    (rkList || []).forEach((rk: any) => {
      const rrs = rk?.branch?.rrs || '-';
      const branch = rk?.branch?.name || '-';
      (rk?.rkAttachment || []).forEach((att: any) => {
        if (!att?.agreedTo) return;
        const d = dayjs(att.agreedTo);
        if (!d.isValid() || d.year() !== year) return;
        months[d.month()].items.push({ date: d.format('DD.MM.YYYY'), rrs, branch });
      });
    });
    months.forEach(m => m.items.sort((a, b) => dayjs(a.date, 'DD.MM.YYYY').valueOf() - dayjs(b.date, 'DD.MM.YYYY').valueOf()));
    return months;
  }, [rkList]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="90vw"
      centered
    >
      <Box style={{ height: '70vh' }}>
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
          {monthColumns.map((m) => (
            <Paper key={m.key} withBorder p="sm" radius="md" shadow="xs">
              <Text fw={700} ta="center" mb="xs" style={{ textTransform: 'capitalize' }}>{m.label}</Text>
              <Stack gap={6}>
                {m.items.length === 0 ? (
                  <Text size="xs" c="dimmed" ta="center">Нет событий</Text>
                ) : (
                  m.items.map((it, idx) => (
                    <Paper key={idx} p={6} radius="sm" withBorder>
                      <Text size="xs" fw={600}>{it.date}</Text>
                      <Text size="xs" c="dimmed">{it.rrs}</Text>
                      <Text size="xs" c="dimmed">{it.branch}</Text>
                    </Paper>
                  ))
                )}
              </Stack>
            </Paper>
          ))}
        </Box>
      </Box>
    </Modal>
  );
}


