import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Paper, Text, Badge, Group, Switch, Box, Stack, ScrollArea, Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { API } from '../config/constants';
import { useUserContext } from '../hooks/useUserContext';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { FilterGroup } from '../utils/filter';
import type { ColumnFiltersState } from '@tanstack/react-table';
import '../utils/styles/filter.css';

interface LogEntry {
  type?: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  source?: string;
  data?: any;
}

const LogViewer: React.FC = () => {
  const { token } = useUserContext();
  const { setHeader, clearHeader } = usePageHeader();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Фильтры с использованием ColumnFiltersState
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Логи сервера',
      subtitle: 'Мониторинг и анализ системных логов',
      icon: <Text size="xl" fw={700} c="white">🐛</Text>
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  useEffect(() => {
    // Получаем токен из контекста пользователя
    if (!token) {
      console.error('No access token found');
      return;
    }

    // Создаем EventSource для SSE подключения
    // EventSource не поддерживает заголовки, используем query параметр
    const eventSource = new EventSource(`${API}/logs/stream?token=${encodeURIComponent(token)}`);

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('📡 [SSE] Подключение установлено');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const logData: LogEntry = JSON.parse(event.data);
        
        if (logData.type === 'connected') {
          console.log('📡 [SSE]', logData.message);
          return;
        }

        setLogs((prevLogs) => {
          const newLogs = [...prevLogs, logData];
          // Ограничиваем количество логов до 2000 для оптимизации
          return newLogs.slice(-2000);
        });
      } catch (error) {
        console.error('Error parsing log data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('📡 [SSE] Ошибка:', error);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [token]);

  // Автопрокрутка к последнему логу
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'info': return 'blue';
      case 'debug': return 'gray';
      default: return 'gray';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU');
  };

  // Получение уникальных значений для фильтров
  const levelOptions = useMemo(() => [
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'debug', label: 'Debug' }
  ], []);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    logs.forEach(log => {
      if (log.source) sources.add(log.source);
    });
    return Array.from(sources).sort().map(s => ({ value: s, label: s }));
  }, [logs]);

  const uniqueHeaders = useMemo(() => {
    const headers = new Set<string>();
    logs.forEach(log => {
      const headerMatch = log.message.match(/\[([^\]]+)\]/);
      if (headerMatch) headers.add(headerMatch[1]);
    });
    return Array.from(headers).sort().map(h => ({ value: h, label: h }));
  }, [logs]);

  // Фильтрация логов
  const filteredLogs = useMemo(() => {
    const levelFilter = columnFilters.find(f => f.id === 'level')?.value as string[] | undefined;
    const sourceFilter = columnFilters.find(f => f.id === 'source')?.value as string[] | undefined;
    const headerFilter = columnFilters.find(f => f.id === 'header')?.value as string[] | undefined;
    const timeFilter = columnFilters.find(f => f.id === 'time')?.value as { from?: string; to?: string } | undefined;

    return logs.filter(log => {
      // Фильтр по уровню
      if (levelFilter && levelFilter.length > 0 && !levelFilter.includes(log.level)) return false;
      
      // Фильтр по источнику
      if (sourceFilter && sourceFilter.length > 0 && (!log.source || !sourceFilter.includes(log.source))) return false;
      
      // Фильтр по заголовку
      if (headerFilter && headerFilter.length > 0) {
        const headerMatch = log.message.match(/\[([^\]]+)\]/);
        const header = headerMatch ? headerMatch[1] : '';
        if (!headerFilter.some(h => header.includes(h))) return false;
      }
      
      // Фильтр по времени (формат HH:mm)
      if (timeFilter?.from || timeFilter?.to) {
        const logDate = new Date(log.timestamp);
        const logTimeMinutes = logDate.getHours() * 60 + logDate.getMinutes();
        
        if (timeFilter.from) {
          const [fromHours, fromMinutes] = timeFilter.from.split(':').map(Number);
          const fromTimeMinutes = fromHours * 60 + fromMinutes;
          if (logTimeMinutes < fromTimeMinutes) return false;
        }
        
        if (timeFilter.to) {
          const [toHours, toMinutes] = timeFilter.to.split(':').map(Number);
          const toTimeMinutes = toHours * 60 + toMinutes;
          if (logTimeMinutes > toTimeMinutes) return false;
        }
      }
      
      return true;
    });
  }, [logs, columnFilters]);

  // Парсинг сообщения для выделения заголовка и JSON
  const parseMessage = (message: string) => {
    // Ищем заголовок в формате [Название]
    const headerMatch = message.match(/\[([^\]]+)\]/);
    const header = headerMatch ? headerMatch[1] : null;
    
    // Ищем JSON в сообщении
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    let jsonData = null;
    if (jsonMatch) {
      try {
        jsonData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // JSON невалидный, игнорируем
      }
    }
    
    // Текст без заголовка и JSON
    let text = message;
    
    // Удаляем заголовок в формате [Name]
    if (header) {
      const headerPattern = new RegExp(`\\s*\\[${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`, 'g');
      text = text.replace(headerPattern, ' ').trim();
    }
    
    // Удаляем JSON
    if (jsonMatch) {
      text = text.replace(jsonMatch[0], '').trim();
    }
    
    return { header, text, jsonData };
  };

  const handleColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== columnId);
      return [...filtered, { id: columnId, value }];
    });
  };

  const filtersConfig = [
    {
      type: 'select' as const,
      columnId: 'level',
      label: 'Уровень',
      placeholder: 'Выберите уровень',
      options: levelOptions
    },
    {
      type: 'select' as const,
      columnId: 'source',
      label: 'Источник',
      placeholder: 'Выберите источник',
      options: uniqueSources
    },
    {
      type: 'select' as const,
      columnId: 'header',
      label: 'Заголовок',
      placeholder: 'Выберите заголовок',
      options: uniqueHeaders
    },
    {
      type: 'time' as const,
      columnId: 'time',
      label: 'Время',
      placeholder: 'Выберите период'
    }
  ];

  const errorCount = filteredLogs.filter(log => log.level === 'error').length;
  const warnCount = filteredLogs.filter(log => log.level === 'warn').length;

  return (
    <Box style={{ width: '100%', padding: 'var(--mantine-spacing-xl) var(--mantine-spacing-md)' }}>
      <Stack gap="xl">
        {/* Status and controls */}
        <Paper 
          shadow="lg" 
          radius="lg" 
          p="md"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04))',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          
          <FilterGroup
            filters={filtersConfig}
            columnFilters={columnFilters}
            onColumnFiltersChange={handleColumnFiltersChange}
            title="Фильтры логов"
          />
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Badge color={isConnected ? 'green' : 'red'} variant="filled" size="lg">
                {isConnected ? 'Подключено' : 'Отключено'}
              </Badge>
              <Badge variant="outline" size="lg">
                {filteredLogs.length} / {logs.length}
              </Badge>
              {errorCount > 0 && (
                <Badge color="red" variant="filled" size="lg">
                  {errorCount} ошибок
                </Badge>
              )}
              {warnCount > 0 && (
                <Badge color="yellow" variant="filled" size="lg">
                  {warnCount} предупреждений
                </Badge>
              )}
            </Group>
            <Group gap="xs">
              <Text size="sm" c="dimmed">Автопрокрутка</Text>
              <Switch checked={autoScroll} onChange={(e) => setAutoScroll(e.currentTarget.checked)} />
            </Group>
          </Group>
          
        </Paper>

        {/* Alert для ошибок */}
        {errorCount > 0 && (
          <Alert 
            variant="light" 
            color="red" 
            title="Обнаружены ошибки" 
            icon={<IconAlertTriangle size={20} />}
            radius="md"
          >
            В логах найдено {errorCount} ошибок. Проверьте фильтры или расширьте диапазон времени.
          </Alert>
        )}

        {/* Filters */}


        {/* Logs */}
        <Paper 
          shadow="xl" 
          radius="xl" 
          p="md"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            height: 'calc(100vh - 450px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <ScrollArea viewportRef={scrollRef} style={{ height: '100%' }}>
            <Stack gap="xs">
              {filteredLogs.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {logs.length === 0 ? 'Ожидание логов...' : 'Нет логов, соответствующих фильтрам'}
                </Text>
              ) : (
                filteredLogs.map((log, index) => {
                  const { header, text, jsonData } = parseMessage(log.message);
                  
                  // Подсчет повторений этого сообщения
                  let repeatCount = 1;
                  if (index > 0) {
                    const prevLog = filteredLogs[index - 1];
                    if (prevLog.message === log.message && 
                        prevLog.level === log.level &&
                        prevLog.source === log.source) {
                      return null; // Пропускаем повторяющийся лог
                    }
                  }
                  
                  // Подсчет следующих повторений
                  for (let i = index + 1; i < filteredLogs.length; i++) {
                    const nextLog = filteredLogs[i];
                    if (nextLog.message === log.message && 
                        nextLog.level === log.level &&
                        nextLog.source === log.source) {
                      repeatCount++;
                    } else {
                      break;
                    }
                  }

                  return (
                    <Paper
                      key={index}
                      p="xs"
                      withBorder
                      radius="sm"
                      style={{
                        backgroundColor: log.level === 'error' ? 'rgba(250, 82, 82, 0.05)' : 
                                         log.level === 'warn' ? 'rgba(250, 176, 5, 0.05)' : 
                                         'rgba(0, 0, 0, 0.01)',
                        borderColor: log.level === 'error' ? 'rgba(250, 82, 82, 0.2)' : 
                                     log.level === 'warn' ? 'rgba(250, 176, 5, 0.2)' : 
                                     'rgba(0, 0, 0, 0.1)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Group gap="xs" align="flex-start" wrap="nowrap">
                        <Badge size="sm" color={getLogColor(log.level)} variant="filled">
                          {log.level.toUpperCase()}
                        </Badge>
                        <Text c="dimmed" size="xs" style={{ minWidth: '80px' }}>
                          {formatTime(log.timestamp)}
                        </Text>
                        {log.source && (
                          <Badge size="xs" variant="outline" color="gray">
                            {log.source}
                          </Badge>
                        )}
                        {header && (
                          <Badge size="xs" color="blue" variant="light">
                            {header}
                          </Badge>
                        )}
                        {text && (
                          <Text style={{ flex: 1, wordBreak: 'break-word' }}>{text}</Text>
                        )}
                        {repeatCount > 1 && (
                          <Badge 
                            size="lg" 
                            color="gray" 
                            variant="filled"
                            style={{ 
                              borderRadius: '50%',
                              minWidth: '24px',
                              height: '24px',
                              padding: '0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            {repeatCount}
                          </Badge>
                        )}
                      </Group>
                      {(jsonData || log.data) && (
                        <Box 
                          mt="xs" 
                          ml="md"
                          p="xs"
                          style={{ 
                            backgroundColor: 'rgba(0, 0, 0, 0.03)',
                            borderRadius: '4px',
                            border: '1px solid rgba(0, 0, 0, 0.05)'
                          }}
                        >
                          <Text 
                            c="dimmed" 
                            size="xs" 
                            style={{ 
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all'
                            }}
                          >
                            {JSON.stringify(jsonData || log.data, null, 2)}
                          </Text>
                        </Box>
                      )}
                    </Paper>
                  );
                }).filter(Boolean)
              )}
            </Stack>
          </ScrollArea>
        </Paper>
      </Stack>
    </Box>
  );
};

export default LogViewer;
