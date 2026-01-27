// features/Docs/components/CategoryTree.tsx
import { useState, useEffect, useMemo } from 'react';
import { Stack, Text, Group, Badge, Loader, ActionIcon, Button, Menu } from '@mantine/core';
import { IconFolder, IconFolderOpen, IconPlus, IconEdit, IconTrash, IconDots } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { useUserContext } from '../../../hooks/useUserContext';
import { DynamicFormModal, type FormField } from '../../../utils/formModal';
import { getCategories, createCategory, updateCategory, deleteCategory, getCategoryById, KnowledgeCategory } from '../data/DocsData';
import { notificationSystem } from '../../../utils/Push';
import { UniversalHierarchy, HierarchyItem } from '../../../utils/UniversalHierarchy';
import { flattenTree } from '../../../utils/hierarchy';

interface CategoryTreeProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export default function CategoryTree({ selectedCategory, onSelectCategory }: CategoryTreeProps) {
  const { user } = useUserContext();
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Модалки для управления категориями
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<KnowledgeCategory | null>(null);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      console.log('[CategoryTree] Загруженные категории:', data);
      setCategories(data);
    } catch (err) {
      console.error('Ошибка при загрузке категорий:', err);
    } finally {
      setLoading(false);
    }
  };

  // Преобразуем дерево категорий в плоский список для UniversalHierarchy
  const flatCategories = useMemo(() => {
    return flattenTree(categories, {
      parentField: 'parentId',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
  }, [categories]);

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreateCategory = async (values: any) => {
    try {
      // Обрабатываем данные перед отправкой
      const categoryData: any = {
        name: values.name?.trim() || '',
        order: typeof values.order === 'number' ? values.order : parseInt(values.order) || 0,
      };

      // Добавляем опциональные поля только если они не пустые
      if (values.description?.trim()) {
        categoryData.description = values.description.trim();
      }
      // Обрабатываем icon: сохраняем только если не пустая строка
      if (values.icon && String(values.icon).trim()) {
        categoryData.icon = String(values.icon).trim();
        console.log('[CategoryTree] Сохраняем иконку при создании:', categoryData.icon);
      }
      if (values.color?.trim()) {
        categoryData.color = values.color.trim();
      }
      
      // Обрабатываем parentId: если есть parentCategoryId, используем его, иначе null
      if (parentCategoryId) {
        categoryData.parentId = parentCategoryId;
      } else {
        categoryData.parentId = null;
      }

      console.log('[CategoryTree] Данные для создания категории:', categoryData);
      const createdCategory = await createCategory(categoryData);
      console.log('[CategoryTree] Созданная категория:', createdCategory);
      notificationSystem.addNotification('Категория создана', 'Категория успешно создана', 'success');
      setCreateModalOpened(false);
      setParentCategoryId(null);
      await loadCategories();
    } catch (err: any) {
      const errorMessage = err?.message || 'Не удалось создать категорию';
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      throw err;
    }
  };

  const handleUpdateCategory = async (values: any) => {
    if (!selectedCategoryForEdit) return;
    
    try {
      // Обрабатываем данные перед отправкой
      const categoryData: any = {
        name: values.name?.trim() || '',
        order: typeof values.order === 'number' ? values.order : parseInt(values.order) || 0,
      };

      // Добавляем опциональные поля только если они не пустые
      if (values.description !== undefined) {
        if (values.description?.trim()) {
          categoryData.description = values.description.trim();
        } else {
          categoryData.description = null;
        }
      }
      // Обрабатываем icon: сохраняем только если не пустая строка
      if (values.icon !== undefined && values.icon !== null) {
        const iconValue = String(values.icon).trim();
        if (iconValue) {
          categoryData.icon = iconValue;
        } else {
          categoryData.icon = null; // Явно устанавливаем null для пустой строки
        }
      }
      if (values.color !== undefined) {
        if (values.color?.trim()) {
          categoryData.color = values.color.trim();
        } else {
          categoryData.color = null;
        }
      }
      
      // Обрабатываем parentId
      if (values.parentId === 'null' || values.parentId === null || values.parentId === '' || values.parentId === undefined) {
        categoryData.parentId = null;
      } else if (values.parentId) {
        categoryData.parentId = values.parentId;
      }

      await updateCategory(selectedCategoryForEdit.id, categoryData);
      notificationSystem.addNotification('Категория обновлена', 'Категория успешно обновлена', 'success');
      setEditModalOpened(false);
      setSelectedCategoryForEdit(null);
      await loadCategories();
    } catch (err: any) {
      const errorMessage = err?.message || 'Не удалось обновить категорию';
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      throw err;
    }
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategoryForEdit) return;
    
    try {
      await deleteCategory(selectedCategoryForEdit.id);
      notificationSystem.addNotification('Категория удалена', 'Категория успешно удалена', 'success');
      setDeleteModalOpened(false);
      setSelectedCategoryForEdit(null);
      if (selectedCategory === selectedCategoryForEdit.id) {
        onSelectCategory(null);
      }
      await loadCategories();
    } catch (err) {
      console.error('Ошибка при удалении категории:', err);
    }
  };

  const flattenCategories = (cats: KnowledgeCategory[]): Array<{ value: string; label: string }> => {
    const result: Array<{ value: string; label: string }> = [];
    const flatten = (items: KnowledgeCategory[], level = 0) => {
      items.forEach(cat => {
        if (selectedCategoryForEdit && cat.id === selectedCategoryForEdit.id) {
          // Пропускаем текущую категорию и её дочерние элементы
          return;
        }
        result.push({
          value: cat.id,
          label: '  '.repeat(level) + cat.name,
        });
        if (cat.children && cat.children.length > 0) {
          flatten(cat.children, level + 1);
        }
      });
    };
    flatten(cats);
    return [{ value: '', label: 'Корневая категория' }, ...result];
  };

  const categoryFields: FormField[] = [
    {
      name: 'name',
      label: 'Название',
      type: 'text',
      required: true,
      placeholder: 'Введите название категории',
    },
    {
      name: 'description',
      label: 'Описание',
      type: 'textarea',
      required: false,
      placeholder: 'Описание категории (необязательно)',
    },
    {
      name: 'icon',
      label: 'Иконка',
      type: 'icon',
      required: false,
    },
    {
      name: 'color',
      label: 'Цвет',
      type: 'color',
      required: false,
    },
    {
      name: 'parentId',
      label: 'Родительская категория',
      type: 'select',
      required: false,
      options: flattenCategories(categories),
      searchable: true,
    },
    {
      name: 'order',
      label: 'Порядок',
      type: 'number',
      required: false,
      placeholder: '0',
    },
  ];


  if (loading) {
    return <Loader size="sm" />;
  }

  return (
    <>
      <Stack gap={4}>
        <Group justify="space-between" align="center" p="xs">
          <Text
            size="sm"
            fw={500}
            style={{ cursor: 'pointer', flex: 1 }}
            onClick={() => onSelectCategory(null)}
          >
            Все категории
          </Text>
          {isAdmin && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setParentCategoryId(null);
                setCreateModalOpened(true);
              }}
            >
              Добавить
            </Button>
          )}
        </Group>
        <UniversalHierarchy
          config={{
            initialData: flatCategories,
            parentField: 'parentId',
            nameField: 'name',
            renderItem: (item: HierarchyItem, isSelected: boolean, hasChildren: boolean) => {
              const category = item as KnowledgeCategory;
              let CategoryIcon: React.ComponentType<{ size?: number; color?: string; stroke?: number }> | null = null;
              
              if (category.icon && category.icon.trim()) {
                const iconName = category.icon.trim();
                const IconComponent = TablerIcons[iconName as keyof typeof TablerIcons] as React.ComponentType<{
                  size?: number;
                  color?: string;
                  stroke?: number;
                }>;
                if (IconComponent) {
                  CategoryIcon = IconComponent;
                }
              }
              
              if (!CategoryIcon) {
                CategoryIcon = hasChildren ? IconFolderOpen : IconFolder;
              }
              
              return (
                <Group gap="xs" style={{ width: '100%' }}>
                  <CategoryIcon size={18} color={category.color} stroke={1.5} />
                  <Text size="sm" fw={isSelected ? 600 : 400} style={{ flex: 1 }}>
                    {category.name}
                  </Text>
                  {category._count?.articles && (
                    <Badge size="xs" variant="light">
                      {category._count.articles}
                    </Badge>
                  )}
                  {isAdmin && (
                    <Menu position="bottom-start" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPlus size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setParentCategoryId(category.id);
                            setCreateModalOpened(true);
                          }}
                        >
                          Добавить подкатегорию
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size={16} />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const fullCategory = await getCategoryById(category.id);
                              setSelectedCategoryForEdit(fullCategory);
                              setEditModalOpened(true);
                            } catch (err) {
                              console.error('Ошибка при загрузке категории:', err);
                            }
                          }}
                        >
                          Редактировать
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconTrash size={16} />}
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategoryForEdit(category);
                            setDeleteModalOpened(true);
                          }}
                        >
                          Удалить
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              );
            },
            onItemSelect: (item) => {
              onSelectCategory(item.id);
            },
            onDataUpdate: () => {
              loadCategories();
            }
          }}
          hasFullAccess={isAdmin}
          initialSelectedId={selectedCategory}
        />
      </Stack>

      {/* Модалка создания категории */}
      <DynamicFormModal
        opened={createModalOpened}
        onClose={() => {
          setCreateModalOpened(false);
          setParentCategoryId(null);
        }}
        title={parentCategoryId ? 'Создать подкатегорию' : 'Создать категорию'}
        mode="create"
        fields={categoryFields}
        initialValues={{
          name: '',
          description: '',
          icon: '',
          color: '',
          parentId: parentCategoryId || '',
          order: 0,
        }}
        onSubmit={handleCreateCategory}
      />

      {/* Модалка редактирования категории */}
      <DynamicFormModal
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedCategoryForEdit(null);
        }}
        title="Редактировать категорию"
        mode="edit"
        fields={categoryFields}
        initialValues={selectedCategoryForEdit ? {
          name: selectedCategoryForEdit.name,
          description: selectedCategoryForEdit.description || '',
          icon: selectedCategoryForEdit.icon || '',
          color: selectedCategoryForEdit.color || '',
          parentId: selectedCategoryForEdit.parentId || '',
          order: selectedCategoryForEdit.order || 0,
        } : {}}
        onSubmit={handleUpdateCategory}
      />

      {/* Модалка удаления категории */}
      <DynamicFormModal
        opened={deleteModalOpened}
        onClose={() => {
          setDeleteModalOpened(false);
          setSelectedCategoryForEdit(null);
        }}
        title="Удалить категорию"
        mode="delete"
        initialValues={selectedCategoryForEdit || {}}
        onConfirm={handleDeleteCategory}
      />
    </>
  );
}

