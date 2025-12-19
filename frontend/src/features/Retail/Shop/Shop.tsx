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
  Modal,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Tabs,
  ActionIcon,
  Pagination,
  Box,
  LoadingOverlay,
  Avatar,
  Divider,
  Title,
} from '@mantine/core';
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconPhoto,
  IconMapPin,
  IconPhone,
  IconMail,
  IconEye,
  IconFilter,
  IconShoppingCart,
  IconCheck,
  IconX,
  IconFileText,
} from '@tabler/icons-react';
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
  parent_type?: string;
  children?: ShopCategory[];
  _count?: { shops: number };
}

interface ShopImage {
  id: string;
  source: string;
  isMain: boolean;
  sortOrder: number;
}

interface ShopItem {
  id: string;
  name: string;
  quantity: number;
  article?: string;
  description?: string;
  condition: 'NEW' | 'EXCELLENT' | 'GOOD' | 'SATISFACTORY' | 'POOR';
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
  };
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  views: number;
  isPromoted: boolean;
  createdAt: string;
  publishedAt?: string;
  images: ShopImage[];
  items: ShopItem[];
  _count?: { items: number };
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
  // Избранное удалено
  const [shopRequests, setShopRequests] = useState<any[]>([]);
  const [requestsModalOpened, setRequestsModalOpened] = useState(false);
  const [shipmentDocModalOpened, setShipmentDocModalOpened] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [shipmentDocNumber, setShipmentDocNumber] = useState('');
  
  // Фильтры
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>('ACTIVE');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCategories = async () => {
    try {
      const response = await authFetch(`${API}/retail/shop/categories`);
      if (response?.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await authFetch(`${API}/retail/shop/branches`);
      if (response?.ok) {
        const data = await response.json();
        setBranches(data);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
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

      const response = await authFetch(`${API}/retail/shop/shops?${params}`);
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
      const response = await authFetch(`${API}/retail/shop/shops/${shop.id}`);
      if (response?.ok) {
        const data = await response.json();
        setSelectedShop(data);
        setModalOpened(true);
        // Если пользователь - создатель объявления, загружаем запросы
        if (user && data.userId === user.id) {
          fetchShopRequests(data.id);
        }
      }
    } catch (error) {
      console.error('Error fetching shop:', error);
    }
  };

  const fetchShopRequests = async (shopId: string) => {
    try {
      const response = await authFetch(`${API}/retail/shop/shops/${shopId}/requests`);
      if (response?.ok) {
        const data = await response.json();
        setShopRequests(data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleCreateRequest = async (shopId: string) => {
    try {
      const response = await authFetch(`${API}/retail/shop/shops/${shopId}/request`, {
        method: 'POST',
      });
      if (response && response.ok) {
        notificationSystem.addNotification('Успешно', 'Запрос отправлен создателю объявления', 'success');
        setModalOpened(false);
      } else if (response) {
        const error = await response.json();
        notificationSystem.addNotification('Ошибка', error.error || 'Не удалось создать запрос', 'error');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось создать запрос', 'error');
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      const response = await authFetch(`${API}/retail/shop/shops/requests/${requestId}/approve`, {
        method: 'POST',
      });
      if (response?.ok) {
        notificationSystem.addNotification('Успешно', 'Запрос подтвержден', 'success');
        if (selectedShop) {
          fetchShopRequests(selectedShop.id);
        }
        setShipmentDocModalOpened(true);
        setSelectedRequestId(requestId);
      } else if (response) {
        const error = await response.json();
        notificationSystem.addNotification('Ошибка', error.error || 'Не удалось подтвердить запрос', 'error');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось подтвердить запрос', 'error');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      const response = await authFetch(`${API}/retail/shop/shops/requests/${requestId}/reject`, {
        method: 'POST',
      });
      if (response?.ok) {
        notificationSystem.addNotification('Успешно', 'Запрос отклонен', 'success');
        if (selectedShop) {
          fetchShopRequests(selectedShop.id);
        }
      } else if (response) {
        const error = await response.json();
        notificationSystem.addNotification('Ошибка', error.error || 'Не удалось отклонить запрос', 'error');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось отклонить запрос', 'error');
    }
  };

  const handleAddShipmentDoc = async () => {
    if (!selectedRequestId || !shipmentDocNumber.trim()) {
      notificationSystem.addNotification('Ошибка', 'Введите номер документа', 'error');
      return;
    }
    try {
      const response = await authFetch(`${API}/retail/shop/shops/requests/${selectedRequestId}/shipment-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentDocNumber: shipmentDocNumber.trim() }),
      });
      if (response?.ok) {
        notificationSystem.addNotification('Успешно', 'Номер документа добавлен', 'success');
        setShipmentDocModalOpened(false);
        setShipmentDocNumber('');
        setSelectedRequestId(null);
        if (selectedShop) {
          fetchShopRequests(selectedShop.id);
        }
      } else if (response) {
        const error = await response.json();
        notificationSystem.addNotification('Ошибка', error.error || 'Не удалось добавить номер документа', 'error');
      }
    } catch (error) {
      console.error('Error adding shipment doc:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось добавить номер документа', 'error');
    }
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

  const myShops = useMemo(() => {
    if (!user) return [];
    return shops.filter(shop => shop.userId === user.id);
  }, [shops, user]);

  const displayedShops = useMemo(() => {
    if (activeTab === 'my') return myShops;
    return shops;
  }, [activeTab, shops, myShops]);

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
                <Button
                  variant="light"
                  leftSection={<IconFilter size={16} />}
                  onClick={fetchShops}
                >
                  Применить
                </Button>
              </Group>
              {/* Кнопка инициализации категорий для админов */}
              {(user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && categoryOptions.length === 0 && (
                <Group>
                  <Button
                    variant="filled"
                    color="blue"
                    onClick={async () => {
                      try {
                        const response = await authFetch(`${API}/retail/shop/categories/init`, {
                          method: 'POST',
                        });
                        if (response?.ok) {
                          notificationSystem.addNotification('Успех', 'Категории успешно инициализированы', 'success');
                          fetchCategories();
                        } else {
                          notificationSystem.addNotification('Ошибка', 'Не удалось инициализировать категории', 'error');
                        }
                      } catch (error) {
                        console.error('Error initializing categories:', error);
                        notificationSystem.addNotification('Ошибка', 'Не удалось инициализировать категории', 'error');
                      }
                    }}
                  >
                    Инициализировать стандартные категории
                  </Button>
                  <Text size="sm" c="dimmed">
                    Нажмите для создания стандартных категорий (Бытовая техника, Красота и здоровье, и т.д.)
                  </Text>
                </Group>
              )}
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
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleViewShop(shop)}
                  >
                    <Card.Section>
                      {shop.images && shop.images.length > 0 ? (
                        <Image
                          src={`${API}/public/${shop.images[0].source}`}
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
                          style={{ position: 'absolute', top: 8, right: 8 }}
                        >
                          Продвигается
                        </Badge>
                      )}
                    </Card.Section>

                    <Stack gap="xs" mt="md">
                      <Text fw={500} lineClamp={2} size="sm">
                        {shop.title}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {shop.branch.name} • {shop.branch.city}
                      </Text>
                      <Group justify="space-between" mt="xs">
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">
                            {shop.category.name}
                          </Text>
                          {shop._count?.items && (
                            <Badge size="xs" variant="light">
                              {shop._count.items} {shop._count.items === 1 ? 'товар' : 'товаров'}
                            </Badge>
                          )}
                        </Group>
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

      {/* Модалка просмотра объявления */}
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={selectedShop?.title}
        size="xl"
        centered
      >
        {selectedShop && (
          <Stack gap="md">
            {/* Изображения */}
            {selectedShop.images && selectedShop.images.length > 0 && (
              <Box>
                <Image
                  src={`${API}/public/${selectedShop.images[0].source}`}
                  alt={selectedShop.title}
                  radius="md"
                />
              </Box>
            )}

            {/* Филиал и статус */}
            <Group justify="space-between">
              <Group gap="xs">
                <IconMapPin size={16} />
                <Text fw={500}>{selectedShop.branch.name}</Text>
                <Text size="sm" c="dimmed">({selectedShop.branch.city})</Text>
              </Group>
              <Badge
                color={
                  selectedShop.status === 'ACTIVE' ? 'green' :
                  selectedShop.status === 'SOLD' ? 'gray' : 'blue'
                }
              >
                {selectedShop.status === 'ACTIVE' ? 'Активно' :
                 selectedShop.status === 'SOLD' ? 'Продано' :
                 selectedShop.status === 'ARCHIVED' ? 'Архив' : 'На модерации'}
              </Badge>
            </Group>

            {/* Описание */}
            {selectedShop.description && (
              <Text>{selectedShop.description}</Text>
            )}

            {/* Товары */}
            {selectedShop.items && selectedShop.items.length > 0 && (
              <>
                <Divider />
                <Stack gap="md">
                  <Title order={5}>Товары ({selectedShop.items.length})</Title>
                  {selectedShop.items.map((item: ShopItem, index: number) => (
                    <Paper key={item.id || index} p="md" withBorder>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text fw={600}>{item.name}</Text>
                          <Badge color="blue" variant="light">
                            Кол-во: {item.quantity}
                          </Badge>
                        </Group>
                        {item.article && (
                          <Text size="sm" c="dimmed">
                            Артикул: {item.article}
                          </Text>
                        )}
                        {item.description && (
                          <Text size="sm">{item.description}</Text>
                        )}
                        <Badge
                          color={
                            item.condition === 'NEW' ? 'green' :
                            item.condition === 'EXCELLENT' ? 'cyan' :
                            item.condition === 'GOOD' ? 'blue' :
                            item.condition === 'SATISFACTORY' ? 'yellow' : 'red'
                          }
                          variant="light"
                          size="sm"
                        >
                          {item.condition === 'NEW' ? 'Новое' :
                           item.condition === 'EXCELLENT' ? 'Отличное' :
                           item.condition === 'GOOD' ? 'Хорошее' :
                           item.condition === 'SATISFACTORY' ? 'Удовлетворительное' : 'Плохое'}
                        </Badge>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </>
            )}

            <Divider />

            {/* Контакты */}
            <Stack gap="xs">
              <Title order={5}>Контакты</Title>
              {selectedShop.contactName && (
                <Group gap="xs">
                  <Avatar size="sm" radius="xl">{selectedShop.contactName[0]}</Avatar>
                  <Text>{selectedShop.contactName}</Text>
                </Group>
              )}
              {selectedShop.contactPhone && (
                <Group gap="xs">
                  <IconPhone size={16} />
                  <Text>{selectedShop.contactPhone}</Text>
                </Group>
              )}
              {selectedShop.contactEmail && (
                <Group gap="xs">
                  <IconMail size={16} />
                  <Text>{selectedShop.contactEmail}</Text>
                </Group>
              )}
            </Stack>

            {/* Статистика */}
            <Group gap="md">
              <Text size="sm" c="dimmed">
                Просмотров: {selectedShop.views}
              </Text>
              <Text size="sm" c="dimmed">
                Опубликовано: {selectedShop.publishedAt 
                  ? new Date(selectedShop.publishedAt).toLocaleDateString('ru-RU')
                  : 'Не опубликовано'}
              </Text>
            </Group>

            {/* Кнопка "Запросить в карточку" или управление запросами */}
            {user && selectedShop.userId === user.id ? (
              <>
                <Divider />
                <Group justify="space-between">
                  <Title order={5}>Запросы в карточку ({shopRequests.length})</Title>
                  <Button
                    variant="light"
                    onClick={() => setRequestsModalOpened(true)}
                  >
                    Показать все
                  </Button>
                </Group>
                {shopRequests.length > 0 ? (
                  <Stack gap="xs">
                    {shopRequests.slice(0, 3).map((request) => (
                      <Paper key={request.id} p="md" withBorder>
                        <Group justify="space-between">
                          <Stack gap="xs">
                            <Text fw={500}>{request.requester.name}</Text>
                            {request.requesterBranch && (
                              <Text size="sm" c="dimmed">
                                Филиал: {request.requesterBranch.name} ({request.requesterBranch.city})
                              </Text>
                            )}
                            {request.reserves && request.reserves.length > 0 && (
                              <Stack gap="xs">
                                <Text size="sm" fw={500}>Резерв:</Text>
                                {request.reserves.map((reserve: any) => (
                                  <Text key={reserve.id} size="xs" c="dimmed">
                                    {reserve.item.name}: {reserve.quantity} шт.
                                  </Text>
                                ))}
                              </Stack>
                            )}
                            <Badge
                              color={
                                request.status === 'PENDING' ? 'yellow' :
                                request.status === 'APPROVED' ? 'blue' :
                                request.status === 'COMPLETED' ? 'green' : 'red'
                              }
                            >
                              {request.status === 'PENDING' ? 'Ожидает' :
                               request.status === 'APPROVED' ? 'Подтвержден' :
                               request.status === 'COMPLETED' ? 'Завершен' : 'Отклонен'}
                            </Badge>
                            {request.shipmentDocNumber && (
                              <Text size="sm" c="dimmed">
                                Документ: {request.shipmentDocNumber}
                              </Text>
                            )}
                          </Stack>
                          {request.status === 'PENDING' && (
                            <Group gap="xs">
                              <Button
                                size="xs"
                                color="green"
                                leftSection={<IconCheck size={16} />}
                                onClick={() => handleApproveRequest(request.id)}
                              >
                                Подтвердить
                              </Button>
                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                leftSection={<IconX size={16} />}
                                onClick={() => handleRejectRequest(request.id)}
                              >
                                Отклонить
                              </Button>
                            </Group>
                          )}
                          {request.status === 'APPROVED' && !request.shipmentDocNumber && (
                            <Button
                              size="xs"
                              leftSection={<IconFileText size={16} />}
                              onClick={() => {
                                setSelectedRequestId(request.id);
                                setShipmentDocModalOpened(true);
                              }}
                            >
                              Добавить документ
                            </Button>
                          )}
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">Нет запросов</Text>
                )}
              </>
            ) : user && selectedShop.userId !== user.id ? (
              <>
                <Divider />
                <Button
                  fullWidth
                  leftSection={<IconShoppingCart size={18} />}
                  onClick={() => handleCreateRequest(selectedShop.id)}
                >
                  Запросить в карточку
                </Button>
              </>
            ) : null}
          </Stack>
        )}
      </Modal>

      {/* Модалка управления запросами */}
      <Modal
        opened={requestsModalOpened}
        onClose={() => setRequestsModalOpened(false)}
        title="Запросы в карточку"
        size="lg"
      >
        {shopRequests.length > 0 ? (
          <Stack gap="md">
            {shopRequests.map((request) => (
              <Paper key={request.id} p="md" withBorder>
                <Group justify="space-between">
                  <Stack gap="xs">
                    <Text fw={500}>{request.requester.name}</Text>
                    <Text size="sm" c="dimmed">{request.requester.email}</Text>
                    {request.requesterBranch && (
                      <Text size="sm" c="dimmed">
                        Филиал: {request.requesterBranch.name} ({request.requesterBranch.city})
                      </Text>
                    )}
                    {request.reserves && request.reserves.length > 0 && (
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>Резерв по товарам:</Text>
                        {request.reserves.map((reserve: any) => (
                          <Text key={reserve.id} size="sm" c="dimmed">
                            • {reserve.item.name}: {reserve.quantity} шт.
                          </Text>
                        ))}
                      </Stack>
                    )}
                    <Badge
                      color={
                        request.status === 'PENDING' ? 'yellow' :
                        request.status === 'APPROVED' ? 'blue' :
                        request.status === 'COMPLETED' ? 'green' : 'red'
                      }
                    >
                      {request.status === 'PENDING' ? 'Ожидает' :
                       request.status === 'APPROVED' ? 'Подтвержден' :
                       request.status === 'COMPLETED' ? 'Завершен' : 'Отклонен'}
                    </Badge>
                    {request.shipmentDocNumber && (
                      <Text size="sm">
                        <strong>Документ отгрузки:</strong> {request.shipmentDocNumber}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      Создан: {new Date(request.createdAt).toLocaleString('ru-RU')}
                    </Text>
                  </Stack>
                  {request.status === 'PENDING' && (
                    <Group gap="xs">
                      <Button
                        size="sm"
                        color="green"
                        leftSection={<IconCheck size={16} />}
                        onClick={() => handleApproveRequest(request.id)}
                      >
                        Подтвердить
                      </Button>
                      <Button
                        size="sm"
                        color="red"
                        variant="light"
                        leftSection={<IconX size={16} />}
                        onClick={() => handleRejectRequest(request.id)}
                      >
                        Отклонить
                      </Button>
                    </Group>
                  )}
                  {request.status === 'APPROVED' && !request.shipmentDocNumber && (
                    <Button
                      size="sm"
                      leftSection={<IconFileText size={16} />}
                      onClick={() => {
                        setSelectedRequestId(request.id);
                        setShipmentDocModalOpened(true);
                        setRequestsModalOpened(false);
                      }}
                    >
                      Добавить документ
                    </Button>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">Нет запросов</Text>
        )}
      </Modal>

      {/* Модалка добавления номера документа отгрузки */}
      <Modal
        opened={shipmentDocModalOpened}
        onClose={() => {
          setShipmentDocModalOpened(false);
          setShipmentDocNumber('');
          setSelectedRequestId(null);
        }}
        title="Добавить номер документа отгрузки"
      >
        <Stack gap="md">
          <TextInput
            label="Номер документа отгрузки"
            placeholder="Введите номер документа"
            value={shipmentDocNumber}
            onChange={(e) => setShipmentDocNumber(e.target.value)}
            required
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                setShipmentDocModalOpened(false);
                setShipmentDocNumber('');
                setSelectedRequestId(null);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={handleAddShipmentDoc}
              disabled={!shipmentDocNumber.trim()}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Модалка создания объявления */}
      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="Создать объявление"
        size="xl"
      >
        <CreateShopForm
          categories={categoryOptions}
          branches={branchOptions}
          onSuccess={() => {
            setCreateModalOpened(false);
            fetchShops();
            if (activeTab !== 'my') setActiveTab('my');
          }}
        />
      </Modal>
    </Container>
  );
}

// Компонент формы создания объявления
function CreateShopForm({ categories, branches, onSuccess }: { 
  categories: { value: string; label: string }[]; 
  branches: { value: string; label: string }[];
  onSuccess: () => void;
}) {
  const { user } = useUserContext();
  const authFetch = useAuthFetch();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    branchId: '',
    contactName: user?.name || '',
    contactPhone: '',
    contactEmail: user?.email || '',
  });
  const [items, setItems] = useState<Array<{
    name: string;
    quantity: number;
    article: string;
    description: string;
    condition: 'NEW' | 'EXCELLENT' | 'GOOD' | 'SATISFACTORY' | 'POOR';
  }>>([
    { name: '', quantity: 1, article: '', description: '', condition: 'GOOD' },
  ]);

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, article: '', description: '', condition: 'GOOD' }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.categoryId || !formData.branchId) {
      notificationSystem.addNotification('Ошибка', 'Заполните все обязательные поля', 'error');
      return;
    }

    if (items.length === 0 || items.some(item => !item.name)) {
      notificationSystem.addNotification('Ошибка', 'Добавьте хотя бы один товар с наименованием', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await authFetch(`${API}/retail/shop/shops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          items: items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            article: item.article || null,
            description: item.description || null,
            condition: item.condition,
          })),
        }),
      });

      if (response?.ok) {
        notificationSystem.addNotification('Успех', 'Объявление создано', 'success');
        onSuccess();
      } else {
        notificationSystem.addNotification('Ошибка', 'Не удалось создать объявление', 'error');
      }
    } catch (error) {
      console.error('Error creating ad:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось создать объявление', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label="Заголовок"
          placeholder="Название объявления"
          required
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
        <Textarea
          label="Описание (необязательно)"
          placeholder="Общее описание объявления"
          minRows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
        <Select
          label="Категория"
          placeholder="Выберите категорию"
          required
          data={categories}
          value={formData.categoryId}
          onChange={(val) => setFormData({ ...formData, categoryId: val || '' })}
        />
        <Select
          label="Филиал"
          placeholder="Выберите филиал"
          required
          data={branches}
          value={formData.branchId}
          onChange={(val) => setFormData({ ...formData, branchId: val || '' })}
          searchable
        />

        <Divider label="Товары" labelPosition="center" />

        {items.map((item, index) => (
          <Paper key={index} p="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={500}>Товар {index + 1}</Text>
                {items.length > 1 && (
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => removeItem(index)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              <TextInput
                label="Наименование"
                placeholder="Название товара"
                required
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
              />
              <Group grow>
                <NumberInput
                  label="Количество"
                  placeholder="1"
                  required
                  min={1}
                  value={item.quantity}
                  onChange={(val) => updateItem(index, 'quantity', val || 1)}
                />
                <TextInput
                  label="Артикул (необязательно)"
                  placeholder="Артикул товара"
                  value={item.article}
                  onChange={(e) => updateItem(index, 'article', e.target.value)}
                />
              </Group>
              <Textarea
                label="Описание (необязательно)"
                placeholder="Описание товара"
                minRows={2}
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
              />
              <Select
                label="Состояние"
                data={[
                  { value: 'NEW', label: 'Новое' },
                  { value: 'EXCELLENT', label: 'Отличное' },
                  { value: 'GOOD', label: 'Хорошее' },
                  { value: 'SATISFACTORY', label: 'Удовлетворительное' },
                  { value: 'POOR', label: 'Плохое' },
                ]}
                value={item.condition}
                onChange={(val) => updateItem(index, 'condition', val || 'GOOD')}
              />
            </Stack>
          </Paper>
        ))}

        <Button
          type="button"
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={addItem}
        >
          Добавить товар
        </Button>

        <Divider />

        <TextInput
          label="Имя"
          value={formData.contactName}
          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
        />
        <TextInput
          label="Телефон"
          value={formData.contactPhone}
          onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
        />
        <TextInput
          label="Email"
          type="email"
          value={formData.contactEmail}
          onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={loading}>
            Создать
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default Shop;

