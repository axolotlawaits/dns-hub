import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { CalendarModal } from '../../../utils/CustomModal';

type RKCalendarProps = {
  opened: boolean;
  onClose: () => void;
  rkList: any[];
  title?: string;
};

export default function RKCalendarModal({ opened, onClose, rkList, title = 'Календарь событий' }: RKCalendarProps) {
  const monthColumns = useMemo(() => {
    const year = dayjs().year();
    const months = Array.from({ length: 12 }, (_, i) => ({ 
      key: i, 
      label: dayjs().month(i).format('MMMM'), 
      items: [] as { date: string; rrs: string; branch: string }[] 
    }));
    
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

  const renderCalendarContent = () => (
    <Box style={{ height: '65vh', overflowY: 'hidden' }}>
      <Box style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(12, 1fr)', 
        gap: 'var(--space-2)',
        padding: 'var(--space-2)'
      }}>
        {monthColumns.map((m) => (
          <Paper 
            key={m.key} 
            withBorder 
            p="sm" 
            radius="md" 
            shadow="xs"
            style={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border)',
              transition: 'var(--transition-all)',
              minHeight: '120px',
              maxHeight: '120px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Text 
              fw={700} 
              ta="center" 
              mb="sm"
              style={{ 
                textTransform: 'capitalize',
                color: 'var(--theme-text-primary)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              {m.label}
            </Text>
            
            <Stack gap="sm">
              {m.items.length === 0 ? (
                <Box 
                  style={{
                    textAlign: 'center',
                    padding: 'var(--space-2)',
                    color: 'var(--theme-text-secondary)',
                    background: 'var(--theme-bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--theme-border)',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text size="xs" c="dimmed">Нет событий</Text>
                </Box>
              ) : (
                m.items.map((it, idx) => (
                  <Paper 
                    key={idx} 
                    p="xs" 
                    radius="sm" 
                    withBorder
                    style={{
                      background: 'var(--theme-bg-secondary)',
                      border: '1px solid var(--theme-border)',
                      transition: 'var(--transition-all)',
                      cursor: 'pointer',
                      marginBottom: 'var(--space-1)'
                    }}
                    className="calendar-event-card"
                  >
                    <Stack gap="xs">
                      <Text size="xs" fw={600} c="var(--theme-text-primary)">
                        {it.date}
                      </Text>
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {it.rrs}
                      </Text>
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {it.branch}
                      </Text>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          </Paper>
        ))}
      </Box>
    </Box>
  );

  return (
    <CalendarModal
      opened={opened}
      onClose={onClose}
      title={title}
      width="95vw"
      maxWidth="95vw"
      height="80vh"
      maxHeight="80vh"
      styles={{
        content: {
          width: '95vw !important',
          maxWidth: '95vw !important',
          height: '80vh !important',
          maxHeight: '80vh !important'
        }
      }}
    >
      {renderCalendarContent()}
    </CalendarModal>
  );
}
