import { useState, useEffect, useMemo } from 'react';
import {
  Text,
  Group,
  ActionIcon,
  Badge,
  Box,
  Button,
  Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBook, IconPlus, IconEdit, IconTrash, IconArrowsSort } from '@tabler/icons-react';
import { API } from '../../../../config/constants';
import { DynamicFormModal, FormField } from '../../../../utils/formModal';
import { notificationSystem } from '../../../../utils/Push';
import useAuthFetch from '../../../../hooks/useAuthFetch';
import { getTypesFlat } from '../../../../utils/typesData';
import { useThemeContext } from '../../../../hooks/useThemeContext';
import { UniversalHierarchySortModal } from '../../../../utils/UniversalHierarchySortModal';
import { UniversalHierarchy, HierarchyItem } from '../../../../utils/UniversalHierarchy';
import { flattenTree } from '../../../../utils/hierarchy';
import { CustomModal } from '../../../../utils/CustomModal';
// Константы chapters для типов обучения (на русском языке)
const TRAINING_TYPE_CHAPTER = 'Тип программы';

interface TrainingProgram {
  id: string;
  name: string;
  typeId: string;
  parentId: string | null;
  order: number;
  isRequired: boolean;
  children?: TrainingProgram[];
  type?: {
    name: string;
  };
}

interface ProgramTreeProps {
  programs: TrainingProgram[];
  selectedProgramId: string | null;
  onSelectProgram: (programId: string) => void;
  onProgramsChange?: () => void;
}


