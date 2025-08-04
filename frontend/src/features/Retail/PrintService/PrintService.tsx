import { useState, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { Button, Title, Box, LoadingOverlay, Group, Select, Modal, TextInput, PasswordInput, Text, ActionIcon, Divider, Badge, Flex, Card, Stack, MultiSelect, Alert } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notificationSystem } from '../../../utils/Push';
import { formatPrice } from '../../../utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { IconTrash } from '@tabler/icons-react';

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
  { value: 'Standart', label: 'Стандартный ценник', numericFormat: 1 },
];

const PriceTagPrinting = () => {
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

  const getUniqueOptions = useCallback((items: PreviewItem[], key: keyof PreviewItem) => {
    const uniqueValues = [...new Set(items.map(item => item[key]))];
    return uniqueValues.map(value => ({ value: String(value), label: String(value) }));
  }, []);

  const handleAuth = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/retail/print-service/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка авторизации');
      }

      const data = await response.json();
      if (data.tokens?.auth && data.tokens?.tokenAuth) {
        setAuthTokens(data.tokens);
        closeModal();
        setErrorMessage(null);
        showNotification('success', 'Авторизация успешна');
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

        if (!response.ok) throw new Error(`Ошибка печати для размера ${size}`);

        const blob = await response.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      }

      showNotification('success', 'Печать успешно выполнена');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ошибка при печати';
      console.error('Print error:', errorMsg);
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, authTokens, previewData, brand, showNotification]);

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
      <Box p="md">
        <Title order={2} mb="xl">Печать ценников</Title>
        <Button onClick={openModal}>Авторизация (WEB База)</Button>

        <Modal opened={modalOpened} onClose={closeModal} title="Авторизация (WEB База)">
          <TextInput
            label="Логин"
            value={loginData.login}
            onChange={(e) => setLoginData(prev => ({...prev, login: e.target.value}))}
            mb="sm"
          />
          <PasswordInput
            label="Пароль"
            value={loginData.password}
            onChange={(e) => setLoginData(prev => ({...prev, password: e.target.value}))}
            mb="md"
          />
          {errorMessage && <Text color="red" mb="md">{errorMessage}</Text>}
          <Button onClick={handleAuth} loading={loading}>Войти</Button>
        </Modal>
      </Box>
    );
  }

  return (
    <Box p="md">
        <Alert variant="light" color="red" title="Предупреждение" icon='❌'>
          Если печать не выводиться вся или частично, проверьте включены ли всплывающие окна!
          (Кнопка в адресной строке)
        </Alert>
      <Title order={2} mb="xl">Печать ценников</Title>
      <Group align="flex-end" mb="xl">
        <TextInput
          type="datetime-local"
          label="Дата и время обновления"
          value={dateFrom ? dayjs(dateFrom).format('YYYY-MM-DDTHH:mm') : ''}
          onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
        />
        {shouldShowBrandFilter && (
          <MultiSelect
            label="Бренд"
            data={brandOptions}
            value={brand}
            onChange={setBrand}
            clearable
            placeholder="Бренд"
            searchable
            nothingFoundMessage="Ничего не найдено"
          />
        )}
        <Button onClick={fetchPreview} loading={loading}>Сформировать</Button>
      </Group>
      {previewData && (
        <Box mb="xl">
          <Title order={4} mb="md">Список на печать</Title>
          <Card withBorder shadow="sm" radius="md" p={0}>
            <Flex justify="space-between" align="center" p="md">
              <Text fw={500}>Будет напечатано: {filteredItems.length} ценников</Text>
            </Flex>
            <Divider />
            <Box style={{ width: '100%', maxHeight: 800, overflowY: 'auto' }}>
              {filteredItems.map((item, index) => (
                <Box key={item.id} px="md" py="sm">
                  <Flex gap="md" align="center" style={{ width: '100%' }}>
                    <ActionIcon
                      onClick={() => handleRemoveItem(item.id)}
                      color="red"
                      variant="light"
                      size="md"
                      title="Удалить"
                    >
                      <IconTrash size="1rem" />
                    </ActionIcon>
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Flex gap="md" align="center">
                        <Badge variant="outline">{item.tovarCode}</Badge>
                        <Text fw={500}>{item.tovarName}</Text>
                      </Flex>
                      <Flex gap="xl" wrap="wrap" align="center">
                        <Text>Цена: {formatPrice(item.price)}</Text>
                        <Text>Обновлено: {dayjs(item.updatedAt).format('DD.MM.YYYY HH:mm')}</Text>
                        <Select
                          data={TEMPLATES}
                          value={item.size}
                          onChange={(value) => handleSizeChange(item.id, value)}
                          size="sm"
                          style={{ minWidth: 250 }}
                        />
                      </Flex>
                    </Stack>
                  </Flex>
                  {index < filteredItems.length - 1 && <Divider my="sm" />}
                </Box>
              ))}
            </Box>
          </Card>
          <Button
            onClick={handlePrint}
            loading={loading}
            mt="md"
            color="green"
            fullWidth
            size="md"
          >
            Печать
          </Button>
        </Box>
      )}
      <LoadingOverlay visible={loading} />
    </Box>
  );
};

export default PriceTagPrinting;