import { useState } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, flexRender, type ColumnDef, type ColumnFiltersState, type SortingState, type PaginationState, type FilterFn, type OnChangeFn } from '@tanstack/react-table';
import { Pagination, Select, Flex, Group, Box, Text } from '@mantine/core';
import { IconArrowUp, IconArrowDown } from '@tabler/icons-react';

export interface TableComponentProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  onSortingChange: OnChangeFn<SortingState>;
  filterFns?: Record<string, FilterFn<TData>>;
  onRowClick?: (row: TData) => void;
  paginationOptions?: Array<{ value: string; label: string }>;
}

export function TableComponent<TData>({
  data,
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
}: TableComponentProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: Number(paginationOptions[0]?.value) || 10,
  });

  const table = useReactTable({
    data,
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
  });

  return (
    <>
      <Box style={{ overflowX: 'auto', position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      position: 'relative',
                      padding: '16px',
                      borderBottom: '1px solid #dee2e6',
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <Group gap="xs">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <IconArrowUp size={14} />,
                        desc: <IconArrowDown size={14} />,
                      }[header.column.getIsSorted() as string] ?? null}
                    </Group>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        height: '100%',
                        width: '4px',
                        backgroundColor: header.column.getIsResizing() ? '#228be6' : '#ddd',
                        cursor: 'col-resize',
                        userSelect: 'none',
                        touchAction: 'none',
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  borderBottom: '1px solid #dee2e6',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      padding: '16px',
                      whiteSpace: 'nowrap',
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
          <Text ta="center" p="md">
            Нет данных для отображения
          </Text>
        )}
      </Box>

      <Flex justify="space-between" align="center" mt="md">
        <Select
          value={table.getState().pagination.pageSize.toString()}
          onChange={(value) => table.setPageSize(Number(value))}
          data={paginationOptions}
          style={{ width: '120px' }}
        />
        <Pagination
          value={table.getState().pagination.pageIndex + 1}
          onChange={(page) => table.setPageIndex(page - 1)}
          total={table.getPageCount()}
        />
      </Flex>
    </>
  );
}