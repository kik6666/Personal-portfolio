export function createCertificatePreviewController({ generatePreview, onChange = () => {} } = {}) {
  if (typeof generatePreview !== 'function' || typeof onChange !== 'function') {
    throw new TypeError('Certificate preview state requires a generator and change handler.')
  }

  let pdfSelection = 0
  let pendingCount = 0
  let pdfFile = null
  let generatedPreview = null
  let manualPreview = null
  let error = null

  function getState() {
    const previewFile = manualPreview ?? generatedPreview
    const busy = pendingCount > 0
    const blockedByError = Boolean(pdfFile && error && !manualPreview)
    return Object.freeze({
      pdfFile,
      previewFile,
      previewKind: manualPreview ? 'manual' : generatedPreview ? 'generated' : null,
      busy,
      error,
      canSave: !busy && !blockedByError,
    })
  }

  function notify() {
    onChange(getState())
  }

  return Object.freeze({
    getState,

    async selectPdf(file) {
      const selection = ++pdfSelection
      pdfFile = file ?? null
      generatedPreview = null
      manualPreview = null
      error = null
      notify()
      if (!pdfFile) return

      pendingCount += 1
      notify()
      try {
        const preview = await generatePreview(pdfFile)
        if (selection === pdfSelection) generatedPreview = preview
      } catch (generationError) {
        if (selection === pdfSelection) error = generationError
      } finally {
        pendingCount -= 1
        notify()
      }
    },

    selectManualPreview(file) {
      manualPreview = file ?? null
      notify()
    },

    reset() {
      pdfSelection += 1
      pdfFile = null
      generatedPreview = null
      manualPreview = null
      error = null
      notify()
    },
  })
}
