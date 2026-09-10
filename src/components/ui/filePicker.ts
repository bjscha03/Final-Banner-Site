export function activateFilePicker(
  input: Pick<HTMLInputElement, 'click'> | null,
  blocked = false,
): boolean {
  if (!input || blocked) return false;
  input.click();
  return true;
}
