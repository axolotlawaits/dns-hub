import { useState, useEffect } from 'react';
import { Title, Tabs, Card, Image, Group, Button, Modal, Text, TextInput, Select, FileInput, Alert, LoadingOverlay, ActionIcon, rem, NumberInput, Switch } from '@mantine/core';
import { IconArchive, IconPlus, IconArrowsSort, IconAlertCircle, IconTrash, IconEdit, IconSortAscending, IconDeviceLaptop, IconDeviceMobile, IconDeviceTv, IconBlender, IconFridge, IconDeviceIpad, IconCashRegister, IconClockHour7, IconClearAll, IconViewportTall, IconLink } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { API } from '../config/constants';
import { useUserContext } from '../hooks/useUserContext';

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
  const [activeTab, setActiveTab] = useState<string | null>('notebooks');
  const [sortMode, setSortMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useUserContext(); 
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
      sale: false,
      addedById: user?.id || ''
    },
    validate: {
      name: (value) => (value ? null : 'Название обязательно'),
      category: (value) => (value ? null : 'Категория обязательна'),
      timeVisible: (value) => (value >= 0 ? null : 'Время должно быть положительным'),
    },
  });

  const categories = [
    { value: 'notebooks', label: 'Ноутбуки', icon: <IconDeviceLaptop size={34} /> },
    { value: 'tv', label: 'ТВ', icon: <IconDeviceTv size={34}  /> },
    { value: 'smartphones', label: 'Смартфоны', icon: <IconDeviceMobile size={34} /> },
    { value: 'mbt', label: 'МБТ', icon: <IconBlender size={34} /> },
    { value: 'kbt', label: 'КБТ', icon: <IconFridge size={34} /> },
    { value: 'tablets', label: 'Часы', icon: <IconDeviceIpad size={34} /> },
    { value: 'kassa', label: 'Касса', icon: <IconCashRegister size={34} /> },
    { value: 'season', label: 'Сезонные акции', icon: <IconClockHour7 size={34} /> },
    { value: 'allvertical', label: 'Вертикальная реклама', icon: <IconViewportTall size={34}  /> },
    { value: 'other', label: 'Общая реклама', icon: <IconClearAll size={34} /> },
    { value: 'archive', label: 'Архив', icon: <IconArchive size={34} /> },
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
      if (!user?.id) {
        notifications.show({
          title: 'Ошибка',
          message: 'Пользователь не авторизован',
          color: 'red',
        });
        return;
      }

      const formData = new FormData();
      formData.append('name', form.values.name);
      formData.append('category', form.values.category);
      formData.append('visible', String(form.values.visible));
      formData.append('timeVisible', String(form.values.timeVisible));
      formData.append('startDate', form.values.startDate.toISOString());
      formData.append('endDate', form.values.endDate.toISOString());
      formData.append('url', form.values.url);
      formData.append('sale', String(form.values.sale));
      formData.append('addedById', user.id);
      
      if (selectedFile) {
        formData.append('attachment', selectedFile);
      }

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
      if (axios.isAxiosError(error)) {
        console.error('Error response:', error.response?.data);
        notifications.show({
          title: 'Ошибка',
          message: error.response?.data?.message || 'Не удалось добавить слайд',
          color: 'red',
        });
      } else {
        console.error('Error:', error);
        notifications.show({
          title: 'Ошибка',
          message: 'Не удалось добавить слайд',
          color: 'red',
        });
      }
    }
  };

  const handleEditSlide = async () => {
    if (!currentSlide || !user?.id) return;
    try {
      const formData = new FormData();
      formData.append('name', form.values.name);
      formData.append('category', form.values.category);
      formData.append('visible', String(form.values.visible));
      formData.append('timeVisible', String(form.values.timeVisible));
      formData.append('startDate', form.values.startDate.toISOString());
      formData.append('endDate', form.values.endDate.toISOString());
      formData.append('url', form.values.url);
      formData.append('sale', String(form.values.sale));
      formData.append('updatedById', user.id);
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
      sale: slide.sale,
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
    <div style={{ padding: '20px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
         <Title order={2} mt="md" mb="lg">
           Слайдер: Админ панель
         </Title>
      </div>
      <div style={{ display: 'flex', marginBottom: '20px', gap: '20px' }}>
        <div style={{ width: '300px', padding: '20px', borderRadius: '8px' }}>
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
        </div>
        <div style={{ flex: 1, padding: '20px', borderRadius: '8px', position: 'relative' }}>
          <LoadingOverlay visible={loading} overlayProps={{ blur: 2 }} />
          <Tabs value={activeTab} onChange={setActiveTab} style={{ display: 'flex', flexDirection: 'column' }}>
            <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {categories.map((category) => (
                <Tabs.Tab
                  key={category.value}
                  value={category.value}
                  style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}
                  leftSection={category.icon}>
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
                            src={`${API}/public/add/slider/${slide.attachment}`}
                            height={160}
                            alt={slide.name}
                            fallbackSrc="https://placehold.co/600x400?text=No+Image"
                          />
                        </Card.Section>
                        <Group justify="space-between" mt="md" mb="xs">
                          <Text fw={500}>{slide.name}</Text>
                          <Group gap={4}>
                            <ActionIcon 
                              variant="subtle" 
                              color="blue" 
                              component="a" 
                              href={slide.url} 
                              target="_blank"
                            >
                              <IconLink size={16} />
                            </ActionIcon>
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
              onChange={(date: Date | null) => {
                if (date) {
                  form.setFieldValue('startDate', date);
                }
              }}
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
              onChange={(date: Date | null) => {
                if (date) {
                  form.setFieldValue('endDate', date);
                }
              }}
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
            label="Платная реклама"
            mb="sm"
            {...form.getInputProps('sale', { type: 'checkbox' })}
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
              src={`${API}/public/add/slider/${currentSlide.attachment}`}
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
              onChange={(date: Date | null) => {
                if (date) {
                  form.setFieldValue('startDate', date);
                }
              }}
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
              onChange={(date: Date | null) => {
                if (date) {
                  form.setFieldValue('endDate', date);
                }
              }}
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
            label="Акция"
            mb="sm"
            {...form.getInputProps('sale', { type: 'checkbox' })}
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