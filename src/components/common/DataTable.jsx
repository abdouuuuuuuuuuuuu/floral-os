// src/components/common/DataTable.jsx
//
// A dense sortable table.
//
// Card grids are for browsing by appearance — right for Quick Sale,
// where a florist picks visually. Wrong for managing 100+ SKUs by name,
// stock and price: a grid shows about 9 items per screen where a table
// shows 25, and it makes comparison impossible because the numbers
// aren't in a column.
//
// The rule this enforces: numeric columns are right-aligned with
// tabular numerals. Without both, you can't compare figures down a
// column, which is the entire reason to use a table.

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

/**
 * @param {Array}  columns  [{ key, label, align, width, sortable, render, sortValue }]
 * @param {Array}  rows
 * @param {string} initialSort
 * @param {'asc'|'desc'} initialDir
 */
export default function DataTable({
  columns,
  rows,
  initialSort,
  initialDir = 'asc',
  onRowClick,
  rowKey = (r) => r.id,
  emptyIcon: EmptyIcon,
  emptyTitle = 'Nothing here',
  emptyHint,
  rowClassName,
  rowLabel,
}) {
  const [sort, setSort] = useState(initialSort)
  const [dir, setDir] = useState(initialDir)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort)
    if (!col) return rows

    const value = col.sortValue || ((r) => r[col.key])

    return [...rows].sort((a, b) => {
      const av = value(a)
      const bv = value(b)

      // Nulls always sort last, whichever direction — a blank isn't
      // "smallest", it's absent, and floating them to the top buries
      // the rows that have data.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'fr')

      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, dir, columns])

  const toggle = (key) => {
    if (sort === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      // Numbers usually want largest first on the first click; text
      // wants A–Z. Guessing right saves a second click almost every time.
      const col = columns.find((c) => c.key === key)
      setDir(col?.align === 'right' ? 'desc' : 'asc')
    }
  }

  if (rows.length === 0) {
    return (
      <div className="panel p-12 text-center" role="status">
        {EmptyIcon && <EmptyIcon size={36} className="mx-auto text-gray-300 mb-3" />}
        <p className="text-gray-500 font-semibold">{emptyTitle}</p>
        {emptyHint && <p className="text-gray-400 text-sm mt-1">{emptyHint}</p>}
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-sage-dark">
            {columns.map((col) => {
              const active = sort === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {col.sortable === false ? (
                    <span className="label-section">{col.label}</span>
                  ) : (
                    <button
                      onClick={() => toggle(col.key)}
                      aria-label={`Sort by ${col.label}${active ? `, ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1 label-section hover:text-gray-700 press ${
                        col.align === 'right' ? 'flex-row-reverse' : ''
                      } ${active ? 'text-primary' : ''}`}
                    >
                      {col.label}
                      {active ? (
                        dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-25" />
                      )}
                    </button>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-sage-dark">
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? (event) => {
                if (event.target.closest('button, a, input, select, textarea')) return
                onRowClick(row)
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? rowLabel?.(row) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowClick(row)
                }
              } : undefined}
              className={`${onRowClick ? 'cursor-pointer hover:bg-sage/60 focus-visible:bg-sage/60' : ''} transition-colors ${
                rowClassName ? rowClassName(row) : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 text-sm ${
                    // Right-aligned AND tabular. Without both you can't
                    // compare figures down a column.
                    col.align === 'right' ? 'text-right tabular' : 'text-left'
                  }`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
