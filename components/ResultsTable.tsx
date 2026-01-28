'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import type { AppResult } from '@/lib/supabase';

interface Props {
  data: AppResult[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  } else if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toString();
}

function formatPrice(price: number, currency: string): string {
  if (price === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(price);
}

export default function ResultsTable({ data }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<AppResult>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        cell: ({ row }) => row.index + 1,
        size: 50,
      },
      {
        accessorKey: 'icon_url',
        header: '',
        cell: ({ getValue }) => {
          const url = getValue() as string;
          return url ? (
            <img
              src={url}
              alt=""
              className="w-10 h-10 rounded-lg"
              loading="lazy"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
          );
        },
        size: 60,
        enableSorting: false,
      },
      {
        accessorKey: 'name',
        header: 'App Name',
        cell: ({ row, getValue }) => (
          <div>
            <a
              href={row.original.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {getValue() as string}
            </a>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
              {row.original.bundle_id}
            </div>
          </div>
        ),
        size: 250,
      },
      {
        accessorKey: 'review_count',
        header: 'Reviews',
        cell: ({ getValue }) => formatNumber(getValue() as number),
        size: 100,
      },
      {
        accessorKey: 'rating',
        header: 'Rating',
        cell: ({ getValue }) => {
          const rating = getValue() as number;
          return rating ? rating.toFixed(1) : 'N/A';
        },
        size: 80,
      },
      {
        accessorKey: 'developer',
        header: 'Developer',
        cell: ({ getValue }) => (
          <span className="truncate max-w-xs block">{getValue() as string}</span>
        ),
        size: 200,
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row, getValue }) =>
          formatPrice(getValue() as number, row.original.currency),
        size: 80,
      },
      {
        accessorKey: 'version',
        header: 'Version',
        size: 80,
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter results..."
          className="w-full max-w-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="ml-4 text-sm text-gray-500 dark:text-gray-400">
          {table.getFilteredRowModel().rows.length} of {data.length} apps
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                      header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800' : ''
                    }`}
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' ↑',
                        desc: ' ↓',
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No results to display
        </div>
      )}
    </div>
  );
}
