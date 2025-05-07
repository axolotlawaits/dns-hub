import { FilterFn, ColumnFiltersState } from '@tanstack/react-table';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isBetween from 'dayjs/plugin/isBetween';
import { TextInput, MultiSelect, Group } from '@mantine/core';

dayjs.locale('ru');
dayjs.extend(isBetween);

interface DateFilter {
  start?: string;
  end?: string;
}

export const dateRange: FilterFn<any> = (
  row,
  columnId,
  filterValue) => {
  const dateStr = row.getValue<string>(columnId);
  
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  const parts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/);
  if (!parts) return false;
  
  const [, day, month, year, hours, minutes] = parts.map(Number);
  const jsDate = new Date(year, month - 1, day, hours, minutes);
  
  if (isNaN(jsDate.getTime())) return false;
  
  const date = dayjs(jsDate);
  const start = filterValue?.start && dayjs(filterValue.start).startOf('day');
  const end = filterValue?.end && dayjs(filterValue.end).endOf('day');

  if (!start && !end) return true;
  if (start && end) return date.isBetween(start, end, null, '[]');
  if (start) return date >= start;
  return date <= end;
};

interface FilterProps {
  filterType: 'date' | 'text' | 'select';
  currentFilter?: DateFilter | string[];
  filterOptions?: Array<{ value: string; label: string }>;
  onFilterChange: (value: any) => void;
  label?: string;
  placeholder?: string;
  width?: number | string;
}

export const Filter = ({
  filterType,
  currentFilter,
  filterOptions,
  onFilterChange,
  label,
  placeholder,
  width = 200,
}: FilterProps) => {
  const handleDateChange = (date: string | null, isStart: boolean) => {
    const current = (currentFilter || {}) as DateFilter;
    const newFilter = {
      start: isStart ? date : current.start,
      end: !isStart ? date : current.end,
    };
    onFilterChange(newFilter);
  };

  const handleMultiSelectChange = (values: string[]) => {
    onFilterChange(values);
  };

  switch (filterType) {
    case 'date':
      return (
        <Group gap="md">
          <TextInput
            type="date"
            label={`${label} (начало)`}
            placeholder={placeholder}
            value={(currentFilter as DateFilter)?.start || ''}
            onChange={(e) => handleDateChange(e.target.value, true)}
            style={{ width }}
          />
          <TextInput
            type="date"
            label={`${label} (конец)`}
            placeholder={placeholder}
            value={(currentFilter as DateFilter)?.end || ''}
            onChange={(e) => handleDateChange(e.target.value, false)}
            style={{ width }}
          />
        </Group>
      );
    case 'select':
      return (
        <MultiSelect
          label={label}
          placeholder={placeholder}
          data={filterOptions || []}
          value={(currentFilter as string[]) || []}
          onChange={handleMultiSelectChange}
          searchable
          clearable
          style={{ width }}
        />
      );     
    default:
      return null;
  }
};

interface FilterGroupProps {
  filters: Array<{
    type: 'date' | 'text' | 'select';
    columnId: string;
    label: string;
    placeholder?: string;
    width?: number | string;
    options?: Array<{ value: string; label: string }>;
  }>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (columnId: string, value: any) => void;
}

export const FilterGroup = ({ filters, columnFilters, onColumnFiltersChange }: FilterGroupProps) => {
  return (
    <Group gap="md" mb="md">
      {filters.map((filter) => {
        const currentFilter = columnFilters.find((f) => f.id === filter.columnId)?.value as DateFilter | string[] | undefined;
        return (
          <Filter
            key={filter.columnId}
            filterType={filter.type}
            currentFilter={currentFilter}
            filterOptions={filter.options}
            onFilterChange={(value) => onColumnFiltersChange(filter.columnId, value)}
            label={filter.label}
            placeholder={filter.placeholder}
            width={filter.width}
          />
        );
      })}
    </Group>
  );
};