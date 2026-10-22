export function activateFilePicker(
  input: (Pick<HTMLInputElement, 'click'> & Partial<Pick<HTMLInputElement, 'showPicker'>>) | null,
  blocked = false,
): boolean {
  if (!input || blocked) return false;
  // Stay inside the original user gesture; never defer this to a timer/effect.
  // showPicker reports blocked activation on browsers that support it.
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return true;
    }
  } catch { /* Older/embedded browsers may require the synchronous click path. */ }
  try {
    input.click();
    return true;
  } catch {
    return false;
  }
}
