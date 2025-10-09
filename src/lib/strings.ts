/**
 * String utility functions
 */

/**
 * Convert a name to title case (capitalize first letter of each word)
 * Handles multiple spaces and trims whitespace
 * 
 * @param name - Name to convert
 * @returns Title-cased name
 * 
 * @example
 * titleCaseName('john doe') // 'John Doe'
 * titleCaseName('MARY SMITH') // 'Mary Smith'
 * titleCaseName('  bob  jones  ') // 'Bob Jones'
 */
export const titleCaseName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
