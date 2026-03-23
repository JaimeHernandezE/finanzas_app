import styles from './PantallaCarga.module.scss'

export function PantallaCarga() {
  return (
    <div className={styles.root}>
      <div className={styles.logo}>F</div>
      <p className={styles.nombre}>Finanzas</p>
      <div className={styles.spinner} />
    </div>
  )
}
