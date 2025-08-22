export interface ValidateOptions {
  allowedExtensions: string[];
  maxSize: number; // in bytes
}

export function validateFile(file: File, { allowedExtensions, maxSize }: ValidateOptions): string | null {
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  const normalized = allowedExtensions.map(e => e.trim().toLowerCase());
  if (!normalized.includes(ext)) {
    return `Invalid file type. Allowed types: ${normalized.join(', ')}`;
  }

  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return `File too large. Maximum size: ${maxSizeMB}MB`;
  }

  return null;
}
