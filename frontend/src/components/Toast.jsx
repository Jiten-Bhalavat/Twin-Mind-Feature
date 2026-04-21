import { useEffect, useState } from 'react'
import useAppStore from '../store/useAppStore'

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onRemove, 300)
    }, toast.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [])

  const styles = {
    error:   'bg-red-500/15 border-red-500/30 text-red-300',
    warning: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    info:    'bg-blue-500/15 border-blue-500/30 text-blue-300',
  }

  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm shadow-lg transition-all duration-300 max-w-sm ${styles[toast.type] ?? styles.info} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <span className="shrink-0 mt-0.5">
        {toast.type === 'error' && '✕'}
        {toast.type === 'warning' && '⚠'}
        {toast.type === 'success' && '✓'}
        {toast.type === 'info' && 'ℹ'}
      </span>
      <p className="leading-snug">{toast.message}</p>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useAppStore()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
