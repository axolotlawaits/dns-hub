import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Paper,
  Text,
  Button,
  Group,
  Stack,
  Card,
  SimpleGrid,
  Badge,
  Image,
  TextInput,
  Select,
  Tabs,
  Modal,
  ActionIcon,
  Pagination,
  Box,
  LoadingOverlay,
  Avatar,
  Divider,
  Title,
  Grid,
  Checkbox,
  NumberInput,
} from '@mantine/core';
import {
  IconSearch,
  IconPlus,
  IconPhoto,
  IconMapPin,
  IconEye,
  IconFilter,
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
} from '@tabler/icons-react';
import { Carousel } from '@mantine/carousel';
import { CustomModal } from '../../../utils/CustomModal';
import { DynamicFormModal, FormField } from '../../../utils/formModal';
import Comment from '../../../utils/Comment';
import { useUserContext } from '../../../hooks/useUserContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import useAuthFetch from '../../../hooks/useAuthFetch';
import './Shop.css';

interface ShopCategory {
  id: string;
  name: string;
  colorHex?: string;
  parent_type?: string | null;
  children?: ShopCategory[];
  _count?: { shops: number };
}

interface ShopImage {
  id: string;
  source: string;
  isMain: boolean;
  sortOrder: number;
}


interface Branch {
  uuid: string;
  name: string;
  code: string;
  city: string;
  rrs: string;
}

interface Shop {
  id: string;
  title: string;
  description?: string;
  status: 'ACTIVE' | 'SOLD' | 'ARCHIVED' | 'MODERATION';
  categoryId: string;
  category: ShopCategory;
  branchId: string;
  branch: Branch;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  // Поля товара (объявление = товар)
  quantity: number;
  article?: string;
  condition: 'NEW' | 'EXCELLENT' | 'GOOD' | 'SATISFACTORY' | 'POOR';
  views: number;
  isPromoted: boolean;
  createdAt: string;
  publishedAt?: string;
  attachments: ShopImage[]; // Переименовано из images
  reservedQuantity?: number;
  availableQuantity?: number;
  reserves?: Array<{
    id: string;
    quantity: number;
    status: string;
    shipmentDocNumber?: string | null;
    createdAt: string;
    requester: {
      id: string;
      name: string;
      email?: string;
    };
  }>;
}

