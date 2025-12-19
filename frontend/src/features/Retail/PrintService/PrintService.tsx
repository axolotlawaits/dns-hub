import { useState, useMemo, useCallback, useEffect } from 'react';
import { API } from '../../../config/constants';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import {  Button,  Title,  LoadingOverlay,  Group,  Select,  TextInput,  Text,  ActionIcon,  Badge,  Stack,  MultiSelect,  Alert, Paper, Grid, ThemeIcon, Tooltip, Divider, ScrollArea, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notificationSystem } from '../../../utils/Push';
import { formatPrice } from '../../../utils/format';
import { DynamicFormModal } from '../../../utils/formModal';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { 
  IconTrash, 
  IconPrinter, 
  IconSettings, 
  IconCalendar, 
  IconTag, 
  IconCheck,
  IconAlertTriangle,
  IconRefresh
} from '@tabler/icons-react';

dayjs.locale('ru');

interface PriceTagTemplate {
  value: string;
  label: string;
  numericFormat: number;
}

interface PreviewItem {
  id: string;
  branchId: string;
  tovarName: string;
  tovarCode: number;
  remainder: number;
  price: number;
  createdAt: string;
  updatedAt: string;
  department: string;
  group: string;
  category: string;
  brand: string;
  tovarId: string;
  format: number;
}

interface ItemWithSize extends PreviewItem {
  size: string;
}

interface PreviewData {
  count: number;
  template: string;
  sampleItems: ItemWithSize[];
  dateFrom: string;
}

const TEMPLATES: PriceTagTemplate[] = [
  { value: 'StandardAutoprinter-Atol', label: 'Стандартный ценник (Атол)', numericFormat: 25 },
  { value: 'BigAutoprinter-Atol', label: 'Большой ценник (Атол)', numericFormat: 26 },
  { value: 'Termo', label: 'Термоэтикетка', numericFormat: 99 },
  { value: 'Standard', label: 'Стандартный ценник', numericFormat: 1 },
];

// Компонент для отображения элемента списка
const PrintItemCard = ({ 
  item, 
  index, 
  total, 
  onRemove, 
  onSizeChange 
}: { 
  item: ItemWithSize; 
  index: number; 
  total: number; 
  onRemove: (id: string) => void; 
  onSizeChange: (id: string, size: string | null) => void; 
}) => (
  <Paper
    shadow="sm"
    radius="md"
    p="md"
    style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      transition: 'all 0.2s ease',
      cursor: 'default',
    }}
    className="print-item-card"
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04))';
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))';
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
  >
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      {/* Левая часть - действия и код */}
      <Group gap="sm" align="flex-start">
        <Tooltip label="Удалить из списка">
          <ActionIcon
            onClick={() => onRemove(item.id)}
            color="red"
            variant="light"
            size="md"
            radius="md"
          >
            <IconTrash size="1rem" />
          </ActionIcon>
        </Tooltip>
        
        <Badge 
          variant="gradient" 
          gradient={{ from: 'blue', to: 'cyan' }}
          size="lg"
          radius="md"
        >
          {item.tovarCode}
        </Badge>
      </Group>

      {/* Центральная часть - информация о товаре */}
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} size="md" c="var(--theme-text-primary)" lineClamp={2}>
          {item.tovarName}
        </Text>
        
        <Group gap="lg" wrap="wrap">
          <Group gap="xs">
            <Text size="sm" c="dimmed">Бренд:</Text>
            <Text size="sm" fw={500}>{item.brand}</Text>
          </Group>
          
          <Group gap="xs">
            <Text size="sm" c="dimmed">Цена:</Text>
            <Text fw={600} size="sm" c="green">
              {formatPrice(item.price)}
            </Text>
          </Group>
          
          <Group gap="xs">
            <Text size="sm" c="dimmed">Обновлено:</Text>
            <Text size="sm" c="dimmed">
              {dayjs(item.updatedAt).format('DD.MM.YYYY HH:mm')}
            </Text>
          </Group>
        </Group>
      </Stack>

      {/* Правая часть - выбор шаблона */}
      <Select
        data={TEMPLATES}
        value={item.size}
        onChange={(value) => onSizeChange(item.id, value)}
        size="sm"
        style={{ minWidth: 250 }}
        radius="md"
      />
    </Group>
    
    {index < total - 1 && (
      <Divider 
        my="md" 
        color="rgba(255, 255, 255, 0.1)" 
        variant="dashed" 
      />
    )}
  </Paper>
);