function ProgramTree({ programs, selectedProgramId, onSelectProgram, onProgramsChange }: ProgramTreeProps) {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [sortModalOpened, { open: openSortModal, close: closeSortModal }] = useDisclosure(false);
  const [editingProgram, setEditingProgram] = useState<TrainingProgram | null>(null);
  const [trainingTypes, setTrainingTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [allPrograms, setAllPrograms] = useState<TrainingProgram[]>([]);
  const authFetch = useAuthFetch();
  const { isDark } = useThemeContext();

  // Преобразуем дерево программ в плоский список для UniversalHierarchy
  const flatPrograms = useMemo(() => {
    return flattenTree(programs, {
      parentField: 'parentId',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
  }, [programs]);

  useEffect(() => {
    fetchTrainingTypes();
    fetchAllPrograms();
  }, []);

  // Обновляем список типов при открытии модального окна
  useEffect(() => {
    if (modalOpened) {
      fetchTrainingTypes();
    }
  }, [modalOpened]);

  const fetchTrainingTypes = async () => {
    try {
      const { getToolByLink } = await import('../../../../utils/toolUtils');
      const trainingTool = await getToolByLink('education/training');
      if (trainingTool) {
        const types = await getTypesFlat(TRAINING_TYPE_CHAPTER, trainingTool.id);
        setTrainingTypes(types.map(t => ({ id: t.id, name: t.name })));
      }
    } catch (error) {
      console.error('Ошибка при загрузке типов программ:', error);
    }
  };

  const fetchAllPrograms = async () => {
    try {
      const response = await authFetch(`${API}/training/programs`);
      if (response && response.ok) {
        const data = await response.json();
        // Функция для получения всех программ из дерева
        const flattenPrograms = (items: TrainingProgram[]): TrainingProgram[] => {
          const result: TrainingProgram[] = [];
          items.forEach(item => {
            result.push(item);
            if (item.children && item.children.length > 0) {
              result.push(...flattenPrograms(item.children));
            }
          });
          return result;
        };
        setAllPrograms(flattenPrograms(data));
      }
    } catch (error) {
      console.error('Ошибка при загрузке программ:', error);
    }
  };

  const handleCreate = () => {
    setEditingProgram(null);
    openModal();
  };

  const handleEdit = (program: TrainingProgram) => {
    setEditingProgram(program);
    openModal();
  };

  const handleDelete = async (programId: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту программу?')) {
      return;
    }

    try {
      const response = await authFetch(`${API}/training/programs/${programId}`, {
        method: 'DELETE'
      });

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка удаления');
      }

      notificationSystem.addNotification('Успешно', 'Программа удалена', 'success');

      if (onProgramsChange) {
        onProgramsChange();
      }
    } catch (error) {
      console.error('Ошибка при удалении программы:', error);
      notificationSystem.addNotification('Ошибка', error instanceof Error ? error.message : 'Не удалось удалить программу', 'error');
    }
  };

  const handleSave = async (data: any) => {
    try {
      const url = editingProgram
        ? `${API}/training/programs/${editingProgram.id}`
        : `${API}/training/programs`;
      const method = editingProgram ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        body: JSON.stringify({
          name: data.name,
          typeId: data.typeId,
          parentId: data.parentId || null,
          isRequired: data.isRequired || false
        })
      });

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка сохранения');
      }

      notificationSystem.addNotification('Успешно', editingProgram ? 'Программа обновлена' : 'Программа создана', 'success');

      closeModal();
      if (onProgramsChange) {
        onProgramsChange();
      }
    } catch (error) {
      console.error('Ошибка при сохранении программы:', error);
      notificationSystem.addNotification('Ошибка', error instanceof Error ? error.message : 'Не удалось сохранить программу', 'error');
    }
  };

  const formConfig: FormField[] = [
    {
      name: 'name',
      label: 'Название программы',
      type: 'text',
      required: true
    },
    {
      name: 'typeId',
      label: 'Тип программы',
      type: 'select',
      required: true,
      options: trainingTypes.map(t => ({ value: t.id, label: t.name }))
    },
    {
      name: 'parentId',
      label: 'Родительская программа',
      type: 'select',
      required: false,
      options: [
        { value: '', label: 'Нет (корневой уровень)' },
        ...allPrograms
          .filter(p => !editingProgram || p.id !== editingProgram.id)
          .map(p => ({ value: p.id, label: p.name }))
      ]
    },
    {
      name: 'isRequired',
      label: 'Обязательная',
      type: 'boolean',
      required: false
    }
  ];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">
          {programs.length} {programs.length === 1 ? 'программа' : 'программ'}
        </Text>
        <Group gap="xs">
          {programs.length > 0 && (
            <Tooltip label="Сортировка иерархии">
              <ActionIcon
                variant="light"
                color="blue"
                onClick={openSortModal}
              >
                <IconArrowsSort size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={handleCreate}
          >
            Добавить
          </Button>
        </Group>
      </Group>

      {programs.length === 0 ? (
        <Box style={{ textAlign: 'center', padding: '40px' }}>
          <Text c="dimmed" mb="md">Нет программ обучения</Text>
          <Button
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={handleCreate}
          >
            Создать первую программу
          </Button>
        </Box>
      ) : (
        <UniversalHierarchy
          config={{
            initialData: flatPrograms,
            parentField: 'parentId',
            nameField: 'name',
            renderItem: (item: HierarchyItem, isSelected: boolean, hasChildren: boolean) => {
              const program = item as TrainingProgram;
              const textColor = isDark ? 'var(--theme-text-primary)' : undefined;
              
              return (
                <Group gap="xs" style={{ width: '100%' }}>
                  {!hasChildren && (
                    <IconBook size={16} style={{ marginLeft: '4px', color: isDark ? 'var(--theme-text-secondary)' : undefined }} />
                  )}
                  <Text fw={isSelected ? 600 : 400} size="sm" c={textColor} style={{ flex: 1 }}>
                    {program.name}
                  </Text>
                  {program.isRequired && (
                    <Badge size="xs" color="red" variant={isDark ? "filled" : "light"}>
                      Обязательно
                    </Badge>
                  )}
                  <Group gap={4} onClick={(e) => e.stopPropagation()}>
                    <ActionIcon
                      variant={isDark ? "light" : "subtle"}
                      size="sm"
                      color="blue"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(program);
                      }}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant={isDark ? "light" : "subtle"}
                      size="sm"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(program.id);
                      }}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              );
            },
            onItemSelect: (item) => {
              onSelectProgram(item.id);
            },
            onDataUpdate: () => {
              if (onProgramsChange) {
                onProgramsChange();
              }
            }
          }}
          hasFullAccess={true}
          initialSelectedId={selectedProgramId}
        />
      )}

      <DynamicFormModal
        opened={modalOpened}
        onClose={closeModal}
        title={editingProgram ? 'Редактировать программу' : 'Создать программу'}
        mode={editingProgram ? 'edit' : 'create'}
        fields={formConfig as FormField[]}
        initialValues={editingProgram ? {
          name: editingProgram.name,
          typeId: editingProgram.typeId,
          parentId: editingProgram.parentId || '',
          isRequired: editingProgram.isRequired
        } : {
          name: '',
          typeId: '',
          parentId: '',
          isRequired: false
        }}
        onSubmit={handleSave}
      />

      {/* Модалка сортировки иерархии */}
      <CustomModal
        opened={sortModalOpened}
        onClose={closeSortModal}
        title="Сортировка иерархии программ"
        size="xl"
        icon={<IconArrowsSort size={20} />}
      >
        <UniversalHierarchySortModal
          onClose={closeSortModal}
          onSuccess={() => {
            if (onProgramsChange) {
              onProgramsChange();
            }
            closeSortModal();
          }}
          config={{
            fetchEndpoint: `${API}/training/programs`,
            updateItemEndpoint: (id: string) => `${API}/training/programs/${id}`,
            parentField: 'parentId',
            sortField: 'order',
            nameField: 'name',
            transformItem: (item: TrainingProgram) => {
              const { id, name, parentId, order, ...rest } = item;
              return {
                id,
                name,
                parentId: parentId || null,
                level: 0,
                originalLevel: 0,
                originalParentId: parentId || null,
                sortOrder: order || 0,
                ...rest
              };
            },
            onSave: async (items, originalItems) => {
              // Находим все измененные элементы
              const movedItems = items.filter(item => {
                const original = originalItems.find(orig => orig.id === item.id);
                if (!original) return false;
                
                if (item.parentId !== original.parentId || item.level !== original.level) {
                  return true;
                }
                
                const currentSameParent = items.filter(i => i.parentId === item.parentId);
                const originalSameParent = originalItems.filter(i => i.parentId === original.parentId);
                
                const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
                const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
                
                return currentIndex !== originalIndex;
              });

              // Группируем изменения по родителям
              const parentsToUpdate = new Set<string | null>();
              movedItems.forEach(item => {
                parentsToUpdate.add(item.parentId);
                const original = originalItems.find(orig => orig.id === item.id);
                if (original && original.parentId !== item.parentId) {
                  parentsToUpdate.add(original.parentId);
                }
              });

              // Обновляем порядок для каждого родителя
              for (const parentId of parentsToUpdate) {
                const sameParentItems = items.filter(i => i.parentId === parentId);
                for (let i = 0; i < sameParentItems.length; i++) {
                  const item = sameParentItems[i];
                  await authFetch(`${API}/training/programs/${item.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ order: i })
                  });
                }
              }

              // Обновляем parentId для перемещенных элементов
              for (const item of movedItems) {
                const original = originalItems.find(orig => orig.id === item.id);
                if (original && original.parentId !== item.parentId) {
                  await authFetch(`${API}/training/programs/${item.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ parentId: item.parentId })
                  });
                }
              }
            }
          }}
        />
      </CustomModal>
    </>
  );
}

export default ProgramTree;
