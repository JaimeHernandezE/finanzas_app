import { useId, forwardRef } from 'react'
import { formatoMontoClpMostrar, normalizarDigitosMontoClp } from '@/utils/montoClp'
import inputStyles from '../Input/Input.module.scss'
import styles from './InputMontoClp.module.scss'

export interface InputMontoClpProps {
  /** Solo dígitos, ej. "5000" o "" */
  value: string
  onChange: (soloDigitos: string) => void
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  /** Clase del &lt;input&gt; (p. ej. inputs en línea en tablas) */
  inputClassName?: string
  autoFocus?: boolean
  'aria-label'?: string
  /** Solo el &lt;input&gt;, sin label/errores (filas horizontales) */
  soloInput?: boolean
}

/**
 * Monto en pesos chilenos: muestra $x.xxx.xxx, sin flechas (text + inputMode numeric).
 */
const InputMontoClp = forwardRef<HTMLInputElement, InputMontoClpProps>(
  (
    {
      value,
      onChange,
      label,
      error,
      helperText,
      required,
      disabled,
      id,
      name,
      className,
      inputClassName,
      autoFocus,
      'aria-label': ariaLabel,
      soloInput,
    },
    ref
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`
    const helperId = `${inputId}-helper`

    const display = formatoMontoClpMostrar(value)

    const inputEl = (
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel ?? (label ? undefined : 'Monto en pesos chilenos')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          soloInput ? undefined : error ? errorId : helperText ? helperId : undefined
        }
        className={[
          inputStyles.input,
          styles.inputMonto,
          error ? inputStyles['input--error'] : '',
          inputClassName ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        value={display}
        onChange={(e) => onChange(normalizarDigitosMontoClp(e.target.value))}
        autoFocus={autoFocus}
      />
    )

    if (soloInput) {
      return inputEl
    }

    return (
      <div className={[inputStyles.field, styles.wrap, className].filter(Boolean).join(' ')}>
        {label && (
          <label htmlFor={inputId} className={inputStyles.label}>
            {label}
            {required && (
              <span className={inputStyles.required} aria-hidden="true">
                {' '}
                *
              </span>
            )}
          </label>
        )}

        {inputEl}

        {error && (
          <span id={errorId} className={inputStyles.errorText} role="alert">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} className={inputStyles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    )
  }
)

InputMontoClp.displayName = 'InputMontoClp'
export default InputMontoClp
