import { onMounted, onUnmounted, type Ref } from 'vue'

/** Calls `close` on a click outside `root` or on Escape. */
export function useDismiss(root: Ref<HTMLElement | null>, close: () => void) {
  function onPointerDown(event: PointerEvent) {
    if (!root.value?.contains(event.target as Node)) close()
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
  }
  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
  })
  onUnmounted(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  })
}
