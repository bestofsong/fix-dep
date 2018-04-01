import path from 'path';
import fs from 'fs';
import {
  isRelative,
  addSuffix,
  getSuffix,
  addTrailingSlash,
} from './utils';

function getImplicitPrefixes() {
  const babelConfigFile = path.join(process.cwd(), '.babelrc');
  if (!fs.existsSync(babelConfigFile)) {
    return null;
  }

  try {
    const { plugins = [] } = JSON.parse(fs.readFileSync(babelConfigFile, { encoding: 'utf8' }));
    const moduleResolver = plugins.find((item) => {
      if (!Array.isArray(item)) {
        return false;
      } else {
        return item[0] === 'module-resolver';
      }
    });

    if (!moduleResolver) {
      return null;
    }

    return moduleResolver[1];
  } catch (e) {
    console.error('failed to read .babelrc, error: ', e.toString());
    return null;
  }
}

const MODULE_RESOLVER_CONF = getImplicitPrefixes() || {};
export function resolveDep(dir, dep) {
  if (isRelative(dep)) {
    const suf = getSuffix(dep);
    const joined = path.join(dir, dep);
    if (!suf || suf === 'js') {
      return resolveFullpathJsModule(joined);
    } else {
      return joined;
    }
  }

  // 绝对路径导入都是用的require('相对路径')的形式
  let ret = '';

  ret = testWithRoot(dir, dep);
  if (ret) {
    return ret;
  }

  ret = testWithAlias(dir, dep);
  if (ret) {
    return ret;
  }

  return '';
}

function resolveFullpathJsModule(fullpath) {
  const isExists = fs.existsSync(fullpath);
  // fixme: 支持图片？
  const isDir = isExists ? fs.statSync(fullpath).isDirectory() : false;
  const addIndexJs = isDir && path.join(fullpath, 'index.js');
  if (isDir && fs.existsSync(addIndexJs)) {
    return addIndexJs;
  }

  const addJs = addSuffix(fullpath, 'js');
  if (fs.existsSync(addJs)) {
    return addJs;
  }

  return '';
}

const CURRENT_WD = process.cwd();
function testWithRoot(dir, dep) {
  const { root = [] } = MODULE_RESOLVER_CONF;
  for (let ii = 0; ii < root.length; ii++) {
    const item = root[ii];
    const tryPath = path.join(CURRENT_WD, path.join(item, dep));
    const resolveFullPathRes = resolveFullpathJsModule(tryPath);
    if (resolveFullPathRes) {
      return resolveFullPathRes;
    }
  }
  return '';
}

function testWithAlias(dir, dep) {
  const { alias = {} } = MODULE_RESOLVER_CONF;
  const firstPart = dep.split('/')[0];
  const hit = alias[firstPart];
  if (!hit) {
    return '';
  }

  const tryPath = path.join(CURRENT_WD, path.join(hit, dep));
  const resolveFullPathRes = resolveFullpathJsModule(tryPath);
  if (resolveFullPathRes) {
    return resolveFullPathRes;
  }

  return '';
}

export function useImplicitPrefix(p) {
  let ret;
  ret = tryWithRoot(p);
  if (ret) {
    return ret;
  }

  ret = tryWithAlias(p);
  if (ret) {
    return ret;
  }
  throw new Error('no supposed to happen');
}

function tryWithRoot(p) {
  const { root = [] } = MODULE_RESOLVER_CONF;
  for (let ii = 0; ii < root.length; ii++) {
    const item = root[ii];
    const tryPath = addTrailingSlash(path.join(CURRENT_WD, item));
    if (path.normalize(p).startsWith(path.normalize(tryPath))) {
      return path.relative(tryPath, p);
    }
  }
}

function tryWithAlias(p) {
  const { alias = {} } = MODULE_RESOLVER_CONF;
  const keys = Object.keys(alias);
  for (let ii = 0; ii < keys.length; ii++) {
    const aliasName = keys[ii];
    const aliasValue = alias[aliasName];
    const tryPath = addTrailingSlash(path.join(CURRENT_WD, aliasValue));
    if (path.normalize(p).startsWith(path.normalize(tryPath))) {
      return path.join(aliasName, path.relative(tryPath, p));
    }
  }
}
