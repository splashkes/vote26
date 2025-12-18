# Event Spreadsheet View - UI Library Plan

**Date:** 2025-12-18
**Goal:** Add spreadsheet-like event list with inline editing to admin system

---

## Current Stack

- **React 19**
- **Radix UI Themes 3.2.1** (primary component library)
- **Radix Icons**
- No existing table/grid library

---

## Library Options

### Option 1: TanStack Table + Radix UI (Recommended)

**What:** Headless table logic library that you pair with your own UI components.

**Why it fits:**
- **Radix UI native** - Uses your existing Radix components (Table, TextField, Select, Checkbox)
- **Lightweight** - ~15KB core, no UI bloat
- **Full control** - Every cell renders however you want
- **shadcn/ui pattern** - Popular approach, lots of examples

**Inline editing pattern:**
```jsx
// Cell renders as TextField when editing
const EditableCell = ({ getValue, row, column, table }) => {
  const [value, setValue] = useState(getValue());

  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };

  return (
    <TextField.Root
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
};
```

**Features available:**
- Sorting, filtering, pagination (built-in)
- Row selection with checkboxes
- Column resizing, reordering
- Virtualization (add @tanstack/react-virtual for 1000+ rows)

**Bundle impact:** +15-20KB

**Effort:** Medium - need to build cell editors, but patterns are well documented

---

### Option 2: AG Grid Community

**What:** Full-featured data grid with built-in UI.

**Why consider:**
- **Everything built-in** - Inline editing, filtering, sorting work immediately
- **Battle-tested** - Used by thousands of enterprise apps
- **Handles scale** - 100K+ rows no problem

**Why NOT recommended:**
- **UI mismatch** - Has its own styling, won't match Radix themes
- **Heavy** - 200KB+ bundle size
- **Overkill** - We're showing ~100-500 events, not 100K rows

**Effort:** Low initial, high customization

---

### Option 3: Custom with Radix Table

**What:** Build from scratch using only Radix UI's Table component.

**Why consider:**
- **Zero new dependencies**
- **Perfect style match**

**Why NOT recommended:**
- **No sorting/filtering logic** - Must implement everything
- **No virtualization** - Performance issues at scale
- **Reinventing the wheel**

**Effort:** High

---

## Recommendation: TanStack Table

**Reasons:**
1. Pairs perfectly with existing Radix UI components
2. Minimal bundle impact
3. Well-documented inline editing patterns
4. Active maintenance, React 19 compatible
5. Can use Radix Select for dropdowns, Checkbox for status, etc.

---

## Implementation Plan

### Phase 1: Basic Table Setup
- Install `@tanstack/react-table`
- Create `EventsSpreadsheet.jsx` component
- Fetch events with relevant columns
- Basic sorting and filtering

### Phase 2: Inline Editing
- Event name (TextField)
- Event date (DatePicker or TextField type="datetime-local")
- Event status (Select dropdown)
- Enabled/Show in App (Checkbox)
- Event level (Select dropdown)

### Phase 3: Bulk Actions
- Multi-row selection with checkboxes
- Bulk status change
- Bulk enable/disable

### Phase 4: Polish
- Column visibility toggle
- Save column preferences to localStorage
- Export to CSV (optional)

---

## Column Suggestions

| Column | Type | Editable | Component |
|--------|------|----------|-----------|
| EID | Text | No | Badge |
| Name | Text | Yes | TextField |
| City | Text | No | Text |
| Date | DateTime | Yes | TextField type="datetime-local" |
| Status | Enum | Yes | Select (draft/published/completed/cancelled) |
| Enabled | Boolean | Yes | Checkbox |
| Show in App | Boolean | Yes | Checkbox |
| Event Level | Enum | Yes | Select |
| Tickets Sold | Number | No | Text |
| Artists Booked | Number | No | Text |

---

## Installation

```bash
npm install @tanstack/react-table
# Optional for large datasets:
npm install @tanstack/react-virtual
```

---

## Example Structure

```
src/components/
├── EventsSpreadsheet/
│   ├── EventsSpreadsheet.jsx      # Main component
│   ├── columns.jsx                 # Column definitions
│   ├── EditableCell.jsx           # Generic editable cell
│   ├── SelectCell.jsx             # Dropdown cell
│   ├── CheckboxCell.jsx           # Boolean cell
│   └── DateCell.jsx               # Date picker cell
```

---

## Resources

- [TanStack Table Docs](https://tanstack.com/table/latest)
- [TanStack Table Editable Example](https://tanstack.com/table/latest/docs/framework/react/examples/editable-data)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table) (reference implementation)
- [Radix UI Table](https://www.radix-ui.com/themes/docs/components/table)

---

## Decision Needed

Before implementation, confirm:
1. Which columns should be editable?
2. Should changes auto-save on blur, or require explicit save button?
3. Any bulk actions needed (multi-select + action)?
4. Should this replace or supplement the existing event list?
