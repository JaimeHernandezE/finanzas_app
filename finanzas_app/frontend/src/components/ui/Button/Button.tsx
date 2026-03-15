import { forwardRef } from 'react'
import styles from './Button.module.scss'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const classes = [
      styles.button,
      styles[`button--${variant}`],
      styles[`button--${size}`],
      fullWidth ? styles['button--full'] : '',
      loading ? styles['button--loading'] : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && <span className={styles.spinner} aria-hidden />}
        <span className={loading ? styles.children__hidden : undefined}>
          {children}
        </span>
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
