import { useGame } from '../store'

export function Toast() {
  const toast = useGame((state) => state.toast)
  if (!toast) return null
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  )
}
