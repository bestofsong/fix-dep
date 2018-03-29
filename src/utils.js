import path from 'path';
import fs from 'fs';

// utils
export function isRelative(file) {
  return /^\.\/|\.\.\//.test(file);
}

export function isSuperDir(superDir, childDir) {
  let norm1 = path.normalize(superDir);
  const norm2 = path.normalize(childDir);
  if (!/\/$/.test(norm1)) {
    norm1 = `${norm1}/`;
  }
  return norm2.startsWith(norm1);
}
