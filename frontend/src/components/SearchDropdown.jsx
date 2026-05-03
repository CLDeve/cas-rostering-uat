import { useEffect, useMemo, useRef, useState } from 'react'

export default function SearchDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select',
  className = '',
  searchable = true,
  minWidth,
}) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => (options || []).find((item) => String(item.value) === String(value)) || null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const source = Array.isArray(options) ? options : []
    if (!searchable) return source
    const q = query.trim().toLowerCase()
    if (!q) return source
    return source.filter((item) => String(item.label).toLowerCase().includes(q))
  }, [options, query, searchable])

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div className={`search-dropdown ${className}`.trim()} ref={rootRef} style={minWidth ? { minWidth } : undefined}>
      <input
        value={open && searchable ? query : (selected?.label || '')}
        placeholder={placeholder}
        readOnly={!searchable}
        onFocus={() => {
          setOpen(true)
          if (searchable) setQuery('')
        }}
        onChange={(e) => {
          if (!searchable) return
          setQuery(e.target.value)
          setOpen(true)
        }}
      />
      <button
        type="button"
        className="search-dropdown-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle dropdown"
      >
        ▾
      </button>
      {open && (
        <div className="search-dropdown-menu">
          {filtered.length === 0 ? (
            <div className="search-dropdown-empty">No matching option</div>
          ) : (
            filtered.map((item) => (
              <button
                key={String(item.value)}
                type="button"
                className="search-dropdown-option"
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
