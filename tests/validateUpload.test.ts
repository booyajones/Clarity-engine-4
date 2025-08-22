import { describe, it, expect } from 'vitest';
import { validateFile } from '../client/src/lib/validateUpload';

describe('validateFile', () => {
  it('returns null for valid files', () => {
    const file = new File(['data'], 'test.csv');
    const result = validateFile(file, {
      allowedExtensions: ['.csv'],
      maxSize: 1024,
    });
    expect(result).toBeNull();
  });

  it('rejects invalid file types', () => {
    const file = new File(['data'], 'test.txt');
    const result = validateFile(file, {
      allowedExtensions: ['.csv'],
      maxSize: 1024,
    });
    expect(result).toMatch(/Invalid file type/);
  });

  it('rejects files that are too large', () => {
    const file = new File([new Uint8Array(2)], 'test.csv');
    const result = validateFile(file, {
      allowedExtensions: ['.csv'],
      maxSize: 1,
    });
    expect(result).toMatch(/File too large/);
  });
});
