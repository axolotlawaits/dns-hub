import { useState, useEffect, useMemo } from 'react';
import {
  Text,
  Stack,
  Button,
  Group,
  ActionIcon
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { API } from '../../../../config/constants';
import { DynamicFormModal, type FormField } from '../../../../utils/formModal';
import { UniversalHierarchy, HierarchyItem } from '../../../../utils/UniversalHierarchy';
import { flattenTree } from '../../../../utils/hierarchy';

function TrainingPrograms() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingProgram, setEditingProgram] = useState<any>(null);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/training/programs`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const data = await response.json();
      setPrograms(data);
    } catch (error) {
      console.error('Ошибка при загрузке программ:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingProgram(null);
    openModal();
  };

  const handleEdit = (program: any) => {
    setEditingProgram(program);
    openModal();
  };

  const handleSave = async (data: any) => {
    try {
      const url = editingProgram
        ? `${API}/training/programs/${editingProgram.id}`
        : `${API}/training/programs`;
      const method = editingProgram ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: data.name,
          typeId: data.typeId,
          parentId: data.parentId || null,
          isRequired: data.isRequired || false
        })
      });

      if (!response.ok) {
        throw new Error('Ошибка сохранения');
      }

      await fetchPrograms();
      closeModal();
    } catch (error) {
      console.error('Ошибка при сохранении программы:', error);
    }
  };

  const formConfig = [
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
      // Здесь нужно будет загрузить типы программ из API
      options: []
    },
    {
      name: 'parentId',
      label: 'Родительская программа',
      type: 'select',
      required: false,
      options: []
    },
    {
      name: 'isRequired',
      label: 'Обязательная',
      type: 'boolean',
      required: false
    }
  ];

  // Преобразуем дерево программ в плоский список для UniversalHierarchy
  const flatPrograms = useMemo(() => {
    return flattenTree(programs, {
      parentField: 'parentId',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
  }, [programs]);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="lg" fw={600}>Программы обучения</Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleCreate}
        >
          Добавить программу
        </Button>
      </Group>

      {loading ? (
        <Text>Загрузка...</Text>
      ) : (
        <UniversalHierarchy
          config={{
            initialData: flatPrograms,
            parentField: 'parentId',
            nameField: 'name',
            renderItem: (item: HierarchyItem) => {
              return (
                <Group gap="xs" style={{ width: '100%' }}>
                  <Text style={{ flex: 1 }}>{item.name}</Text>
                  <Group gap="xs" onClick={(e) => e.stopPropagation()}>
                    <ActionIcon
                      variant="light"
                      onClick={() => handleEdit(item)}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() => {/* handle delete */}}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              );
            },
            onDataUpdate: () => {
              fetchPrograms();
            }
          }}
          hasFullAccess={true}
        />
      )}

      <DynamicFormModal
        opened={modalOpened}
        onClose={closeModal}
        title={editingProgram ? 'Редактировать программу' : 'Создать программу'}
        mode={editingProgram ? 'edit' : 'create'}
        fields={formConfig as FormField[]}
        initialValues={editingProgram || {
          name: '',
          typeId: '',
          parentId: null,
          isRequired: false
        }}
        onSubmit={handleSave}
      />
    </Stack>
  );
}


export default TrainingPrograms;
