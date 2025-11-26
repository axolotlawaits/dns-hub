import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Container, Group, Alert, ActionIcon, Tooltip, Box, Stack, Paper, Text } from '@mantine/core';
import { useApp } from '../../context/SelectedCategoryContext';
import { IconPlus, IconEdit, IconTrash, IconFolder, IconFolderOpen, IconChevronRight } from '@tabler/icons-react';
//Импорт Data
import type { DataItem } from '../../data/HierarchyData';
import { getHierarchyData } from '../../data/HierarchyData';
//Импорт Модалок
import { HierarchyAddModal, HierarchyDeleteModal, HierarchyEditModal } from './HierarchyModalMultiple';
import { CustomModal } from '../../../../../utils/CustomModal';


interface HierarchyProps {
  group: DataItem;
  onDataUpdate: () => void;
  hasFullAccess?: boolean;
}

// Мемоизированный компонент для блоков иерархии
const HierarchyBlock = React.memo(({ group, onDataUpdate, hasFullAccess = true }: HierarchyProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [childCategories, setChildCategories] = useState<DataItem[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [hasLoadedChildren, setHasLoadedChildren] = useState(false); // Флаг, что дочерние элементы уже загружались
  const { selectedId, setSelectedId } = useApp();
  const isSelected = selectedId === group.id;

  // Загружаем дочерние категории при монтировании, чтобы определить, есть ли они
  useEffect(() => {
    if (group.layer === 1 && !hasLoadedChildren) {
      // Загружаем дочерние категории (layer=1) для определения наличия подкатегорий
      getHierarchyData(group.id, 1)
        .then(children => {
          setChildCategories(children);
          setHasLoadedChildren(true);
        })
        .catch(error => {
          console.error('Ошибка загрузки дочерних категорий:', error);
          setHasLoadedChildren(true); // Отмечаем, что загрузка была выполнена (даже при ошибке)
        });
    }
  }, [group.id, group.layer, hasLoadedChildren]);

  // Определяем, есть ли дочерние КАТЕГОРИИ (layer=1), а не карточки (layer=0)
  // Показываем значок ТОЛЬКО если есть дочерние категории в иерархии
  const hasChildren = useMemo(() => {
    if (group.layer !== 1) return false; // Только для категорий (layer=1)
    
    // Если дочерние категории уже загружены, проверяем их количество
    if (hasLoadedChildren) {
      return childCategories.length > 0;
    }
    
    // Если еще не загружены, не показываем значок
    return false;
  }, [group.layer, childCategories.length, hasLoadedChildren]);
  
  // Переменные для мониторинга открытия модалок
  const [openedEdit, setOpenedEdit] = useState(false);
  const [openedDelete, setOpenedDelete] = useState(false);
  const [openedAdd, setOpenedAdd] = useState(false);

  // Мемоизируем обработчики
  const handleEdit = useCallback(() => {
    setOpenedEdit(true);
  }, []);

  const handleDelete = useCallback(() => {
    setOpenedDelete(true);
  }, []);

  const handleAdd = useCallback(() => {
    setOpenedAdd(true);
  }, []);

  const toggleExpanded = useCallback(async () => {
    if (!isExpanded && childCategories.length === 0) {
      // Загружаем детей при первом раскрытии
      setLoadingChildren(true);
      try {
        const children = await getHierarchyData(group.id, 1); // Загружаем подкатегории (layer = 1)
        setChildCategories(children);
        setHasLoadedChildren(true); // Отмечаем, что загрузка была выполнена
      } catch (error) {
        console.error('Ошибка загрузки детей:', error);
        setHasLoadedChildren(true); // Отмечаем, что загрузка была выполнена (даже при ошибке)
      } finally {
        setLoadingChildren(false);
      }
    }
    setIsExpanded(prev => !prev);
  }, [isExpanded, childCategories.length, group.id]);

  const handleSelect = useCallback(() => {
    setSelectedId(group.id);
  }, [group.id, setSelectedId]);

  // Функция для обновления данных после операций
  const handleSuccess = useCallback(async () => {
    onDataUpdate();
    // Если дочерние элементы уже загружались, обновляем их
    if (hasLoadedChildren) {
      try {
        const children = await getHierarchyData(group.id, 1);
        setChildCategories(children);
      } catch (error) {
        console.error('Ошибка обновления детей:', error);
      }
    }
  }, [onDataUpdate, hasLoadedChildren, group.id]);

  return (
    <>
      <Paper 
        key={group.id} 
        shadow="xs"
        radius="md"
        p="md"
        mb="sm"
        className={`hierarchy-block ${isSelected ? 'hierarchy-block-selected' : ''} ${isExpanded ? 'hierarchy-block-expanded' : ''}`}
        style={{ 
          '--layer': group.layer
        } as React.CSSProperties}
      > 
        <Group gap="xs" justify="space-between">
          <Group gap="xs" style={{ flex: 1 }}>
            {/* Стрелка раскрытия/сворачивания */}
            {hasChildren && (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={toggleExpanded}
                style={{ 
                  color: 'var(--color-primary-600)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }}
              >
                <IconChevronRight size={14} />
              </ActionIcon>
            )}
            
            {/* Название категории с возможностью выбора */}
            <Button 
              onClick={handleSelect}
              variant="subtle"
              leftSection={hasChildren ? (isExpanded ? <IconFolderOpen size={16} /> : <IconFolder size={16} />) : <IconFolder size={16} />}
              size="sm"
                          style={{ 
                            flex: 1,
                            justifyContent: 'flex-start',
                            color: 'var(--theme-text-primary)',
                            fontWeight: 500
                          }}
            > 
              <Text size="sm" fw={500}>{group.name}</Text>
            </Button>
          </Group>
          
          {/* Кнопки действий с иконками - только для пользователей с полным доступом */}
          {hasFullAccess && (
            <Group gap="xs">
              <Tooltip label="Добавить подкатегорию" withArrow>
                <ActionIcon 
                  variant="light" 
                  size="sm" 
                  color="blue"
                  onClick={handleAdd}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Редактировать категорию" withArrow>
                <ActionIcon 
                  variant="light" 
                  size="sm" 
                  color="orange"
                  onClick={handleEdit}
                >
                  <IconEdit size={14} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Удалить категорию" withArrow>
                <ActionIcon 
                  variant="light" 
                  size="sm" 
                  color="red"
                  onClick={handleDelete}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>

        {/* Дочерние элементы - рендерим только если раскрыто */}
        {isExpanded && hasChildren && (
          <Box className="hierarchy-children-container">
            {loadingChildren ? (
              <Box className="hierarchy-loading-container">
                <Text size="sm" c="dimmed">Загрузка подкатегорий...</Text>
              </Box>
            ) : (
              childCategories.map((childGroup) => (
                <HierarchyBlock 
                  key={childGroup.id} 
                  group={childGroup} 
                  onDataUpdate={onDataUpdate}
                  hasFullAccess={hasFullAccess}
                />
              ))
            )}
          </Box>
        )}
      </Paper>

      {/* Модалки */}
      <CustomModal
        opened={openedAdd}
        onClose={() => setOpenedAdd(false)}
        title="Добавить дочерний элемент"
        size="lg"
        icon={<IconPlus size={20} />}
      >
        <HierarchyAddModal 
          parentItem={group}
          onClose={() => setOpenedAdd(false)}
          onSuccess={() => {
            handleSuccess();
            setOpenedAdd(false);
          }}
        />
      </CustomModal>

      <CustomModal
        opened={openedEdit}
        onClose={() => setOpenedEdit(false)}
        title="Редактирование"
        size="lg"
        icon={<IconEdit size={20} />}
      >
        <HierarchyEditModal
          item={group}
          onClose={() => setOpenedEdit(false)}
          onSuccess={() => {
            handleSuccess();
            setOpenedEdit(false);
          }}
        />
      </CustomModal>

      <CustomModal
        opened={openedDelete}
        onClose={() => setOpenedDelete(false)}
        title="Удаление"
        size="lg"
        icon={<IconTrash size={20} />}
      >
        <HierarchyDeleteModal
          item={group}
          onClose={() => setOpenedDelete(false)}
          onSuccess={() => {
            handleSuccess();
            setOpenedDelete(false);
          }}
        />
      </CustomModal>
    </>
  );
});

interface HierarchyComponentProps {
  hasFullAccess?: boolean;
}

function Hierarchy({ hasFullAccess = true }: HierarchyComponentProps) {
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openedAdd, setOpenedAdd] = useState(false);

  // Функция для загрузки данных
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const hierarchyData = await getHierarchyData();
      setData(hierarchyData);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Проверяем статус загрузки
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Функция для обновления данных после операций
  const handleDataUpdate = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Мемоизируем корневые элементы (категории с layer = 1)
  const rootElements = useMemo(() => 
    data.filter(item => item.layer === 1), 
    [data]
  );

  // Обработка на случай, если не были загружены данные 
  if (loading) {
    return (
      <Container style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        height: 100,
        marginTop: 10
      }}>
        Загрузка...
      </Container>
    );
  }

  return (
    <Stack gap="md"> 
      {/* Основная иерархия */}
      {rootElements.length > 0 ? (
        rootElements.map((group) => (
          <HierarchyBlock 
            key={group.id} 
            group={group} 
            onDataUpdate={handleDataUpdate}
            hasFullAccess={hasFullAccess}
          />
        ))
      ) : (
        <Alert color="yellow" title="Нет данных" style={{ marginBottom: 15 }}>
          Иерархия пуста. Добавьте корневую категорию.
        </Alert>
      )}
      
                  {/* Кнопка добавления корневого элемента - только для пользователей с полным доступом */}
                  {hasFullAccess && (
                    <Paper shadow="xs" radius="md" p="lg" style={{ textAlign: 'center' }}>
                      <Button 
                        onClick={() => setOpenedAdd(true)}
                        size="md"
                        leftSection={<IconPlus size={20} />}
                        variant="filled"
                        color="blue"
                      >
                        Добавить корневую категорию
                      </Button>
                    </Paper>
                  )}

      {/* Модалка добавления корневой категории */}
      <CustomModal
        opened={openedAdd}
        onClose={() => setOpenedAdd(false)}
        title="Добавить корневую категорию"
        size="lg"
        icon={<IconPlus size={20} />}
      >
        <HierarchyAddModal
          onClose={() => setOpenedAdd(false)}
          onSuccess={() => {
            handleDataUpdate();
            setOpenedAdd(false);
          }}
        />
      </CustomModal>
    </Stack> 
  );
}

export default Hierarchy;
