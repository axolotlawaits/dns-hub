import { useState } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, flexRender, type ColumnDef, type ColumnFiltersState, type SortingState, type PaginationState, type FilterFn, type OnChangeFn, InitialTableState } from '@tanstack/react-table';
import { Pagination, Select, Flex, Group, Box, Text, Card, ThemeIcon } from '@mantine/core';
import { IconArrowUp, IconArrowDown, IconCalendar } from '@tabler/icons-react';
import './styles/tableUtils.css';

export interface TableComponentProps<TData> {
  data: TData[];
  initialState: InitialTableState;
  columns: ColumnDef<TData>[];
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  onSortingChange: OnChangeFn<SortingState>;
  filterFns?: Record<string, FilterFn<TData>>;
  onRowClick?: (row: TData) => void;
  paginationOptions?: Array<{ value: string; label: string }>;
  forceUpdate?: number; // Дополнительный проп для принудительного обновления UI
}

export function TableComponent<TData>({
  data,
  initialState,
  columns,
  columnFilters,
  sorting,
  onColumnFiltersChange,
  onSortingChange,
  filterFns,
  onRowClick,
  paginationOptions = [
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: '20', label: '20' },
    { value: '30', label: '30' },
    { value: '50', label: '50' },
  ],
  forceUpdate,
}: TableComponentProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: Number(paginationOptions[0]?.value) || 10,
  });
  console.log(columnFilters)
  const table = useReactTable({
    data,
    initialState,
    columns,
    state: {
      columnFilters,
      sorting,
      pagination,
    },
    filterFns,
    onColumnFiltersChange,
    onSortingChange,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Принудительное обновление для сторонних API
    ...(forceUpdate && { meta: { forceUpdate } }),
  });

  return (
    <Card 
      key={forceUpdate ? `table-${forceUpdate}` : undefined}
      shadow="sm" 
      radius="lg" 
      padding={0} 
      className="table-container"
    >
      <Box style={{ overflowX: 'auto', position: 'relative' }}>
        <table className='modern-table'>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className='table-header-row'>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`table-header-cell ${header.column.getIsResizing() ? 'resizing' : ''}`}
                    style={{
                      width: header.getSize(),
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      position: 'relative',
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <Group gap="xs" align="center">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <IconArrowUp size={14} />,
                        desc: <IconArrowDown size={14} />,
                      }[header.column.getIsSorted() as string] ?? null}
                    </Group>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="table-resize-handle"
                      style={{
                        backgroundColor: header.column.getIsResizing() ? 'var(--color-primary-500)' : 'var(--theme-border)',
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <tr
                key={row.id}
                className={`table-row ${index % 2 === 0 ? 'table-row--even' : 'table-row--odd'}`}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`table-cell ${cell.column.getIsResizing() ? 'resizing' : ''}`}
                    style={{
                      width: cell.column.getSize(),
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.getRowModel().rows.length === 0 && (
          <Card shadow="sm" radius="md" padding="xl" className="table-empty-state">
            <Group justify="center" align="center">
              <ThemeIcon size="lg" color="gray" variant="light">
                <IconCalendar size={24} />
              </ThemeIcon>
              <Text ta="center" c="dimmed" size="lg">
                Нет данных для отображения
              </Text>
            </Group>
          </Card>
        )}
      </Box>

      <Flex justify="space-between" align="center" mt="md" className="table-pagination">
        <Group gap="sm">
          <Text size="sm" c="dimmed">
            Показать:
          </Text>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onChange={(value) => table.setPageSize(Number(value))}
            data={paginationOptions}
            style={{ width: '120px' }}
            size="sm"
          />
          <Text size="sm" c="dimmed">
            записей
          </Text>
        </Group>
        <Pagination
          value={table.getState().pagination.pageIndex + 1}
          onChange={(page) => table.setPageIndex(page - 1)}
          total={table.getPageCount()}
          size="sm"
          variant='light'
        />
      </Flex>
    </Card>
  );
}