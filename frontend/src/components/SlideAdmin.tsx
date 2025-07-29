import { useState, useEffect } from 'react';
import {
  Title,
  Tabs,
  Card,
  Image,
  Group,
  Button,
  Modal,
  Text,
  TextInput,
  Select,
  FileInput,
  Alert,
  useMantineTheme,
  Switch,
  NumberInput,
  LoadingOverlay,
  ActionIcon,
  rem,
} from '@mantine/core';
import {
  IconPhoto,
  IconSettings,
  IconArchive,
  IconPlus,
  IconArrowsSort,
  IconAlertCircle,
  IconTrash,
  IconEdit,
  IconSortAscending,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { API } from '../config/constants';

interface Slider {
  id: string;
  name: string;
  category: string;
  visible: boolean;
  timeVisible: number;
  startDate: string;
  endDate: string;
  url: string;
  add: boolean;
  sale: boolean;
  order: number;
  attachment: string;
  addedById: string;
  updatedById?: string;
}

export function SlideAdmin() {
  const theme = useMantineTheme();
  const [activeTab, setActiveTab] = useState<string | null>('notebooks');
  const [sortMode, setSortMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slides, setSlides] = useState<Slider[]>([]);
  const [openedAddSlide, { open: openAddSlide, close: closeAddSlide }] = useDisclosure(false);
  const [openedEditSlide, { open: openEditSlide, close: closeEditSlide }] = useDisclosure(false);
  const [openedOrderChanged, { open: openOrderChanged, close: closeOrderChanged }] = useDisclosure(false);
  const [currentSlide, setCurrentSlide] = useState<Slider | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      category: '',
      visible: false,
      timeVisible: 0,
      startDate: new Date(),
      endDate: new Date(),
      url: 'https://dns-shop.ru/',
      add: false,
      sale: false,
      order: 1,
      addedById: '1'
    },
    validate: {
      name: (value) => (value ? null : 'Название обязательно'),
      category: (value) => (value ? null : 'Категория обязательна'),
      timeVisible: (value) => (value >= 0 ? null : 'Время должно быть положительным'),
    },
  });

  const categories = [
    { value: 'notebooks', label: 'Ноутбуки' },
    { value: 'tv', label: 'ТВ' },
    { value: 'smartphones', label: 'Смартфоны' },
    { value: 'mbt', label: 'МБТ' },
    { value: 'kbt', label: 'КБТ' },
    { value: 'tablets', label: 'Часы' },
    { value: 'kassa', label: 'Касса' },
    { value: 'season', label: 'Сезонные акции' },
    { value: 'allvertical', label: 'Вертикальная реклама' },
    { value: 'other', label: 'Общая реклама' },
    { value: 'archive', label: 'Архив' },
  ];

  const fetchSlides = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/add/sliders/`);
      setSlides(response.data);
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось загрузить слайды',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlides();
  }, []);

  const handleAddSlide = async () => {
    try {
      const formData = new FormData();
      formData.append('name', form.values.name);
      formData.append('category', form.values.category);
      formData.append('visible', String(form.values.visible));
      formData.append('timeVisible', String(form.values.timeVisible));
      formData.append('startDate', form.values.startDate.toISOString());
      formData.append('endDate', form.values.endDate.toISOString());
      formData.append('url', form.values.url);
      formData.append('add', String(form.values.add));
      formData.append('sale', String(form.values.sale));
      formData.append('order', String(form.values.order));
      formData.append('addedById', form.values.addedById);
      if (selectedFile) {
        formData.append('attachment', selectedFile);
      }
      await axios.post(`${API}/add/sliders/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      notifications.show({
        title: 'Успех',
        message: 'Слайд успешно добавлен',
        color: 'green',
      });
      closeAddSlide();
      form.reset();
      setSelectedFile(null);
      fetchSlides();
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось добавить слайд',
        color: 'red',
      });
    }
  };

  const handleEditSlide = async () => {
    if (!currentSlide) return;
    try {
      const formData = new FormData();
      formData.append('name', form.values.name);
      formData.append('category', form.values.category);
      formData.append('visible', String(form.values.visible));
      formData.append('timeVisible', String(form.values.timeVisible));
      formData.append('startDate', form.values.startDate.toISOString());
      formData.append('endDate', form.values.endDate.toISOString());
      formData.append('url', form.values.url);
      formData.append('add', String(form.values.add));
      formData.append('sale', String(form.values.sale));
      formData.append('order', String(form.values.order));
      formData.append('updatedById', form.values.addedById);
      if (selectedFile) {
        formData.append('attachment', selectedFile);
      }
      await axios.put(`${API}/add/sliders/${currentSlide.id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      notifications.show({
        title: 'Успех',
        message: 'Слайд успешно обновлен',
        color: 'green',
      });
      closeEditSlide();
      form.reset();
      setSelectedFile(null);
      fetchSlides();
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось обновить слайд',
        color: 'red',
      });
    }
  };

  const handleDeleteSlide = async (id: string) => {
    try {
      await axios.delete(`${API}/add/sliders/${id}`);
      notifications.show({
        title: 'Успех',
        message: 'Слайд успешно удален',
        color: 'green',
      });
      fetchSlides();
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось удалить слайд',
        color: 'red',
      });
    }
  };

  const handleUpdateOrder = async () => {
    try {
      await axios.put(`${API}/add/sliders/order`, { slides });
      openOrderChanged();
      setSortMode(false);
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось обновить порядок',
        color: 'red',
      });
    }
  };

  const openEditModal = (slide: Slider) => {
    setCurrentSlide(slide);
    form.setValues({
      name: slide.name,
      category: slide.category,
      visible: slide.visible,
      timeVisible: slide.timeVisible,
      startDate: new Date(slide.startDate),
      endDate: new Date(slide.endDate),
      url: slide.url,
      add: slide.add,
      sale: slide.sale,
      order: slide.order,
      addedById: slide.addedById,
    });
    openEditSlide();
  };

  const toggleSortMode = () => {
    setSortMode(!sortMode);
    if (sortMode) {
      handleUpdateOrder();
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: theme.colors.dark[8], minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Title order={3} style={{ color: 'white' }}>Digital Poster System v1.3.5</Title>
        <img
          src="http://siberia.partner.ru/site/sos/img/DNS_LOGO_WHITE.png"
          alt="DNS Logo"
          style={{ height: '40px' }}
        />
      </div>
      <div style={{ display: 'flex', marginBottom: '20px', gap: '20px' }}>
        <div style={{ width: '300px', padding: '20px', backgroundColor: theme.colors.dark[7], borderRadius: '8px' }}>
          <Button
            fullWidth
            leftSection={<IconPlus size={18} />}
            onClick={openAddSlide}
            variant="light"
            style={{ marginBottom: '10px' }}
            color="violet"
          >
            Добавить слайд
          </Button>
          <Button
            fullWidth
            leftSection={<IconSortAscending size={18} />}
            variant="light"
            onClick={toggleSortMode}
            color={sortMode ? 'orange' : 'blue'}
            style={{ marginBottom: '10px' }}
          >
            {sortMode ? 'Сохранить порядок' : 'Сортировать'}
          </Button>
          <Button
            fullWidth
            variant="light"
            color="gray"
            component="a"
            href="http://siberia.partner.ru/site/sos/"
            target="_blank"
            style={{ marginBottom: '10px' }}
          >
            Перейти к слайдеру
          </Button>
          <Button fullWidth color="red" variant="outline">
            Выйти
          </Button>
        </div>
        <div style={{ flex: 1, backgroundColor: theme.colors.dark[7], padding: '20px', borderRadius: '8px', position: 'relative' }}>
          <LoadingOverlay visible={loading} overlayProps={{ blur: 2 }} />
          <Tabs value={activeTab} onChange={setActiveTab} style={{ display: 'flex', flexDirection: 'column' }}>
            <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {categories.map((category) => (
                <Tabs.Tab
                  key={category.value}
                  value={category.value}
                  style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}
                  leftSection={
                    category.value === 'archive' ? <IconArchive size={rem(14)} /> :
                    category.value === 'settings' ? <IconSettings size={rem(14)} /> :
                    <IconPhoto size={rem(14)} />
                  }
                >
                  {category.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {categories.map((category) => (
              <Tabs.Panel value={category.value} pt="xs" key={category.value}>
                {category.value === 'archive' && (
                  <Alert icon={<IconAlertCircle size="1rem" />} title="Внимание" color="yellow" mb="md">
                    Слайды в данном разделе хранятся 2 суток от даты окончания акции!
                  </Alert>
                )}
                <Group>
                  {slides
                    .filter(slide => slide.category === category.value)
                    .map(slide => (
                      <Card
                        key={slide.id}
                        shadow="sm"
                        padding="lg"
                        radius="md"
                        withBorder
                        style={{ width: 300, margin: '10px' }}
                      >
                        <Card.Section>
                          <Image
                            src={`/uploads/sliders/${slide.attachment}`}
                            height={160}
                            alt={slide.name}
                            fallbackSrc="https://placehold.co/600x400?text=No+Image"
                          />
                        </Card.Section>
                        <Group justify="space-between" mt="md" mb="xs">
                          <Text fw={500}>{slide.name}</Text>
                          <Group gap={4}>
                            <ActionIcon variant="subtle" color="blue" onClick={() => openEditModal(slide)}>
                              <IconEdit size={16} />
                            </ActionIcon>
                            <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteSlide(slide.id)}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {new Date(slide.startDate).toLocaleDateString()} - {new Date(slide.endDate).toLocaleDateString()}
                        </Text>
                        <Group mt="xs">
                          <Switch
                            label="Видимый"
                            checked={slide.visible}
                            readOnly
                          />
                          <Switch
                            label="Акция"
                            checked={slide.sale}
                            readOnly
                          />
                        </Group>
                        {sortMode && (
                          <Button
                            variant="light"
                            color="blue"
                            fullWidth
                            mt="md"
                            radius="md"
                            leftSection={<IconArrowsSort size={rem(14)} />}
                          >
                            Переместить
                          </Button>
                        )}
                      </Card>
                    ))}
                </Group>
              </Tabs.Panel>
            ))}
          </Tabs>
        </div>
      </div>

      {/* Add Slide Modal */}
      <Modal
        opened={openedAddSlide}
        onClose={() => {
          closeAddSlide();
          form.reset();
          setSelectedFile(null);
        }}
        title="Добавить новый слайд"
        size="xl"
      >
        <form onSubmit={form.onSubmit(handleAddSlide)}>
          <TextInput
            label="Название слайда"
            placeholder="Введите название"
            required
            mb="sm"
            {...form.getInputProps('name')}
          />
          <Select
            label="Категория"
            placeholder="Выберите категорию"
            data={categories}
            required
            mb="sm"
            {...form.getInputProps('category')}
          />
          <FileInput
            label="Изображение"
            placeholder="Выберите файл"
            accept="image/png,image/jpeg"
            required
            mb="sm"
            onChange={setSelectedFile}
          />
          <NumberInput
            label="Время показа (сек)"
            min={0}
            mb="sm"
            {...form.getInputProps('timeVisible')}
          />
          <div style={{ marginBottom: '1rem' }}>
            <label>Дата начала</label>
            <DatePicker
              selected={form.values.startDate}
              onChange={(date: Date) => date && form.setFieldValue('startDate', date)}
              dateFormat="yyyy/MM/dd"
              className="form-control"
              placeholderText="Выберите дату начала"
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Дата окончания</label>
            <DatePicker
              selected={form.values.endDate}
              onChange={(date: Date) => date && form.setFieldValue('endDate', date)}
              dateFormat="yyyy/MM/dd"
              className="form-control"
              placeholderText="Выберите дату окончания"
              required
            />
          </div>
          <TextInput
            label="URL ссылки"
            placeholder="https://dns-shop.ru/"
            mb="sm"
            {...form.getInputProps('url')}
          />
          <Switch
            label="Видимый"
            mb="sm"
            {...form.getInputProps('visible', { type: 'checkbox' })}
          />
          <Switch
            label="Акция"
            mb="sm"
            {...form.getInputProps('sale', { type: 'checkbox' })}
          />
          <Switch
            label="Добавить в архив"
            mb="sm"
            {...form.getInputProps('add', { type: 'checkbox' })}
          />
          <NumberInput
            label="Порядок"
            min={1}
            mb="sm"
            {...form.getInputProps('order')}
          />
          <Group justify="right" mt="md">
            <Button variant="default" onClick={() => {
              closeAddSlide();
              form.reset();
              setSelectedFile(null);
            }}>
              Отмена
            </Button>
            <Button color="blue" type="submit">
              Сохранить
            </Button>
          </Group>
        </form>
      </Modal>

      {/* Edit Slide Modal */}
      <Modal
        opened={openedEditSlide}
        onClose={() => {
          closeEditSlide();
          form.reset();
          setSelectedFile(null);
        }}
        title="Редактировать слайд"
        size="xl"
      >
        <form onSubmit={form.onSubmit(handleEditSlide)}>
          <TextInput
            label="Название слайда"
            placeholder="Введите название"
            required
            mb="sm"
            {...form.getInputProps('name')}
          />
          <Select
            label="Категория"
            placeholder="Выберите категорию"
            data={categories}
            required
            mb="sm"
            {...form.getInputProps('category')}
          />
          <FileInput
            label="Изображение"
            placeholder="Выберите файл"
            accept="image/png,image/jpeg"
            mb="sm"
            onChange={setSelectedFile}
            description="Оставьте пустым, чтобы сохранить текущее изображение"
          />
          {currentSlide?.attachment && !selectedFile && (
            <Image
              src={`/uploads/sliders/${currentSlide.attachment}`}
              height={120}
              width="auto"
              fit="contain"
              mb="sm"
            />
          )}
          <NumberInput
            label="Время показа (сек)"
            min={0}
            mb="sm"
            {...form.getInputProps('timeVisible')}
          />
          <div style={{ marginBottom: '1rem' }}>
            <label>Дата начала</label>
            <DatePicker
              selected={form.values.startDate}
              onChange={(date: Date) => date && form.setFieldValue('startDate', date)}
              dateFormat="yyyy/MM/dd"
              className="form-control"
              placeholderText="Выберите дату начала"
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Дата окончания</label>
            <DatePicker
              selected={form.values.endDate}
              onChange={(date: Date) => date && form.setFieldValue('endDate', date)}
              dateFormat="yyyy/MM/dd"
              className="form-control"
              placeholderText="Выберите дату окончания"
              required
            />
          </div>
          <TextInput
            label="URL ссылки"
            placeholder="https://dns-shop.ru/"
            mb="sm"
            {...form.getInputProps('url')}
          />
          <Switch
            label="Видимый"
            mb="sm"
            {...form.getInputProps('visible', { type: 'checkbox' })}
          />
          <Switch
            label="Акция"
            mb="sm"
            {...form.getInputProps('sale', { type: 'checkbox' })}
          />
          <Switch
            label="Добавить в архив"
            mb="sm"
            {...form.getInputProps('add', { type: 'checkbox' })}
          />
          <NumberInput
            label="Порядок"
            min={1}
            mb="sm"
            {...form.getInputProps('order')}
          />
          <Group justify="right" mt="md">
            <Button variant="default" onClick={() => {
              closeEditSlide();
              form.reset();
              setSelectedFile(null);
            }}>
              Отмена
            </Button>
            <Button color="blue" type="submit">
              Сохранить
            </Button>
          </Group>
        </form>
      </Modal>

      {/* Order Changed Modal */}
      <Modal
        opened={openedOrderChanged}
        onClose={closeOrderChanged}
        title="Порядок обновлен"
        size="md"
      >
        <Text>Порядок слайдов успешно обновлен!</Text>
        <Group justify="right" mt="md">
          <Button color="blue" onClick={closeOrderChanged}>
            OK
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
