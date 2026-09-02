const WHOLE_FENCE = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/;

export function stripFence(text: string): string {
  const match = WHOLE_FENCE.exec(text);
  return match ? match[1] : text;
}

export function matchEdges(original: string, replacement: string): string {
  let matched = replacement;

  if (!original.startsWith('\n')) {
    matched = matched.replace(/^\n+/, '');
  }

  if (original.endsWith('\n') && !matched.endsWith('\n')) {
    matched = `${matched}\n`;
  } else if (!original.endsWith('\n')) {
    matched = matched.replace(/\n+$/, '');
  }

  return matched;
}

/**
 * Splits a marker-delimited reply into sections, preserving each section's
 * interior whitespace. Leading indentation is content for code sections, so
 * callers trim only the sections where whitespace is noise.
 */
export function splitSections(response: string, prefix: string): Map<string, string> {
  const sections = new Map<string, string>();
  const marker = new RegExp(`^${prefix}([A-Z_]+)\\s*$`);

  let current: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      sections.set(current, buffer.join('\n'));
    }
    buffer = [];
  };

  for (const line of stripFence(response).split('\n')) {
    const match = marker.exec(line.trim());
    if (match) {
      flush();
      current = match[1];
      continue;
    }
    if (current) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}
