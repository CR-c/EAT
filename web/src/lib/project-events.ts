const projectRegistryChangedEvent = "eat:project-registry-changed"

export function emitProjectRegistryChanged() {
  window.dispatchEvent(new CustomEvent(projectRegistryChangedEvent))
}

export function subscribeProjectRegistryChanged(listener: () => void) {
  window.addEventListener(projectRegistryChangedEvent, listener)
  return () => window.removeEventListener(projectRegistryChangedEvent, listener)
}
