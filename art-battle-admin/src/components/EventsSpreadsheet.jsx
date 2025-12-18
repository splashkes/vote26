import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Box,
  Flex,
  Text,
  Table,
  TextField,
  Select,
  Checkbox,
  Button,
  Badge,
  Spinner,
  Card,
  Heading,
  IconButton,
  Tooltip,
} from '@radix-ui/themes';
import {
  CaretSortIcon,
  CaretUpIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
  CheckIcon,
  Cross2Icon,
  ExternalLinkIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

// Editable Text Cell
const EditableTextCell = ({ getValue, row, column, table }) => {
  const initialValue = getValue() || '';
  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    if (value !== initialValue) {
      table.options.meta?.updateData(row.original.id, column.id, value);
    }
    setIsEditing(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setValue(initialValue);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <TextField.Root
        size="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoFocus
        style={{ width: '100%' }}
      />
    );
  }

  return (
    <Text
      size="2"
      style={{ cursor: 'pointer', width: '100%', display: 'block' }}
      onClick={() => setIsEditing(true)}
    >
      {value || '-'}
    </Text>
  );
};

// Editable DateTime Cell
const EditableDateTimeCell = ({ getValue, row, column, table }) => {
  const initialValue = getValue() || '';
  const [isEditing, setIsEditing] = useState(false);

  // Format for display
  const displayValue = initialValue
    ? new Date(initialValue).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  // Format for input
  const inputValue = initialValue
    ? new Date(initialValue).toISOString().slice(0, 16)
    : '';

  const [value, setValue] = useState(inputValue);

  useEffect(() => {
    setValue(inputValue);
  }, [inputValue]);

  const onBlur = () => {
    if (value !== inputValue) {
      table.options.meta?.updateData(row.original.id, column.id, value ? new Date(value).toISOString() : null);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TextField.Root
        size="1"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        autoFocus
        style={{ width: '180px' }}
      />
    );
  }

  return (
    <Text
      size="2"
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
      onClick={() => setIsEditing(true)}
    >
      {displayValue}
    </Text>
  );
};

