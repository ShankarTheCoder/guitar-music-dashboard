import { useEffect, useRef, useState } from 'react'

export function usePullToRefresh(enabled: boolean, refresh: () => void) {
  const surface = useRef<HTMLElement>(null)
  const callback = useRef(refresh)
  const [distance, setDistance] = useState(0)
  useEffect(() => { callback.current = refresh }, [refresh])

  useEffect(() => {
    const element = surface.current
    if (!element || !enabled) { setDistance(0); return }
    let start: Touch | undefined
    let distance = 0
    const reset = () => {
      start = undefined
      distance = 0
      setDistance(0)
    }
    const begin = (event: TouchEvent) => {
      reset()
      if (event.touches.length === 1 && window.scrollY <= 1 &&
          !(event.target instanceof Element && event.target.closest('input, textarea, select, .yt-watch'))) {
        start = event.touches[0]
      }
    }
    const move = (event: TouchEvent) => {
      if (!start) return
      const touch = event.touches[0]
      if (event.touches.length !== 1 || touch.identifier !== start.identifier || window.scrollY > 1) return reset()
      const dy = touch.clientY - start.clientY
      const dx = Math.abs(touch.clientX - start.clientX)
      if (!distance && Math.max(Math.abs(dy), dx) < 4) return
      if (dy <= 0 || dx > dy || !event.cancelable) return reset()
      // Claim only a downward drag at the top, before WebView takes over scrolling.
      event.preventDefault()
      distance = Math.min(72, dy)
      setDistance(distance)
    }
    const finish = () => {
      const ready = distance >= 72
      reset()
      if (ready) callback.current()
    }
    element.addEventListener('touchstart', begin, { passive: true })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', finish)
    element.addEventListener('touchcancel', reset)
    return () => {
      element.removeEventListener('touchstart', begin)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', finish)
      element.removeEventListener('touchcancel', reset)
    }
  }, [enabled])
  return { surface, hint: distance >= 72 ? 'Release to refresh' : distance > 0 ? 'Pull to refresh' : '' }
}
