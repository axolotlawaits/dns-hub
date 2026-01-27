import { useState, useEffect } from 'react';
import {
  Paper,
  Stack,
  MultiSelect,
  TextInput,
  Select,
  Button,
  Group
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { API } from '../../../../config/constants';

interface FiltersProps {
  filters: any;
  onFiltersChange: (filters: any) => void;
}

function Filters({ filters, onFiltersChange }: FiltersProps) {
  const [rrsOptions, setRrsOptions] = useState<any[]>([]);
  const [branchOptions, setBranchOptions] = useState<any[]>([]);

  useEffect(() => {
    // Загружаем опции для фильтров
    // Здесь можно добавить загрузку списков РРС и филиалов
  }, []);

  const handleFilterChange = (key: string, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleReset = () => {
    onFiltersChange({});
  };

  return (
    <Paper p="md">
      <Stack>
        <Group>
          <TextInput
            placeholder="Поиск по ФИО или email"
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Статус управляющего"
            value={filters.status || null}
            onChange={(value) => handleFilterChange('status', value)}
            data={[
              { value: 'ACTIVE', label: 'Действующий' },
              { value: 'DEMOTED', label: 'Понижен' },
              { value: 'FIRED', label: 'Уволен' }
            ]}
            clearable
          />
          <Button
            variant="light"
            leftSection={<IconX size={16} />}
            onClick={handleReset}
          >
            Сбросить
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export default Filters;
