import { FilterFn, ColumnFiltersState } from '@tanstack/react-table';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isBetween from 'dayjs/plugin/isBetween';
import { TextInput, MultiSelect, Group, Text, ActionIcon, Box } from '@mantine/core';
import { IconX, IconFilter, IconCalendar, IconList } from '@tabler/icons-react';
import './styles/filter.css';

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
  onDropdownOpenChange?: (open: boolean) => void;
  showClearButton?: boolean;
  icon?: React.ReactNode;
}

export const Filter = ({
  filterType,
  currentFilter,
  filterOptions,
  onFilterChange,
  label,
  placeholder,
  onDropdownOpenChange,
  showClearButton = true,
  icon,
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

  const handleClear = () => {
    onFilterChange(filterType === 'date' ? {} : []);
  };

  const selectedValues = Array.isArray(currentFilter) ? (currentFilter as string[]) : [];
  
  const hasActiveFilter = filterType === 'date' 
    ? (currentFilter as DateFilter)?.start || (currentFilter as DateFilter)?.end
    : selectedValues.length > 0;

  const getFilterIcon = () => {
    if (icon) return icon;
    switch (filterType) {
      case 'date': return <IconCalendar size={16} />;
      case 'select': return <IconList size={16} />;
      default: return <IconFilter size={16} />;
    }
  };

  switch (filterType) {
    case 'date':
      return (
        <Box className={`filter-item ${hasActiveFilter ? 'filter-active' : ''}`}>
          <Text className="filter-label">
            {getFilterIcon()}
            {label}
          </Text>
          <div className="filter-date-group">
            <Box className="filter-date-item">
              <TextInput
                  type="date"
                placeholder="Начало периода"
                value={(currentFilter as DateFilter)?.start || ''}
                onChange={(e) => handleDateChange(e.target.value, true)}
                className="filter-input"
                leftSection={<IconCalendar size={16} />}
                rightSection={showClearButton && (currentFilter as DateFilter)?.start ? (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => handleDateChange(null, true)}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                ) : null}
              />
            </Box>
            <Box className="filter-date-item">
              <TextInput
                type="date"
                placeholder="Конец периода"
                value={(currentFilter as DateFilter)?.end || ''}
                onChange={(e) => handleDateChange(e.target.value, false)}
                className="filter-input"
                leftSection={<IconCalendar size={16} />}
                rightSection={showClearButton && (currentFilter as DateFilter)?.end ? (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => handleDateChange(null, false)}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                ) : null}
              />
            </Box>
          </div>
        </Box>
      );
    case 'select':
      return (
        <Box className={`filter-item ${hasActiveFilter ? 'filter-active' : ''}`}>
          <Text className="filter-label">
            {getFilterIcon()}
            {label}
          </Text>
          <MultiSelect
            placeholder={placeholder}
            data={filterOptions || []}
            value={selectedValues}
            onChange={handleMultiSelectChange}
            searchable
            clearable
            className="filter-select"
            classNames={{
              input: 'filter-input',
              dropdown: 'filter-dropdown',
              option: 'filter-option'
            }}
            leftSection={getFilterIcon()}
            rightSection={showClearButton && selectedValues.length > 0 ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={handleClear}
              >
                <IconX size={12} />
              </ActionIcon>
            ) : null}
            comboboxProps={{ 
              withinPortal: true, 
              zIndex: 1000
            }}
            onDropdownOpen={() => onDropdownOpenChange?.(true)}
            onDropdownClose={() => onDropdownOpenChange?.(false)}
            onOptionSubmit={(val) => {
              const exists = selectedValues.includes(val);
              const next = exists
                ? selectedValues.filter((v) => v !== val)
                : [...selectedValues, val];
              onFilterChange(next);
            }}
            data-remaining={selectedValues.length > 2 ? `+${selectedValues.length - 2}` : ''}
            data-has-remaining={selectedValues.length > 2 ? 'true' : 'false'}
          />
        </Box>
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
    icon?: React.ReactNode;
  }>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (columnId: string, value: any) => void;
  title?: string;
  showClearAll?: boolean;
  onClearAll?: () => void;
}

export const FilterGroup = ({ 
  filters, 
  columnFilters, 
  onColumnFiltersChange, 
  title = "Фильтры",
  showClearAll = true,
  onClearAll
}: FilterGroupProps) => {
  const hasActiveFilters = columnFilters.some(filter => {
    if (filter.id.includes('date') || filter.id.includes('Date')) {
      const dateFilter = filter.value as DateFilter;
      return dateFilter?.start || dateFilter?.end;
    }
    return Array.isArray(filter.value) ? filter.value.length > 0 : !!filter.value;
  });

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      // Очистить все фильтры
      filters.forEach(filter => {
        onColumnFiltersChange(filter.columnId, filter.type === 'date' ? {} : []);
      });
    }
  };

  return (
    <Box className="filter-group">
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={700} className="filter-group-title">
          {title}
        </Text>
        {showClearAll && hasActiveFilters && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleClearAll}
            className="filter-clear"
          >
            <IconX size={14} />
          </ActionIcon>
        )}
      </Group>
      
      <Group gap="md" wrap="wrap" style={{ alignItems: 'flex-start' }}>
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
              icon={filter.icon}
            />
          );
        })}
      </Group>
    </Box>
  );
};