function Shop() {
  const { user } = useUserContext();
  const { setHeader, clearHeader } = usePageHeader();
  const authFetch = useAuthFetch();
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [fileAttachments, setFileAttachments] = useState<Record<string, File[]>>({});
  const [reserveModalOpened, setReserveModalOpened] = useState(false);
  const [reserveQuantity, setReserveQuantity] = useState(1);
  const [shipmentNumbers, setShipmentNumbers] = useState<Record<string, string>>({});
  
  // Фильтры
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>('ACTIVE');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCategories = async () => {
    try {
      const { getTypes } = await import('../../../utils/typesData');
      const { getToolByLink } = await import('../../../utils/toolUtils');
      
      // Получаем tool для shop чтобы получить model_uuid
      const shopTool = await getToolByLink('retail/shop');
      if (shopTool) {
        const categories = await getTypes('Категория', shopTool.id, undefined, true); // tree=true для иерархии
        setCategories(categories || []);
        if (process.env.NODE_ENV === 'development') {
          console.log('[Shop] Categories loaded:', categories?.length || 0);
        }
      }
    } catch (error) {
      console.error('[Shop] Error fetching categories:', error);
      setCategories([]);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await authFetch(`${API}/retail/shop/branches`);
      
      // Если response === null, значит произошел logout из-за истекшего refresh token
      if (response === null) {
        console.warn('[Shop] Failed to fetch branches: user logged out');
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setBranches(data || []);
        if (process.env.NODE_ENV === 'development') {
          console.log('[Shop] Branches loaded:', data?.length || 0);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Shop] Error fetching branches:', response.status, errorData);
        setBranches([]);
      }
    } catch (error) {
      console.error('[Shop] Error fetching branches:', error);
      setBranches([]);
    }
  };

  const fetchShops = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter) params.append('categoryId', categoryFilter);
      if (branchFilter) params.append('branchId', branchFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('page', String(page));
      params.append('limit', '20');

      const response = await authFetch(`${API}/retail/shop?${params}`);
      if (response?.ok) {
        const data = await response.json();
        setShops(data.shops || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      } else {
        setShops([]);
        setTotalPages(1);
        setTotal(0);
      }
    } catch (error) {
      console.error('Error fetching shops:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось загрузить объявления', 'error');
      setShops([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Функция избранного удалена

  useEffect(() => {
    fetchCategories();
    fetchBranches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Перезагружаем категории и филиалы при открытии модалки создания/редактирования
  useEffect(() => {
    if (createModalOpened || editModalOpened) {
      // Всегда перезагружаем данные при открытии модалки, чтобы убедиться, что они актуальны
      fetchCategories();
      fetchBranches();
    }
  }, [createModalOpened, editModalOpened]);

  useEffect(() => {
    if (activeTab === 'all' || activeTab === 'my') {
      fetchShops();
    // Вкладка избранного удалена
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, categoryFilter, branchFilter, statusFilter, page]);

  useEffect(() => {
    setHeader({
      title: 'Доска объявлений',
      subtitle: 'Покупка и продажа товаров',
      icon: <Text size="xl" fw={700} c="white">📢</Text>,
      actionButton: {
        text: 'Создать объявление',
        onClick: () => setCreateModalOpened(true),
        icon: <IconPlus size={18} />,
      },
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  // Функция избранного удалена

  const handleViewShop = async (shop: Shop) => {
    try {
      const response = await authFetch(`${API}/retail/shop/${shop.id}`);
      if (response?.ok) {
        const data = await response.json();
        setSelectedShop(data);
        setCurrentImageIndex(0);
        setModalOpened(true);
      }
    } catch (error) {
      console.error('Error fetching shop:', error);
    }
  };

  // Функции для работы с комментариями через универсальный компонент
  const fetchShopComments = async (shopId: string, page: number = 1, limit: number = 20) => {
    const response = await authFetch(`${API}/comments?entityType=SHOP&entityId=${shopId}&page=${page}&limit=${limit}`);
    if (response?.ok) {
      const data = await response.json();
      // Нормализуем комментарии: конвертируем message в content
      const normalizedComments = (data.comments || data.pagination?.comments || []).map((comment: any) => ({
        ...comment,
        content: comment.content || comment.message || comment.text || '',
      }));
      return {
        comments: normalizedComments,
        total: data.pagination?.total || data.total || normalizedComments.length,
        page: data.pagination?.page || page,
        totalPages: data.pagination?.totalPages || Math.ceil((data.pagination?.total || normalizedComments.length) / limit),
      };
    }
    return { comments: [], total: 0, page: 1, totalPages: 0 };
  };

  const createShopComment = async (shopId: string, content: string, parentId?: string | null) => {
    const response = await authFetch(`${API}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'SHOP',
        entityId: shopId,
        message: content.trim(),
        parentId: parentId || null,
      }),
    });
    
    if (response === null || !response.ok) {
      throw new Error('Не удалось создать комментарий');
    }
    
    const comment = await response.json();
    // Нормализуем комментарий: конвертируем message в content
    return {
      ...comment,
      content: comment.content || comment.message || comment.text || '',
    };
  };


  const categoryOptions = useMemo(() => {
    const flatten = (cats: ShopCategory[]): { value: string; label: string }[] => {
      const result: { value: string; label: string }[] = [];
      cats.forEach(cat => {
        result.push({ value: cat.id, label: cat.name });
        if (cat.children) {
          result.push(...flatten(cat.children));
        }
      });
      return result;
    };
    return flatten(categories);
  }, [categories]);

  const branchOptions = useMemo(() => {
    return branches.map(b => ({
      value: b.uuid,
      label: `${b.name} (${b.code}) - ${b.city}`,
    }));
  }, [branches]);

  // Мемоизируем поля формы, чтобы они обновлялись при загрузке категорий и филиалов
  const formFields = useMemo((): FormField[] => [
    {
      name: 'title',
      label: 'Заголовок',
      type: 'text',
      required: true,
      placeholder: 'Название объявления',
    },
    {
      name: 'description',
      label: 'Описание',
      type: 'textarea',
      placeholder: 'Описание объявления (необязательно)',
    },
    {
      name: 'categoryId',
      label: 'Категория',
      type: 'select',
      required: true,
      options: categoryOptions.length > 0 ? categoryOptions : [{ value: '', label: 'Загрузка...' }],
      disabled: categoryOptions.length === 0,
      groupWith: ['branchId'],
      groupSize: 2,
    },
    {
      name: 'branchId',
      label: 'Филиал',
      type: 'select',
      required: true,
      options: branchOptions.length > 0 ? branchOptions : [{ value: '', label: 'Загрузка...' }],
      disabled: branchOptions.length === 0,
      searchable: true,
      groupWith: ['categoryId'],
      groupSize: 2,
    },
    {
      name: 'quantity',
      label: 'Количество',
      type: 'number',
      required: true,
      min: 1,
      placeholder: '1',
    },
    {
      name: 'article',
      label: 'Артикул',
      type: 'text',
      placeholder: 'Артикул товара (необязательно)',
    },
    {
      name: 'condition',
      label: 'Состояние',
      type: 'select',
      options: [
        { value: 'NEW', label: 'Новое' },
        { value: 'EXCELLENT', label: 'Отличное' },
        { value: 'GOOD', label: 'Хорошее' },
        { value: 'SATISFACTORY', label: 'Удовлетворительное' },
        { value: 'POOR', label: 'Плохое' },
      ],
    },
    {
      name: 'photos',
      label: 'Фотографии товара',
      type: 'file',
      accept: 'image/*',
      withDnd: true,
      multiple: true,
    },
  ], [categoryOptions, branchOptions]);
  
  // Находим филиал пользователя по умолчанию
  const userBranchId = useMemo(() => {
    if (!user?.branch || branches.length === 0) return '';
    // Проверяем, является ли user.branch UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(user.branch)) {
      // Если это UUID, ищем филиал по UUID
      const branch = branches.find(b => b.uuid === user.branch);
      return branch?.uuid || '';
    } else {
      // Если это имя, ищем филиал по имени
      const branch = branches.find(b => b.name === user.branch || b.code === user.branch);
      return branch?.uuid || '';
    }
  }, [user?.branch, branches]);

  const myShops = useMemo(() => {
    if (!user) return [];
    return shops.filter(shop => shop.userId === user.id);
  }, [shops, user]);

  const displayedShops = useMemo(() => {
    let result = activeTab === 'my' ? myShops : shops;
    
    // Фильтр "только с фото"
    if (onlyWithPhotos) {
      result = result.filter(shop => shop.attachments && shop.attachments.length > 0);
    }
    
    return result;
  }, [activeTab, shops, myShops, onlyWithPhotos]);

  const availableForReserve = useMemo(() => {
    if (!selectedShop) return 0;
    const reserved = selectedShop.reservedQuantity || 0;
    const available = selectedShop.availableQuantity ?? Math.max(selectedShop.quantity - reserved, 0);
    return available;
  }, [selectedShop]);

  const userHasActiveReserve = useMemo(() => {
    if (!selectedShop || !user || !selectedShop.reserves) return false;
    return selectedShop.reserves.some(
      (r) => r.requester.id === user.id && ['PENDING', 'APPROVED'].includes(r.status)
    );
  }, [selectedShop, user]);

  return (
    <Container size="xl" py="md">
      <LoadingOverlay visible={loading} />

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="all">Все объявления ({total})</Tabs.Tab>
          <Tabs.Tab value="my">Мои объявления ({myShops.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value={activeTab || 'all'}>
          {/* Фильтры */}
          <Paper p="md" mb="md" withBorder>
            <Stack gap="md">
              <Group>
                <TextInput
                  placeholder="Поиск..."
                  leftSection={<IconSearch size={16} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Select
                  placeholder="Категория"
                  data={categoryOptions}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  clearable
                  w={200}
                />
                <Select
                  placeholder="Филиал"
                  data={branchOptions}
                  value={branchFilter}
                  onChange={setBranchFilter}
                  clearable
                  searchable
                  w={250}
                />
                <Select
                  placeholder="Статус"
                  data={[
                    { value: 'ACTIVE', label: 'Активные' },
                    { value: 'SOLD', label: 'Продано' },
                    { value: 'ARCHIVED', label: 'Архив' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  clearable
                  w={150}
                />
                <Checkbox
                  label="Только с фото"
                  checked={onlyWithPhotos}
                  onChange={(e) => setOnlyWithPhotos(e.currentTarget.checked)}
                />
                <Button
                  variant="light"
                  leftSection={<IconFilter size={16} />}
                  onClick={fetchShops}
                >
                  Применить
                </Button>
              </Group>
            </Stack>
          </Paper>

          {/* Список объявлений */}
          {displayedShops.length > 0 ? (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                {displayedShops.map((shop) => (
                  <Card
                    key={shop.id}
                    shadow="sm"
                    padding="lg"
                    radius="md"
                    withBorder
                    style={{ 
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%'
                    }}
                    onClick={() => handleViewShop(shop)}
                  >
                    <Card.Section style={{ position: 'relative', overflow: 'hidden' }}>
                      {shop.attachments && shop.attachments.length > 0 ? (
                        <Image
                          src={`${API}/public/${shop.attachments[0].source}`}
                          height={200}
                          alt={shop.title}
                          fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
                        />
                      ) : (
                        <Box
                          h={200}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--mantine-color-gray-1)',
                          }}
                        >
                          <IconPhoto size={48} color="var(--mantine-color-gray-5)" />
                        </Box>
                      )}
                      {shop.isPromoted && (
                        <Badge
                          color="yellow"
                          variant="filled"
                          style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                        >
                          Продвигается
                        </Badge>
                      )}
                      {shop.reservedQuantity !== undefined && shop.reservedQuantity > 0 && (
                        <Badge
                          color="blue"
                          variant="filled"
                          style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                        >
                          В броне: {shop.reservedQuantity}
                        </Badge>
                      )}
                    </Card.Section>

                    <Stack gap="xs" mt="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <Text fw={500} lineClamp={2} size="sm">
                        {shop.title}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {shop.branch.name} • {shop.branch.city}
                      </Text>
                      <Group justify="space-between" mt="auto">
                          <Text size="xs" c="dimmed">
                            {shop.category.name}
                          </Text>
                        <Group gap={4}>
                          <Text size="xs" c="dimmed">
                            <IconEye size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {shop.views}
                          </Text>
                        </Group>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>

              {activeTab === 'all' && totalPages > 1 && (
                <Group justify="center" mt="xl">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                  />
                </Group>
              )}
            </>
          ) : (
            <Paper p="xl" ta="center" withBorder>
              <Text c="dimmed">Объявления не найдены</Text>
            </Paper>
          )}
        </Tabs.Panel>
      </Tabs>

      {/* Модалка просмотра объявления в стиле Avito */}
      <CustomModal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setCurrentImageIndex(0);
        }}
        title={selectedShop?.title || ''}
        size="xl"
        width="95vw"
        maxWidth="1400px"
        maxHeight="90vh"
        styles={{
          body: { padding: 0, maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' },
        }}
      >
        {selectedShop && (
          <Grid gutter={0}>
              {/* Левая колонка: Фото и информация */}
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Stack gap={0}>
                  {/* Фотографии */}
                  {selectedShop.attachments && selectedShop.attachments.length > 0 ? (
                    <Box p="md">
                      <Box pos="relative" style={{ width: '100%', aspectRatio: '4/3' }}>
                <Image
                          src={`${API}/public/${selectedShop.attachments[currentImageIndex]?.source}`}
                  alt={selectedShop.title}
                          fit="cover"
                          style={{ width: '100%', height: '100%' }}
                        />
                        {selectedShop.attachments.length > 1 && (
                          <>
                            <ActionIcon
                              variant="filled"
                              size="lg"
                              pos="absolute"
                              left={10}
                              top="50%"
                              style={{ transform: 'translateY(-50%)', zIndex: 10 }}
                              onClick={() => setCurrentImageIndex((prev) => 
                                prev === 0 ? selectedShop.attachments.length - 1 : prev - 1
                              )}
                            >
                              <IconChevronLeft size={20} />
                            </ActionIcon>
                            <ActionIcon
                              variant="filled"
                              size="lg"
                              pos="absolute"
                              right={10}
                              top="50%"
                              style={{ transform: 'translateY(-50%)', zIndex: 10 }}
                              onClick={() => setCurrentImageIndex((prev) => 
                                prev === selectedShop.attachments.length - 1 ? 0 : prev + 1
                              )}
                            >
                              <IconChevronRight size={20} />
                            </ActionIcon>
                          </>
                        )}
                      </Box>
                      {selectedShop.attachments.length > 1 && (
                        <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                          <Carousel
                            slideSize="80px"
                            slideGap="xs"
                            withIndicators={false}
                            withControls={selectedShop.attachments.length > 5}
                            styles={{
                              control: {
                                '&[data-inactive]': {
                                  opacity: 0,
                                  cursor: 'default',
                                },
                              },
                            }}
                          >
                            {selectedShop.attachments.map((img, idx) => (
                              <Carousel.Slide key={img.id}>
                                <Box
                                  style={{
                                    cursor: 'pointer',
                                    border: idx === currentImageIndex ? '3px solid var(--mantine-color-blue-6)' : '2px solid var(--mantine-color-gray-3)',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    transition: 'border-color 0.2s',
                                  }}
                                  onClick={() => setCurrentImageIndex(idx)}
                                >
                                  <Image
                                    src={`${API}/public/${img.source}`}
                                    alt={`${selectedShop.title} ${idx + 1}`}
                                    h={80}
                                    w={80}
                                    fit="cover"
                                  />
                                </Box>
                              </Carousel.Slide>
                            ))}
                          </Carousel>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Box h={500} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mantine-color-gray-1)' }}>
                      <IconPhoto size={64} color="var(--mantine-color-gray-5)" />
              </Box>
            )}

                  {/* Информация о товаре */}
                  <Stack gap="md" p="md">
                    <Title order={2}>{selectedShop.title}</Title>
                    
                    {/* Характеристики */}
                    <Stack gap="xs">
                      <Text size="sm" fw={500}>Характеристики:</Text>
                      <Group gap="md">
                        <Text size="sm">
                          <strong>Категория:</strong> {selectedShop.category.name}
                        </Text>
                        <Text size="sm">
                          <strong>Состояние:</strong>{' '}
                          {selectedShop.condition === 'NEW' ? 'Новое' :
                           selectedShop.condition === 'EXCELLENT' ? 'Отличное' :
                           selectedShop.condition === 'GOOD' ? 'Хорошее' :
                           selectedShop.condition === 'SATISFACTORY' ? 'Удовлетворительное' : 'Плохое'}
                        </Text>
                        <Text size="sm">
                          <strong>Всего:</strong> {selectedShop.quantity} шт.
                        </Text>
                        {selectedShop.reservedQuantity !== undefined && selectedShop.reservedQuantity > 0 && (
                          <Text size="sm" c="orange">
                            <strong>В броне:</strong> {selectedShop.reservedQuantity} шт.
                          </Text>
                        )}
                        <Text size="sm" c="green">
                          <strong>Доступно:</strong>{' '}
                          {selectedShop.availableQuantity !== undefined
                            ? selectedShop.availableQuantity
                            : Math.max(selectedShop.quantity - (selectedShop.reservedQuantity || 0), 0)} шт.
                        </Text>
                        {selectedShop.article && (
                          <Text size="sm">
                            <strong>Артикул:</strong> {selectedShop.article}
                          </Text>
                        )}
              </Group>
                    </Stack>

                    <Divider />

            {/* Описание */}
            {selectedShop.description && (
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>Описание:</Text>
              <Text>{selectedShop.description}</Text>
                      </Stack>
            )}

                <Divider />

                    {/* Местоположение */}
                      <Stack gap="xs">
                      <Text size="sm" fw={500}>Местоположение:</Text>
                      <Group gap="xs">
                        <IconMapPin size={16} />
                        <Text>{selectedShop.branch.name} ({selectedShop.branch.city})</Text>
                      </Group>
                    </Stack>

                    <Divider />

                    {/* Комментарии */}
                    {selectedShop && (
                      <Comment
                        entityId={selectedShop.id}
                        entityType="SHOP"
                        fetchComments={fetchShopComments}
                        createComment={createShopComment}
                        height={300}
                      />
                    )}

                  </Stack>
                </Stack>
              </Grid.Col>

              {/* Правая колонка: Действия */}
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Box p="md">
                  <Paper p="md" withBorder style={{ position: 'sticky', top: 0 }}>
                  <Stack gap="md">
                    {/* Статус */}
                        <Badge
                      size="lg"
                          color={
                        selectedShop.status === 'ACTIVE' ? 'green' :
                        selectedShop.status === 'SOLD' ? 'gray' : 'blue'
                      }
                      fullWidth
                    >
                      {selectedShop.status === 'ACTIVE' ? 'Активно' :
                       selectedShop.status === 'SOLD' ? 'Продано' :
                       selectedShop.status === 'ARCHIVED' ? 'Архив' : 'На модерации'}
                        </Badge>

                    {/* Продавец */}
            <Stack gap="xs">
                      <Text size="sm" fw={500}>Продавец:</Text>
                <Group gap="xs">
                        <Avatar 
                          src={selectedShop.user.image 
                            ? `data:image/jpeg;base64,${selectedShop.user.image}` 
                            : undefined
                          } 
                          radius="xl"
                        >
                          {selectedShop.user.name[0]}
                        </Avatar>
                        <Stack gap={0}>
                          <Text fw={500}>{selectedShop.user.name}</Text>
                          <Text size="xs" c="dimmed">{selectedShop.user.email}</Text>
                        </Stack>
                </Group>
            </Stack>

                    <Divider />

            {/* Статистика */}
                    <Stack gap="xs">
              <Text size="sm" c="dimmed">
                Просмотров: {selectedShop.views}
              </Text>
              <Text size="sm" c="dimmed">
                Опубликовано: {selectedShop.publishedAt 
                  ? new Date(selectedShop.publishedAt).toLocaleDateString('ru-RU')
                  : 'Не опубликовано'}
              </Text>
                    </Stack>

                    <Divider />

                    {/* Резервирования */}
                    {user && selectedShop.reserves && selectedShop.reserves.length > 0 && (
                      <Stack gap="sm">
                        <Text size="sm" fw={500}>Резервирования:</Text>
                        <Stack gap="sm">
                          {selectedShop.reserves
                            .filter(r => {
                              // Показываем резервы автору или пользователю, который забронировал
                              return selectedShop.user.id === user.id || r.requester.id === user.id;
                            })
                            .map((r) => {
                              const isPending = r.status === 'PENDING';
                              const isApproved = r.status === 'APPROVED';
                              const isMyReserve = r.requester.id === user.id;
                              const isOwner = selectedShop.user.id === user.id;
                              
                              const getStatusText = (status: string) => {
                                switch (status) {
                                  case 'PENDING': return 'Ожидает подтверждения';
                                  case 'APPROVED': return 'Подтверждено';
                                  case 'REJECTED': return 'Отклонено';
                                  case 'COMPLETED': return 'Завершено';
                                  case 'CANCELLED': return 'Отменено';
                                  default: return status;
                                }
                              };

                              return (
                                <Paper key={r.id} withBorder p="sm">
                                  <Stack gap="xs">
                                    {isMyReserve ? (
                                      <>
                                        <Text size="sm" fw={500}>Ваш резерв</Text>
                                        <Text size="xs" c="dimmed">Количество: {r.quantity} шт.</Text>
                                        <Badge 
                                          size="sm" 
                                          color={
                                            isPending ? 'yellow' : 
                                            isApproved ? 'green' : 
                                            r.status === 'CANCELLED' ? 'red' :
                                            'gray'
                                          }
                                        >
                                          {getStatusText(r.status)}
                                        </Badge>
                                        {r.shipmentDocNumber && (
                                          <Text size="xs" c="dimmed">
                                            Документ отгрузки: {r.shipmentDocNumber}
                                          </Text>
                                        )}
                                        {(isPending || isApproved) && (
                                          <Button
                                            size="xs"
                                            variant="light"
                                            color="red"
                                            fullWidth
                                            mt="xs"
                                            onClick={async () => {
                                              if (!confirm('Вы уверены, что хотите отменить бронирование?')) {
                                                return;
                                              }
                                              try {
                                                const resp = await authFetch(`${API}/retail/shop/reserves/${r.id}/cancel`, {
                                                  method: 'POST',
                                                });
                                                if (resp?.ok) {
                                                  notificationSystem.addNotification('Успешно', 'Бронирование отменено', 'success');
                                                  // Обновляем карточку
                                                  const reload = await authFetch(`${API}/retail/shop/${selectedShop.id}`);
                                                  if (reload?.ok) {
                                                    const data = await reload.json();
                                                    setSelectedShop(data);
                                                  }
                                                  fetchShops();
                                                } else {
                                                  const err = await resp?.json();
                                                  notificationSystem.addNotification('Ошибка', err?.error || 'Не удалось отменить бронирование', 'error');
                                                }
                                              } catch (error) {
                                                notificationSystem.addNotification('Ошибка', 'Не удалось отменить бронирование', 'error');
                                              }
                                            }}
                                          >
                                            Отменить бронирование
                                          </Button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <Text size="sm" fw={500}>{r.requester.name}</Text>
                                        <Text size="xs" c="dimmed">Количество: {r.quantity} шт.</Text>
                                        <Badge 
                                          size="sm" 
                                          color={
                                            isPending ? 'yellow' : 
                                            isApproved ? 'green' : 
                                            r.status === 'CANCELLED' ? 'red' :
                                            'gray'
                                          }
                                        >
                                          {getStatusText(r.status)}
                                        </Badge>
                                        {r.shipmentDocNumber && (
                                          <Text size="xs" c="dimmed">
                                            Документ: {r.shipmentDocNumber}
                                          </Text>
                                        )}
                                        {isPending && isOwner && (
                                          <Stack gap="xs" mt="xs">
                                            <TextInput
                                              size="xs"
                                              placeholder="Номер документа"
                                              value={shipmentNumbers[r.id] || ''}
                                              onChange={(e) => setShipmentNumbers(prev => ({ ...prev, [r.id]: e.target.value }))}
                                            />
                                            <Button
                                              size="xs"
                                              fullWidth
                                              onClick={async () => {
                                                if (!shipmentNumbers[r.id]?.trim()) {
                                                  notificationSystem.addNotification('Ошибка', 'Укажите номер документа', 'error');
                                                  return;
                                                }
                                                try {
                                                  const resp = await authFetch(`${API}/retail/shop/reserves/${r.id}/confirm`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ shipmentDocNumber: shipmentNumbers[r.id].trim() }),
                                                  });
                                                  if (resp?.ok) {
                                                    notificationSystem.addNotification('Успешно', 'Резерв подтвержден', 'success');
                                                    // Обновляем карточку
                                                    const reload = await authFetch(`${API}/retail/shop/${selectedShop.id}`);
                                                    if (reload?.ok) {
                                                      const data = await reload.json();
                                                      setSelectedShop(data);
                                                      setShipmentNumbers(prev => {
                                                        const newState = { ...prev };
                                                        delete newState[r.id];
                                                        return newState;
                                                      });
                                                    }
                                                  } else {
                                                    const err = await resp?.json();
                                                    notificationSystem.addNotification('Ошибка', err?.error || 'Не удалось подтвердить', 'error');
                                                  }
                                                } catch (error) {
                                                  notificationSystem.addNotification('Ошибка', 'Не удалось подтвердить', 'error');
                                                }
                                              }}
                                            >
                                              Подтвердить
                                            </Button>
                                          </Stack>
                                        )}
                                        {(isPending || isApproved) && isOwner && (
                                          <Button
                                            size="xs"
                                            variant="light"
                                            color="red"
                                            fullWidth
                                            mt="xs"
                                            onClick={async () => {
                                              if (!confirm('Вы уверены, что хотите отменить бронирование?')) {
                                                return;
                                              }
                                              try {
                                                const resp = await authFetch(`${API}/retail/shop/reserves/${r.id}/cancel`, {
                                                  method: 'POST',
                                                });
                                                if (resp?.ok) {
                                                  notificationSystem.addNotification('Успешно', 'Бронирование отменено', 'success');
                                                  // Обновляем карточку
                                                  const reload = await authFetch(`${API}/retail/shop/${selectedShop.id}`);
                                                  if (reload?.ok) {
                                                    const data = await reload.json();
                                                    setSelectedShop(data);
                                                  }
                                                  fetchShops();
                                                } else {
                                                  const err = await resp?.json();
                                                  notificationSystem.addNotification('Ошибка', err?.error || 'Не удалось отменить бронирование', 'error');
                                                }
                                              } catch (error) {
                                                notificationSystem.addNotification('Ошибка', 'Не удалось отменить бронирование', 'error');
                                              }
                                            }}
                                          >
                                            Отменить бронирование
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Paper>
                              );
                            })}
                        </Stack>
                      </Stack>
                    )}

                    <Divider />

                    {/* Кнопки действий */}
            {user && selectedShop.userId === user.id ? (
                  <Stack gap="xs">
                              <Button
                          fullWidth
                                variant="light"
                          color="blue"
                              onClick={() => {
                            setEditModalOpened(true);
                            setModalOpened(false);
                              }}
                            >
                          Редактировать
                            </Button>
                <Button
                  fullWidth
                          variant="light"
                          color="red"
                          onClick={async () => {
                            if (confirm('Вы уверены, что хотите удалить это объявление?')) {
                              try {
                                const response = await authFetch(`${API}/retail/shop/${selectedShop.id}`, {
                                  method: 'DELETE',
                                });
                                if (response?.ok) {
                                  notificationSystem.addNotification('Успешно', 'Объявление удалено', 'success');
                                  setModalOpened(false);
                                  fetchShops();
                                } else {
                                  notificationSystem.addNotification('Ошибка', 'Не удалось удалить объявление', 'error');
                                }
                              } catch (error) {
                                console.error('Error deleting shop:', error);
                                notificationSystem.addNotification('Ошибка', 'Не удалось удалить объявление', 'error');
                              }
                            }
                          }}
                        >
                          Удалить
                </Button>
          </Stack>
            ) : user && selectedShop.status === 'ACTIVE' ? (
                      <Stack gap="xs">
                        {userHasActiveReserve ? (
                          <Button
                            fullWidth
                            variant="light"
                            color="gray"
                            disabled
                          >
                            Забронировано
                          </Button>
                        ) : availableForReserve > 0 ? (
                          <Button
                            fullWidth
                            color="blue"
                            onClick={() => {
                              setReserveQuantity(1);
                              setReserveModalOpened(true);
                            }}
                          >
                            Забронировать
                          </Button>
                        ) : (
                          <Button
                            fullWidth
                            variant="light"
                            color="gray"
                            disabled
                          >
                            Забронировано
                          </Button>
                        )}
                        <Button
                          fullWidth
                          variant="light"
                          leftSection={<IconMessage size={18} />}
                          onClick={() => {
                            // Фокус на поле комментария
                            const textarea = document.querySelector('textarea[placeholder="Здравствуйте!"]') as HTMLTextAreaElement;
                            if (textarea) {
                              textarea.focus();
                              textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                        >
                          Написать продавцу
                        </Button>
                      </Stack>
                    ) : user ? (
                      <Button
                        fullWidth
                        variant="light"
                        leftSection={<IconMessage size={18} />}
                        onClick={() => {
                          // Фокус на поле комментария
                          const textarea = document.querySelector('textarea[placeholder="Здравствуйте!"]') as HTMLTextAreaElement;
                          if (textarea) {
                            textarea.focus();
                            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                      >
                        Написать продавцу
                      </Button>
                    ) : availableForReserve <= 0 && selectedShop.status === 'ACTIVE' ? (
                      <Text size="sm" c="dimmed">
                        Все доступные единицы уже в броне
                      </Text>
                    ) : null}
          </Stack>
                </Paper>
                </Box>
              </Grid.Col>
            </Grid>
        )}
      </CustomModal>


      {/* Модалка создания/редактирования объявления */}
      <DynamicFormModal
        opened={createModalOpened || editModalOpened}
        onClose={() => {
          setCreateModalOpened(false);
          setEditModalOpened(false);
          setSelectedShop(null);
          setFileAttachments({});
        }}
        title={editModalOpened ? 'Редактировать объявление' : 'Создать объявление'}
        size="xl"
        mode={editModalOpened ? 'edit' : 'create'}
        initialValues={{
          title: selectedShop?.title || '',
          description: selectedShop?.description || '',
          categoryId: selectedShop?.categoryId || '',
          branchId: selectedShop?.branchId || userBranchId || '',
          quantity: selectedShop?.quantity || 1,
          article: selectedShop?.article || '',
          condition: selectedShop?.condition || 'GOOD',
        }}
        fields={formFields}
        fileAttachments={fileAttachments}
        onFileAttachmentsChange={(fileId, files) => {
          setFileAttachments(prev => ({ ...prev, [fileId]: files }));
        }}
        existingDocuments={editModalOpened && selectedShop?.attachments ? {
          photos: selectedShop.attachments.map(att => ({
            id: att.id,
            source: att.source,
            name: att.source.split('/').pop() || 'photo',
          }))
        } : undefined}
        onDeleteExistingDocument={async (_fileId, documentId) => {
          if (selectedShop) {
            try {
              const response = await authFetch(`${API}/retail/shop/${selectedShop.id}/images/${documentId}`, {
                method: 'DELETE',
              });
              if (response?.ok) {
                notificationSystem.addNotification('Успешно', 'Фотография удалена', 'success');
                fetchShops();
                const updatedShop = shops.find(s => s.id === selectedShop.id);
                if (updatedShop) {
                  setSelectedShop(updatedShop);
                }
              }
            } catch (error) {
              console.error('Error deleting image:', error);
            }
          }
        }}
        onSubmit={async (values) => {
          try {
            const isEdit = !!selectedShop;
            const url = isEdit ? `${API}/retail/shop/${selectedShop.id}` : `${API}/retail/shop`;
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await authFetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: values.title,
                description: values.description || null,
                categoryId: values.categoryId,
                branchId: values.branchId,
                quantity: values.quantity,
                article: values.article || null,
                condition: values.condition,
              }),
            });

            if (response?.ok) {
              const shopData = await response.json();
              const shopId = shopData.id || selectedShop?.id;
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[Shop] Shop saved, ID:', shopId);
              }
              
              // Загружаем фото объявления, если они есть
              // Получаем фотографии из values.photos (поле типа file) - это массив FileAttachment[]
              const photosFromForm: File[] = [];
              if (values.photos && Array.isArray(values.photos)) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Shop] values.photos:', values.photos);
                }
                values.photos.forEach((attachment: any) => {
                  // FileAttachment имеет структуру: { id, userAdd, source: File | string, meta? }
                  if (attachment && attachment.source instanceof File) {
                    photosFromForm.push(attachment.source);
                  }
                });
              }
              
              // Ищем все файлы из fileAttachments, которые являются File объектами
              const photosFromAttachments: File[] = [];
              Object.values(fileAttachments).forEach(files => {
                files.forEach(file => {
                  if (file instanceof File) {
                    photosFromAttachments.push(file);
                  }
                });
              });
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[Shop] Photos from form:', photosFromForm.length);
                console.log('[Shop] Photos from attachments:', photosFromAttachments.length);
              }
              
              // Объединяем фотографии из формы и из fileAttachments
              const allPhotos = [...photosFromForm, ...photosFromAttachments];
              
              if (allPhotos.length > 0 && shopId) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Shop] Uploading photos:', {
                    shopId,
                    photosCount: allPhotos.length,
                    url: `${API}/retail/shop/${shopId}/images`
                  });
                }
                
                try {
                  const formDataPhotos = new FormData();
                  allPhotos.forEach((photo, index) => {
                    formDataPhotos.append('images', photo);
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`[Shop] Added photo ${index + 1}:`, photo.name, photo.size, photo.type);
                    }
                  });
                  
                  const photoResponse = await authFetch(`${API}/retail/shop/${shopId}/images`, {
                    method: 'POST',
                    body: formDataPhotos,
                  });
                  
                  if (!photoResponse?.ok) {
                    const errorText = await photoResponse?.text().catch(() => 'Unknown error');
                    console.error('[Shop] Failed to upload photos:', {
                      status: photoResponse?.status,
                      statusText: photoResponse?.statusText,
                      error: errorText,
                      url: `${API}/retail/shop/${shopId}/images`,
                      shopId,
                      photosCount: allPhotos.length
                    });
                    notificationSystem.addNotification('Предупреждение', 'Объявление сохранено, но не удалось загрузить фото', 'warning');
                  } else {
                    const result = await photoResponse.json().catch(() => null);
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[Shop] Photos uploaded successfully:', result);
                    }
                  }
                } catch (photoError) {
                  console.error('Error uploading photos:', photoError);
                  notificationSystem.addNotification('Предупреждение', 'Объявление сохранено, но не удалось загрузить фото', 'warning');
                }
              }

              notificationSystem.addNotification('Успех', isEdit ? 'Объявление обновлено' : 'Объявление создано', 'success');
            setCreateModalOpened(false);
              setEditModalOpened(false);
              setSelectedShop(null);
              setFileAttachments({});
            fetchShops();
              if (!isEdit && activeTab !== 'my') setActiveTab('my');
            } else if (response) {
              const error = await response.json();
              notificationSystem.addNotification('Ошибка', error.error || (isEdit ? 'Не удалось обновить объявление' : 'Не удалось создать объявление'), 'error');
            }
          } catch (error) {
            console.error('Error saving ad:', error);
            notificationSystem.addNotification('Ошибка', selectedShop ? 'Не удалось обновить объявление' : 'Не удалось создать объявление', 'error');
          }
        }}
        submitButtonText={editModalOpened ? 'Сохранить' : 'Создать'}
      />

      {/* Модалка резервирования */}
      <Modal
        opened={reserveModalOpened}
        onClose={() => {
          setReserveModalOpened(false);
          setReserveQuantity(1);
        }}
        title="Забронировать товар"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Товар: {selectedShop?.title}
          </Text>
          <Text size="sm" c="dimmed">
            Доступно: {availableForReserve} шт.
          </Text>
          {selectedShop?.reservedQuantity !== undefined && selectedShop.reservedQuantity > 0 && (
            <Text size="sm" c="orange">
              В броне: {selectedShop.reservedQuantity} шт.
            </Text>
          )}
          {selectedShop?.quantity !== undefined && (
            <Text size="sm" c="dimmed">
              Всего: {selectedShop.quantity} шт.
            </Text>
          )}
          
          <NumberInput
            label="Количество"
            value={reserveQuantity}
            onChange={(val: string | number) => setReserveQuantity(Number(val) || 1)}
            min={1}
            max={Math.max(availableForReserve, 1)}
            disabled={availableForReserve <= 0}
            required
          />

          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              onClick={() => {
                setReserveModalOpened(false);
                setReserveQuantity(1);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={async () => {
                if (!selectedShop || !user) return;
                if (availableForReserve < 1) {
                  notificationSystem.addNotification('Недоступно', 'Все доступные единицы уже в броне', 'warning');
                  return;
                }
                
                try {
                  const response = await authFetch(`${API}/retail/shop/${selectedShop.id}/reserve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      quantity: reserveQuantity,
                      branchId: userBranchId || null,
                    }),
                  });

                  if (response?.ok) {
                    notificationSystem.addNotification('Успешно', 'Запрос на резервирование отправлен', 'success');
                    setReserveModalOpened(false);
                    setReserveQuantity(1);
                  } else {
                    const error = await response?.json();
                    notificationSystem.addNotification('Ошибка', error?.error || 'Не удалось создать резерв', 'error');
                  }
                } catch (error) {
                  console.error('Error creating reserve:', error);
                  notificationSystem.addNotification('Ошибка', 'Не удалось создать резерв', 'error');
                }
              }}
            >
              Забронировать
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Shop;

