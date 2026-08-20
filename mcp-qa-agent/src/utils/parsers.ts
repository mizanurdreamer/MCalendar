export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => (typeof item === 'object' && item !== null && 'text' in item ? String((item as any).text) : ''))
    .filter(Boolean)
    .join('\n');
}

export function cleanCodeOutput(rawText: string): string {
  return rawText
    .replace(/^```(?:typescript|js|ts)?\n/i, '')
    .replace(/\n```$/i, '')
    .trim();
}