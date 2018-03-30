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
