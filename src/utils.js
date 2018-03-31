import path from 'path';
import fs from 'fs';

export function addSuffix(dep, suf = 'js') {
  if (new RegExp('\\.' + suf + '$').test(dep)) {
    return dep;
  }
  return dep + '.' + suf;
}

export function getSuffix(f = '') {
  const match = f.match(/\.([^.]+)$/);
  return match && match[1] || '';
}

export function trimSuffix(dep, suf = 'js') {
  const re = new RegExp('\\.' + suf + '$');
  return dep.replace(re, '');
}

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
  return path.normalize(f1).toLowerCase() === path.normalize(f2).toLowerCase();
}

const PARSE_FILE_NAME = /^(.*?)(@\d[xX])?\.([^.]+)$/;
function parseName(filename) {
  const match = filename.match(PARSE_FILE_NAME);
  return {
    basename: match[1],
    modifier: match[2],
    extension: match[3],
  };
}

function isPicture(type) {
  const low = type.toLowerCase();
  return low === 'png' || low === 'jpg' || low === 'gif';
}

export function depMatchFs(depPath, fsPath) {
  const filenameFs = path.basename(fsPath);
  const filenameDep = path.basename(depPath);
  const dirnameFs = path.dirname(fsPath);
  const dirnameDep = path.dirname(depPath);

  if (isSameFile(dirnameFs, depPath) && filenameFs.toLowerCase() === 'index.js') {
    return true;
  }

  const { basename, modifier, extension } = parseName(filenameFs);
  if (isSameFile(dirnameFs, dirnameDep) &&
    filenameDep === `${basename}.${extension}` &&
    isPicture(extension)) {
    return true;
  }

  return isSameFile(depPath, fsPath);
}


export function fsToDep(fsPath) {
  const filenameFs = path.basename(fsPath);
  if (filenameFs.toLowerCase() === 'index.js') {
    return path.dirname(fsPath);
  }

  const { basename, modifier, extension } = parseName(filenameFs);
  if (isPicture(extension)) {
    return path.join(path.dirname(fsPath), `${basename}.${extension}`);
  }

  return trimSuffix(fsPath, 'js');
}