// Editable Select Cell
const EditableSelectCell = ({ getValue, row, column, table, options }) => {
  const value = getValue() || '';

  const onChange = (newValue) => {
    if (newValue !== value) {
      table.options.meta?.updateData(row.original.id, column.id, newValue);
    }
  };

  return (
    <Select.Root value={value} onValueChange={onChange} size="1">
      <Select.Trigger style={{ minWidth: '120px' }} />
      <Select.Content>
        {options.map((opt) => (
          <Select.Item key={opt.value} value={opt.value}>
            {opt.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
};

// Editable Checkbox Cell
const EditableCheckboxCell = ({ getValue, row, column, table }) => {
  const value = getValue() ?? false;

  const onChange = (checked) => {
    table.options.meta?.updateData(row.original.id, column.id, checked);
  };

  return (
    <Checkbox
      checked={value}
      onCheckedChange={onChange}
    />
  );
};

// Editable Time Cell
const EditableTimeCell = ({ getValue, row, column, table }) => {
  const initialValue = getValue() || '';
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue ? initialValue.slice(0, 5) : '');

  useEffect(() => {
    setValue(initialValue ? initialValue.slice(0, 5) : '');
  }, [initialValue]);

  const onBlur = () => {
    if (value !== (initialValue ? initialValue.slice(0, 5) : '')) {
      table.options.meta?.updateData(row.original.id, column.id, value || null);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TextField.Root
        size="1"
        type="time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        autoFocus
        style={{ width: '100px' }}
      />
    );
  }

  return (
    <Text
      size="2"
      style={{ cursor: 'pointer' }}
      onClick={() => setIsEditing(true)}
    >
      {value || '-'}
    </Text>
  );
};

// Column definitions
const createColumns = (navigate) => [
  {
    accessorKey: 'eid',
    header: 'EID',
    size: 80,
    cell: ({ row }) => (
      <Flex align="center" gap="1">
        <Badge variant="outline" size="1">{row.original.eid}</Badge>
        <IconButton
          size="1"
          variant="ghost"
          onClick={() => navigate(`/events/${row.original.id}`)}
        >
          <ExternalLinkIcon width="12" height="12" />
        </IconButton>
      </Flex>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    size: 200,
    cell: EditableTextCell,
  },
  {
    accessorKey: 'city_name',
    header: 'City',
    size: 120,
    cell: ({ getValue }) => <Text size="2">{getValue() || '-'}</Text>,
  },
  {
    accessorKey: 'event_start_datetime',
    header: 'Date/Time',
    size: 180,
    cell: EditableDateTimeCell,
  },
  {
    accessorKey: 'event_level',
    header: 'Level',
    size: 140,
    cell: ({ getValue, row, column, table }) => (
      <EditableSelectCell
        getValue={getValue}
        row={row}
        column={column}
        table={table}
        options={[
          { value: 'REGULAR', label: 'Regular' },
          { value: 'CHAMPION_CITY', label: 'Champion City' },
          { value: 'CHAMPION_NATIONAL', label: 'Champion National' },
          { value: 'PRIVATE', label: 'Private' },
          { value: 'SPECIAL', label: 'Special' },
        ]}
      />
    ),
  },
  {
    accessorKey: 'door_time',
    header: 'Doors',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    accessorKey: 'paint_time',
    header: 'Paint',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    accessorKey: 'showtime',
    header: 'Show',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    accessorKey: 'enabled',
    header: 'Enabled',
    size: 70,
    cell: EditableCheckboxCell,
  },
  {
    accessorKey: 'show_in_app',
    header: 'In App',
    size: 70,
    cell: EditableCheckboxCell,
  },
  {
    accessorKey: 'applications_open',
    header: 'Apps Open',
    size: 80,
    cell: EditableCheckboxCell,
  },
  {
    accessorKey: 'capacity',
    header: 'Cap',
    size: 60,
    cell: ({ getValue }) => <Text size="2">{getValue() || '-'}</Text>,
  },
];

const EventsSpreadsheet = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([{ id: 'event_start_datetime', desc: true }]);
  const [pendingChanges, setPendingChanges] = useState({});

  const columns = useMemo(() => createColumns(navigate), [navigate]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          event_level,
          door_time,
          paint_time,
          showtime,
          enabled,
          show_in_app,
          applications_open,
          capacity,
          cities (
            id,
            name
          )
        `)
        .order('event_start_datetime', { ascending: false })
        .limit(500);

      if (fetchError) throw fetchError;

      // Flatten city name
      const flattenedData = data.map(event => ({
        ...event,
        city_name: event.cities?.name || null,
      }));

      setEvents(flattenedData);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Update data handler
  const updateData = useCallback(async (eventId, columnId, value) => {
    // Track pending change
    setPendingChanges(prev => ({
      ...prev,
      [`${eventId}-${columnId}`]: true,
    }));

    try {
      const { error: updateError } = await supabase
        .from('events')
        .update({ [columnId]: value })
        .eq('id', eventId);

      if (updateError) throw updateError;

      // Update local state
      setEvents(prev =>
        prev.map(event =>
          event.id === eventId ? { ...event, [columnId]: value } : event
        )
      );
    } catch (err) {
      console.error('Error updating event:', err);
      setError(`Failed to update: ${err.message}`);
    } finally {
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[`${eventId}-${columnId}`];
        return next;
      });
    }
  }, []);

  const table = useReactTable({
    data: events,
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
    getPaginationRowModel: getPaginationRowModel(),
    meta: {
      updateData,
    },
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Heading size="6">Events Spreadsheet</Heading>
          <Flex gap="2" align="center">
            {hasPendingChanges && (
              <Badge color="orange">
                <Spinner size="1" /> Saving...
              </Badge>
            )}
            <IconButton variant="soft" onClick={fetchEvents} disabled={loading}>
              <ReloadIcon />
            </IconButton>
          </Flex>
        </Flex>

        {/* Search */}
        <Flex gap="3" align="center">
          <TextField.Root
            placeholder="Search events..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            style={{ width: '300px' }}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
          <Text size="2" color="gray">
            {table.getFilteredRowModel().rows.length} events
          </Text>
        </Flex>

        {error && (
          <Card style={{ background: 'var(--red-a3)' }}>
            <Text color="red">{error}</Text>
          </Card>
        )}

        {/* Table */}
        {loading ? (
          <Flex justify="center" py="9">
            <Spinner size="3" />
          </Flex>
        ) : (
          <Box style={{ overflowX: 'auto' }}>
            <Table.Root size="1">
              <Table.Header>
                {table.getHeaderGroups().map((headerGroup) => (
                  <Table.Row key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <Table.ColumnHeaderCell
                        key={header.id}
                        style={{
                          width: header.getSize(),
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          userSelect: 'none',
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <Flex align="center" gap="1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc' ? (
                              <CaretUpIcon />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <CaretDownIcon />
                            ) : (
                              <CaretSortIcon style={{ opacity: 0.3 }} />
                            )
                          )}
                        </Flex>
                      </Table.ColumnHeaderCell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Header>
              <Table.Body>
                {table.getRowModel().rows.map((row) => (
                  <Table.Row key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          padding: '4px 8px',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}

        {/* Pagination */}
        <Flex justify="between" align="center">
          <Flex gap="2" align="center">
            <Button
              size="1"
              variant="soft"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Text size="2">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </Text>
            <Button
              size="1"
              variant="soft"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </Flex>
          <Select.Root
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
            size="1"
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="25">25 per page</Select.Item>
              <Select.Item value="50">50 per page</Select.Item>
              <Select.Item value="100">100 per page</Select.Item>
              <Select.Item value="200">200 per page</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
      </Flex>
    </Box>
  );
};

export default EventsSpreadsheet;