const PriceTagPrinting = () => {
  const { setHeader, clearHeader } = usePageHeader();
  const [dateFrom, setDateFrom] = useState<Date | null>(new Date());
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [authTokens, setAuthTokens] = useState<{ tokenAuth: string; auth: string } | null>(null);
  const [loginData, setLoginData] = useState({ login: '', password: '' });
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [brand, setBrand] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    notificationSystem.addNotification(
      type === 'success' ? 'Успех' : 'Ошибка',
      message,
      type
    );
  }, []);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Печать ценников',
      subtitle: 'Управление печатью ценников для розничной сети',
      icon: <Text size="xl" fw={700} c="var(--theme-text-primary)">🖨️</Text>
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  const getUniqueOptions = useCallback((items: PreviewItem[], key: keyof PreviewItem) => {
    const uniqueValues = [...new Set(items.map(item => item[key]))];
    return uniqueValues.map(value => ({ value: String(value), label: String(value) }));
  }, []);

  const handleAuth = useCallback(async (authData?: { login: string; password: string }) => {
    const dataToUse = authData || loginData;
    try {
      setLoading(true);
      const response = await fetch(`${API}/retail/print-service/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToUse),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка авторизации');
      }

      const data = await response.json();
      console.log('Auth response data:', {
        hasTokens: !!data.tokens,
        hasAuth: !!data.tokens?.auth,
        hasTokenAuth: !!data.tokens?.tokenAuth,
        tokens: data.tokens
      });
      
      if (data.tokens?.auth && data.tokens?.tokenAuth) {
        setAuthTokens(data.tokens);
        closeModal();
        setErrorMessage(null);
        showNotification('success', 'Авторизация успешна');
        console.log('Tokens saved:', {
          hasAuth: !!data.tokens.auth,
          hasTokenAuth: !!data.tokens.tokenAuth
        });
      } else {
        throw new Error('Неверные данные авторизации');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setErrorMessage(errorMsg);
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  }, [loginData, closeModal, showNotification]);

  const fetchPreview = useCallback(async () => {
    if (!dateFrom || !authTokens) {
      showNotification('error', 'Дата или токены авторизации отсутствуют');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API}/retail/print-service/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          dateFrom: dateFrom.toISOString(),
          templateName: 'StandardAutoprinter-Atol',
          tokens: authTokens,
        }),
      });

      if (!response.ok) throw new Error('Ошибка получения предпросмотра');

      const data = await response.json();
      const filterDate = dayjs(dateFrom);
      const filteredItems = data.sampleItems
        .filter((item: PreviewItem) => dayjs(item.updatedAt).isSameOrAfter(filterDate))
        .map((item: PreviewItem) => {
          const template = TEMPLATES.find(t => t.numericFormat === item.format);
          return { ...item, size: template ? template.value : 'StandardAutoprinter-Atol' };
        });

      setPreviewData({ ...data, sampleItems: filteredItems });
      showNotification('success', 'Данные успешно сформированы');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ошибка при формировании данных';
      console.error('Preview error:', errorMsg);
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, authTokens, showNotification]);

  const handlePrint = useCallback(async () => {
    if (!dateFrom || !authTokens || !previewData) {
      showNotification('error', 'Дата, токены или данные для печати отсутствуют');
      return;
    }

    try {
      setLoading(true);
      const filteredItems = previewData.sampleItems.filter(item => {
        const matchesBrand = brand.length === 0 || brand.includes(item.brand);
        const matchesDate = dayjs(item.updatedAt).isSameOrAfter(dayjs(dateFrom));
        return matchesBrand && matchesDate;
      });

      const groupedBySize = filteredItems.reduce((acc, item) => {
        acc[item.size] = acc[item.size] || [];
        acc[item.size].push(item);
        return acc;
      }, {} as Record<string, ItemWithSize[]>);

      for (const [size, items] of Object.entries(groupedBySize)) {
        if (items.length === 0) continue;

        console.log('Sending print request:', {
          size,
          itemsCount: items.length,
          hasAuthTokens: !!authTokens,
          hasTokenAuth: !!authTokens?.tokenAuth,
          hasAuth: !!authTokens?.auth,
          tokens: authTokens
        });

        const response = await fetch(`${API}/retail/print-service/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            dateFrom: dateFrom.toISOString(),
            templateName: size,
            tokens: authTokens,
            nomenclatures: items.map(item => item.tovarId),
          }),
        });

        if (!response.ok) {
          let errorMessage = `Ошибка печати для размера ${size}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
            if (errorData.details) {
              console.error('Print error details:', errorData.details);
            }
          } catch (e) {
            // Если не удалось распарсить JSON, используем текст ответа
            const text = await response.text();
            if (text) {
              errorMessage = `${errorMessage}: ${text}`;
            }
          }
          throw new Error(errorMessage);
        }

        const blob = await response.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      }

      showNotification('success', 'Печать успешно выполнена');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ошибка при печати';
      console.error('Print error:', errorMsg);
      
      // Если ошибка связана с авторизацией, предлагаем повторно авторизоваться
      if (errorMsg.includes('токены') || errorMsg.includes('авторизац') || errorMsg.includes('недействительны') || errorMsg.includes('истекли')) {
        setAuthTokens(null);
        showNotification('error', 'Токены авторизации истекли. Необходимо повторно авторизоваться.');
        openModal();
      } else {
        showNotification('error', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, authTokens, previewData, brand, showNotification, openModal]);

  const handleRemoveItem = useCallback((id: string) => {
    if (!previewData) return;
    setPreviewData(prev => ({
      ...prev!,
      sampleItems: prev!.sampleItems.filter(item => item.id !== id),
    }));
  }, [previewData]);

  const handleSizeChange = useCallback((id: string, size: string | null) => {
    if (!previewData || !size) return;
    setPreviewData(prev => ({
      ...prev!,
      sampleItems: prev!.sampleItems.map(item =>
        item.id === id ? { ...item, size } : item
      ),
    }));
  }, [previewData]);

  const filteredItems = useMemo(() => {
    if (!previewData) return [];
    return previewData.sampleItems.filter(item => {
      const matchesBrand = brand.length === 0 || brand.includes(item.brand);
      const matchesDate = dayjs(item.updatedAt).isSameOrAfter(dayjs(dateFrom));
      return matchesBrand && matchesDate;
    });
  }, [previewData, brand, dateFrom]);

  const shouldShowBrandFilter = useMemo(() =>
    previewData && previewData.sampleItems.length >= 1,
    [previewData]
  );

  const brandOptions = useMemo(() =>
    previewData ? getUniqueOptions(previewData.sampleItems, 'brand') : [],
    [previewData, getUniqueOptions]
  );

  if (!authTokens) {
    return (
      <Box size="xl">
        <Paper 
          shadow="xl" 
          radius="xl" 
          p="xl"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Stack align="center" gap="xl">
            <ThemeIcon size={80} radius="xl" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <IconPrinter size={40} />
            </ThemeIcon>
            
            <Stack align="center" gap="md">
              <Title order={1} ta="center" c="var(--theme-text-primary)">
                Печать ценников
              </Title>
              <Text size="lg" c="dimmed" ta="center" maw={500}>
                Для работы с печатью ценников необходимо авторизоваться в системе WEB База
              </Text>
            </Stack>

            <Button 
              size="lg" 
              onClick={openModal}
              leftSection={<IconSettings size={20} />}
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              radius="xl"
            >
              Авторизация (WEB База)
            </Button>
          </Stack>

          <DynamicFormModal
            opened={modalOpened}
            onClose={closeModal}
            title="Авторизация (WEB База)"
            mode="create"
            submitButtonText="Создать"
            fields={[
              {
                name: 'login',
                label: 'Логин',
                type: 'text',
                required: true,
                placeholder: 'Введите логин',
                leftSection: <IconSettings size={16} />,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const form = e.currentTarget.closest('form');
                    if (form) {
                      const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                      if (submitButton) {
                        submitButton.click();
                      }
                    }
                  }
                }
              },
              {
                name: 'password',
                label: 'Пароль',
                type: 'text',
                required: true,
                placeholder: 'Введите пароль',
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const form = e.currentTarget.closest('form');
                    if (form) {
                      const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                      if (submitButton) {
                        submitButton.click();
                      }
                    }
                  }
                }
                // Для пароля можно добавить маскирование
              }
            ]}
            initialValues={loginData}
            onSubmit={async (values) => {
              const authData = {
                login: values.login || '',
                password: values.password || ''
              };
              setLoginData(authData);
              await handleAuth(authData);
            }}
            error={errorMessage}
          />
        </Paper>
      </Box>
    );
  }

  return (
    <Box size="xl">
      <Stack gap="xl">
        {/* Заголовок и предупреждение */}
        <Paper 
          shadow="xl" 
          radius="xl" 
          p="lg"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Stack gap="lg">

            <Alert 
              variant="light" 
              color="red" 
              title="Важное предупреждение" 
              icon={<IconAlertTriangle size={20} />}
              radius="md"
            >
              Если печать не выводится вся или частично, проверьте включены ли всплывающие окна! 
              (Кнопка в адресной строке браузера)
            </Alert>
          </Stack>
        </Paper>

        {/* Панель управления */}
        <Paper 
          shadow="lg" 
          radius="xl" 
          p="xl"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                type="datetime-local"
                label="Дата и время обновления"
                placeholder="Выберите дату"
                value={dateFrom ? dayjs(dateFrom).format('YYYY-MM-DDTHH:mm') : ''}
                onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
                leftSection={<IconCalendar size={16} />}
                radius="md"
              />
            </Grid.Col>
            
            {shouldShowBrandFilter && (
              <Grid.Col span={{ base: 12, md: 4 }}>
                <MultiSelect
                  label="Фильтр по бренду"
                  placeholder="Выберите бренды"
                  data={brandOptions}
                  value={brand}
                  onChange={setBrand}
                  leftSection={<IconTag size={16} />}
                  clearable
                  searchable
                  nothingFoundMessage="Ничего не найдено"
                  radius="md"
                />
              </Grid.Col>
            )}
            
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Button 
                onClick={fetchPreview} 
                loading={loading}
                leftSection={<IconRefresh size={16} />}
                fullWidth
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan' }}
                radius="md"
                size="md"
              >
                Сформировать список
              </Button>
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Список для печати */}
        {previewData && (
          <Paper 
            shadow="lg" 
            radius="xl" 
            p="xl"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03))',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Stack gap="lg">
              <Group justify="space-between" align="center">
                <Group gap="md">
                  <ThemeIcon size={40} radius="xl" variant="gradient" gradient={{ from: 'green', to: 'teal' }}>
                    <IconCheck size={20} />
                  </ThemeIcon>
                  <div>
                    <Title order={3} c="var(--theme-text-primary)">Список на печать</Title>
                    <Text c="dimmed">Настроить параметры печати для каждого товара</Text>
                  </div>
                </Group>
                
                <Badge 
                  size="lg" 
                  variant="gradient" 
                  gradient={{ from: 'green', to: 'teal' }}
                  radius="xl"
                >
                  {filteredItems.length} ценников
                </Badge>
              </Group>

              <ScrollArea h={600} type="scroll">
                <Stack gap="md">
                  {filteredItems.map((item, index) => (
                    <PrintItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      total={filteredItems.length}
                      onRemove={handleRemoveItem}
                      onSizeChange={handleSizeChange}
                    />
                  ))}
                  
                  {filteredItems.length === 0 && (
                    <Paper
                      p="xl"
                      radius="md"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <Stack align="center" gap="md">
                        <ThemeIcon size={60} radius="xl" variant="gradient" gradient={{ from: 'gray', to: 'dark' }}>
                          <IconPrinter size={30} />
                        </ThemeIcon>
                        <Text size="lg" c="dimmed" ta="center">
                          Нет товаров для печати
                        </Text>
                        <Text size="sm" c="dimmed" ta="center">
                          Измените фильтры или дату для поиска товаров
                        </Text>
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </ScrollArea>

              <Button
                onClick={handlePrint}
                loading={loading}
                leftSection={<IconPrinter size={20} />}
                fullWidth
                size="lg"
                variant="gradient"
                gradient={{ from: 'green', to: 'teal' }}
                radius="xl"
                mt="md"
              >
                Начать печать
              </Button>
            </Stack>
          </Paper>
        )}

        <LoadingOverlay visible={loading} />
      </Stack>
    </Box>
  );
};

export default PriceTagPrinting;