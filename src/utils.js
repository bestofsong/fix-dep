import path from 'path';
import fs from 'fs';

// utils
export function isRelative(file) {
  return /^\.\/|\.\.\//.test(file);
}

function addTrailingSlash(dir) {
  if (/\/$/.test(dir)) {
    return dir;
  }
  return `${dir}/`;
}

export function isSuperDir(superDir, childDir) {
  return addTrailingSlash(childDir)
    .startsWith(addTrailingSlash(superDir));
}

export function toAbsolute(f, b) {
  if (path.isAbsolute(f)) {
    return f;
  }
  return path.join(b, f);
}

export function isSameFile(f1, f2) {
  return path.normalize(f1) === path.normalize(f2);
}
