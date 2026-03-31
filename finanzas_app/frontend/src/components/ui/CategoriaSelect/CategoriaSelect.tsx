import ReactSelect, { type GroupBase, type StylesConfig } from 'react-select'

export interface CategoriaOption {
  value: string
  label: string
}

interface CategoriaRaw {
  id: number
  nombre: string
  tipo: string
  categoria_padre?: number | null
  es_padre?: boolean
}

interface Props {
  categorias: CategoriaRaw[]
  tipo: string
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
  placeholder?: string
  disabled?: boolean
}

type GroupedOption = GroupBase<CategoriaOption>

const selectStyles: StylesConfig<CategoriaOption, false, GroupedOption> = {
  control: (base, state) => ({
    ...base,
    minHeight: '2.5rem',
    borderColor: state.isFocused ? '#0f766e' : '#d1d5db',
    borderRadius: '0.5rem',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(15,118,110,0.2)' : 'none',
    backgroundColor: '#ffffff',
    fontSize: '0.9375rem',
    '&:hover': { borderColor: '#9ca3af' },
  }),
  placeholder: (base) => ({ ...base, color: '#9ca3af' }),
  option: (base, state) => ({
    ...base,
    fontSize: '0.9375rem',
    backgroundColor: state.isSelected
      ? '#0f766e'
      : state.isFocused
      ? '#ccfbf1'
      : '#ffffff',
    color: state.isSelected ? '#ffffff' : '#111827',
    cursor: 'pointer',
  }),
  groupHeading: (base) => ({
    ...base,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
    paddingTop: '0.5rem',
    paddingBottom: '0.25rem',
    backgroundColor: '#f3f4f6',
  }),
  group: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
  menu: (base) => ({ ...base, zIndex: 100, borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }),
  singleValue: (base) => ({ ...base, color: '#111827' }),
}

function buildGroupedOptions(categorias: CategoriaRaw[], tipo: string): (CategoriaOption | GroupedOption)[] {
  const porTipo = categorias.filter(c => c.tipo === tipo)
  const padres = porTipo.filter(c => c.es_padre)
  const hijas = porTipo.filter(c => !c.es_padre && c.categoria_padre != null)
  const sueltas = porTipo.filter(c => !c.es_padre && c.categoria_padre == null)

  const result: (CategoriaOption | GroupedOption)[] = []

  for (const padre of padres.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))) {
    const opciones = hijas
      .filter(h => h.categoria_padre === padre.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      .map(h => ({ value: String(h.id), label: h.nombre }))
    if (opciones.length > 0) {
      result.push({ label: padre.nombre, options: opciones })
    }
  }

  const sueltasOpciones = sueltas
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
    .map(c => ({ value: String(c.id), label: c.nombre }))

  if (sueltasOpciones.length > 0) {
    if (result.length > 0) {
      result.push({ label: 'Otras', options: sueltasOpciones })
    } else {
      result.push(...sueltasOpciones)
    }
  }

  return result
}

export default function CategoriaSelect({
  categorias,
  tipo,
  value,
  onChange,
  label,
  error,
  placeholder = 'Selecciona…',
  disabled = false,
}: Props) {
  const groupedOptions = buildGroupedOptions(categorias, tipo)

  // Busca la opción seleccionada en todos los grupos
  let selectedOption: CategoriaOption | null = null
  if (value) {
    for (const item of groupedOptions) {
      if ('options' in item) {
        const found = (item as GroupedOption).options.find(o => o.value === value)
        if (found) { selectedOption = found; break }
      } else {
        const o = item as CategoriaOption
        if (o.value === value) { selectedOption = o; break }
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {label && (
        <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
          {label}
        </label>
      )}
      <ReactSelect<CategoriaOption, false, GroupedOption>
        options={groupedOptions as GroupedOption[]}
        value={selectedOption}
        onChange={opt => onChange(opt?.value ?? '')}
        placeholder={placeholder}
        isDisabled={disabled}
        isSearchable
        noOptionsMessage={({ inputValue }) =>
          inputValue ? `Sin resultados para «${inputValue}»` : 'Sin categorías disponibles'
        }
        styles={selectStyles}
      />
      {error && (
        <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>{error}</span>
      )}
    </div>
  )
}
