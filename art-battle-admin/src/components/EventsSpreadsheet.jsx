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
  Dialog,
  Separator,
  ScrollArea,
} from '@radix-ui/themes';
import {
  CaretSortIcon,
  CaretUpIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
  ExternalLinkIcon,
  MixerHorizontalIcon,
  GearIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

// Helper: Format days out
const formatDaysOut = (datetime) => {
  if (!datetime) return null;
  const now = new Date();
  const eventDate = new Date(datetime);
  const diffMs = eventDate - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';

  const absDays = Math.abs(diffDays);

  if (absDays < 7) {
    return diffDays > 0 ? `in ${absDays}d` : `${absDays}d ago`;
  } else if (absDays < 30) {
    const weeks = Math.round(absDays / 7);
    return diffDays > 0 ? `in ${weeks}w` : `${weeks}w ago`;
  } else if (absDays < 365) {
    const months = Math.round(absDays / 30);
    return diffDays > 0 ? `in ${months}mo` : `${months}mo ago`;
  } else {
    const years = Math.round(absDays / 365);
    return diffDays > 0 ? `in ${years}y` : `${years}y ago`;
  }
};

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

  const displayValue = initialValue
    ? new Date(initialValue).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

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

// Days Out Cell (computed, not editable)
const DaysOutCell = ({ row }) => {
  const datetime = row.original.event_start_datetime;
  if (!datetime) return <Text size="2" color="gray">-</Text>;

  const now = new Date();
  const eventDate = new Date(datetime);
  const diffMs = eventDate - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formatted = formatDaysOut(datetime);

  let color = 'gray';
  if (diffDays > 0 && diffDays <= 7) color = 'green';
  else if (diffDays > 7 && diffDays <= 30) color = 'blue';
  else if (diffDays < 0 && diffDays >= -7) color = 'orange';
  else if (diffDays < -7) color = 'red';

  return (
    <Badge size="1" color={color} variant="soft">
      {formatted}
    </Badge>
  );
};

// Column presets
const COLUMN_PRESETS = {
  all: {
    label: 'All Columns',
    columns: ['eid', 'name', 'city_name', 'days_out', 'event_start_datetime', 'event_level', 'door_time', 'paint_time', 'showtime', 'enabled', 'show_in_app', 'applications_open', 'capacity', 'eventbrite_id', 'ticket_link'],
  },
  accounting: {
    label: 'Accounting',
    columns: ['eid', 'name', 'city_name', 'days_out', 'event_start_datetime', 'capacity', 'eventbrite_id', 'ticket_link'],
  },
  eventPrep: {
    label: 'Event Prep',
    columns: ['eid', 'name', 'city_name', 'days_out', 'event_start_datetime', 'event_level', 'door_time', 'paint_time', 'showtime', 'applications_open', 'capacity'],
  },
  postEvent: {
    label: 'Post-Event',
    columns: ['eid', 'name', 'city_name', 'days_out', 'event_start_datetime', 'enabled', 'show_in_app'],
  },
};

// All column definitions with metadata
const ALL_COLUMNS = [
  { id: 'eid', label: 'EID', category: 'Basic' },
  { id: 'name', label: 'Name', category: 'Basic' },
  { id: 'city_name', label: 'City', category: 'Basic' },
  { id: 'days_out', label: 'Days Out', category: 'Basic' },
  { id: 'event_start_datetime', label: 'Date/Time', category: 'Schedule' },
  { id: 'event_level', label: 'Level', category: 'Details' },
  { id: 'door_time', label: 'Doors', category: 'Schedule' },
  { id: 'paint_time', label: 'Paint', category: 'Schedule' },
  { id: 'showtime', label: 'Show', category: 'Schedule' },
  { id: 'enabled', label: 'Enabled', category: 'Status' },
  { id: 'show_in_app', label: 'In App', category: 'Status' },
  { id: 'applications_open', label: 'Apps Open', category: 'Status' },
  { id: 'capacity', label: 'Capacity', category: 'Details' },
  { id: 'eventbrite_id', label: 'Eventbrite ID', category: 'Ticketing' },
  { id: 'ticket_link', label: 'Ticket Link', category: 'Ticketing' },
];

// Column definitions factory
const createColumns = (navigate) => [
  {
    id: 'eid',
    accessorKey: 'eid',
    header: 'EID',
    size: 90,
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
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    size: 200,
    cell: EditableTextCell,
  },
  {
    id: 'city_name',
    accessorKey: 'city_name',
    header: 'City',
    size: 120,
    cell: ({ getValue }) => <Text size="2">{getValue() || '-'}</Text>,
  },
  {
    id: 'days_out',
    accessorKey: 'event_start_datetime',
    header: 'Days Out',
    size: 80,
    cell: DaysOutCell,
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.event_start_datetime ? new Date(rowA.original.event_start_datetime).getTime() : 0;
      const b = rowB.original.event_start_datetime ? new Date(rowB.original.event_start_datetime).getTime() : 0;
      return a - b;
    },
  },
  {
    id: 'event_start_datetime',
    accessorKey: 'event_start_datetime',
    header: 'Date/Time',
    size: 180,
    cell: EditableDateTimeCell,
  },
  {
    id: 'event_level',
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
    id: 'door_time',
    accessorKey: 'door_time',
    header: 'Doors',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    id: 'paint_time',
    accessorKey: 'paint_time',
    header: 'Paint',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    id: 'showtime',
    accessorKey: 'showtime',
    header: 'Show',
    size: 80,
    cell: EditableTimeCell,
  },
  {
    id: 'enabled',
    accessorKey: 'enabled',
    header: 'Enabled',
    size: 70,
    cell: EditableCheckboxCell,
  },
  {
    id: 'show_in_app',
    accessorKey: 'show_in_app',
    header: 'In App',
    size: 70,
    cell: EditableCheckboxCell,
  },
  {
    id: 'applications_open',
    accessorKey: 'applications_open',
    header: 'Apps Open',
    size: 80,
    cell: EditableCheckboxCell,
  },
  {
    id: 'capacity',
    accessorKey: 'capacity',
    header: 'Cap',
    size: 60,
    cell: ({ getValue }) => <Text size="2">{getValue() || '-'}</Text>,
  },
  {
    id: 'eventbrite_id',
    accessorKey: 'eventbrite_id',
    header: 'EB ID',
    size: 120,
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? (
        <a
          href={`https://www.eventbrite.com/myevent?eid=${val}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '12px', color: 'var(--accent-9)' }}
        >
          {val}
        </a>
      ) : <Text size="2" color="gray">-</Text>;
    },
  },
  {
    id: 'ticket_link',
    accessorKey: 'ticket_link',
    header: 'Tickets',
    size: 100,
    cell: ({ getValue }) => {
      const val = getValue();
      if (!val) return <Text size="2" color="gray">-</Text>;
      try {
        const url = new URL(val);
        return (
          <a
            href={val}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '12px', color: 'var(--accent-9)' }}
          >
            {url.hostname.replace('www.', '').slice(0, 15)}
          </a>
        );
      } catch {
        return <Text size="2">{val.slice(0, 15)}</Text>;
      }
    },
  },
];

// Storage key for column visibility
const STORAGE_KEY = 'events-spreadsheet-columns';

const EventsSpreadsheet = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([{ id: 'days_out', desc: false }]);
  const [pendingChanges, setPendingChanges] = useState({});
  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // Load saved column visibility from localStorage
  const [columnVisibility, setColumnVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading column visibility:', e);
    }
    // Default: show eventPrep preset
    const defaults = {};
    ALL_COLUMNS.forEach(col => {
      defaults[col.id] = COLUMN_PRESETS.eventPrep.columns.includes(col.id);
    });
    return defaults;
  });

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch (e) {
      console.error('Error saving column visibility:', e);
    }
  }, [columnVisibility]);

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
          eventbrite_id,
          ticket_link,
          cities (
            id,
            name
          )
        `)
        .order('event_start_datetime', { ascending: false })
        .limit(500);

      if (fetchError) throw fetchError;

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

  // Apply preset
  const applyPreset = (presetKey) => {
    const preset = COLUMN_PRESETS[presetKey];
    const newVisibility = {};
    ALL_COLUMNS.forEach(col => {
      newVisibility[col.id] = preset.columns.includes(col.id);
    });
    setColumnVisibility(newVisibility);
  };

  // Toggle column
  const toggleColumn = (columnId) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

  const table = useReactTable({
    data: events,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
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
  const visibleCount = Object.values(columnVisibility).filter(Boolean).length;

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
            <Button
              variant="soft"
              size="2"
              onClick={() => setColumnModalOpen(true)}
            >
              <MixerHorizontalIcon />
              Columns ({visibleCount})
            </Button>
            <IconButton variant="soft" onClick={fetchEvents} disabled={loading}>
              <ReloadIcon />
            </IconButton>
          </Flex>
        </Flex>

        {/* Search and Presets */}
        <Flex gap="3" align="center" wrap="wrap">
          <TextField.Root
            placeholder="Search events..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            style={{ width: '250px' }}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>

          <Separator orientation="vertical" size="2" />

          <Flex gap="2">
            {Object.entries(COLUMN_PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                size="1"
                variant="soft"
                color="gray"
                onClick={() => applyPreset(key)}
              >
                {preset.label}
              </Button>
            ))}
          </Flex>

          <Text size="2" color="gray" style={{ marginLeft: 'auto' }}>
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

      {/* Column Selection Modal */}
      <Dialog.Root open={columnModalOpen} onOpenChange={setColumnModalOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>
            <Flex align="center" gap="2">
              <GearIcon />
              Column Settings
            </Flex>
          </Dialog.Title>
          <Dialog.Description size="2" color="gray">
            Choose which columns to display. Settings are saved automatically.
          </Dialog.Description>

          <Box mt="4">
            {/* Presets */}
            <Text size="2" weight="bold" mb="2">Quick Presets</Text>
            <Flex gap="2" wrap="wrap" mb="4">
              {Object.entries(COLUMN_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  size="1"
                  variant="outline"
                  onClick={() => applyPreset(key)}
                >
                  {preset.label}
                </Button>
              ))}
            </Flex>

            <Separator size="4" mb="4" />

            {/* Column Checkboxes by Category */}
            <ScrollArea style={{ maxHeight: '300px' }}>
              {['Basic', 'Schedule', 'Details', 'Status', 'Ticketing'].map(category => {
                const categoryColumns = ALL_COLUMNS.filter(c => c.category === category);
                if (categoryColumns.length === 0) return null;

                return (
                  <Box key={category} mb="3">
                    <Text size="2" weight="bold" color="gray" mb="2">{category}</Text>
                    <Flex direction="column" gap="2">
                      {categoryColumns.map(col => (
                        <Flex key={col.id} align="center" gap="2">
                          <Checkbox
                            checked={columnVisibility[col.id] ?? true}
                            onCheckedChange={() => toggleColumn(col.id)}
                          />
                          <Text size="2">{col.label}</Text>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                );
              })}
            </ScrollArea>
          </Box>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft">Done</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default EventsSpreadsheet;
