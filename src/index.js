#! /usr/bin/env node
import path from 'path';
import fs from 'fs';
import traverser from 'directory-traverser';
import { isRelative, isSuperDir, toAbsolute, isSameFile } from './utils';


const srcRoot = process.cwd();
const args = process.argv;
const fromFile = toAbsolute(args[2], srcRoot);
const toFile = toAbsolute(args[3], srcRoot);


const stat = fs.statSync(fromFile);
if (!stat) {
  help();
  throw new Error(`fromFile does not exists: ${fromFile}`);
}
if (fs.existsSync(toFile)) {
  help();
  throw new Error(`toFile already exists: ${toFile}`);
}
fs.renameSync(fromFile, toFile);

const isDirectory = stat.isDirectory(fromFile);
const subdirOld = isDirectory && fromFile;
const subdirNew = isDirectory && toFile;


function help() {
  console.error('Usage: js-refactor <from-file> <to-file>');
}


const MATCH_REQUIRE = /require\s*\(\s*['"]([\s\S]+?)['"]\s*\)/g;
const MATCH_IMPORT = /import[\s\S]+?from\s*['"](.+?)['"]/g;
const MATCH_EXPORT = /export[\s\S]+?from\s*['"](.+?)['"]/g;
const IGNORE_DIR = /\/node_modules\/?$/;
const SELECT_SOURCE_FILE = /\.js$/;

function addSuffix(dep) {
  return dep + '.js';
}

function trimSuffix(dep) {
  return dep.replace(/\.js$/, '');
}

function shouldFix(file) {
  return /^src\/|^\.\/|^\.\.\//.test(file);
}

function isRelativeToSrcRoot(file) {
  return /^src\//.test(file);
}

// traverse source file
function iterateSourceFiles(dir, options = {}, callback) {
  const { excludes = [] } = options;
  const filter = (d) => {
    if (!excludes || !excludes.length) {
      return true;
    }
    return !excludes.some((matcher) => {
      if (typeof matcher === 'function') {
        return matcher(d);
      } else if (matcher instanceof RegExp) {
        return matcher.test(d);
      }
      // 断言
      throw new Error('not a valid matcher');
    });
  };

  traverser(dir, filter, (subdir, filenames) => {
    filenames.forEach((f) => {
      if (!SELECT_SOURCE_FILE.test(f)) {
        return;
      }
      callback({ file: path.join(subdir, f) });
    });
  });
}


function fixOnlyFile() {
  console.log('fix only file\n\n');
  let fileContent = fs.readFileSync(toFile, { encoding: 'utf8' });
  [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(fileContent)) !== null) {
      const dep = m[1];
      // 其他模块/文件/包，忽略
      if (!shouldFix(dep)) {
        continue;
      }
      const isRela = isRelative(dep);
      if (!isRela) {
        continue;
      }
      const dirOld = path.dirname(fromFile);
      const dirNew = path.dirname(toFile);
      if (isSameFile(dirOld, dirNew)) {
        return;
      }
      const realDep = path.join(dirOld, dep);
      const newDep = path.relative(dirNew, realDep);
      if (isRela && !isRelative(newDep)) {
        newDep = './' + newDep;
      }

      console.log('update file: %s\n  %s\n->%s\n', toFile, dep, newDep);
      fileContent = fileContent.substr(0, m.index) + fileContent.substr(m.index).replace(dep, newDep);
      re.lastIndex += newDep.length - dep.length;
    }
  });
  fs.writeFileSync(toFile, fileContent);
}


function fixFilesDependingOnOnlyFile() {
  console.log('fix files depending on only file\n\n');
  iterateSourceFiles(srcRoot,
    { excludes: [IGNORE_DIR] },
    ({ file }) => {
    if (isSameFile(file, toFile)) {
      return;
    }
    const dir = path.dirname(file);
    let fileContent = fs.readFileSync(file, { encoding: 'utf8' });
    [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fileContent)) !== null) {
        const dep = m[1];
        // 其他模块/文件/包，忽略
        if (!shouldFix(dep)) {
          continue;
        }
        const isRela = isRelative(dep);
        const realDep = path.join(dir, dep);
        if (!isSameFile(addSuffix(realDep), fromFile)) {
          continue;
        }
        const newDep = path.relative(dir, trimSuffix(toFile));
        if (isRela && !isRelative(newDep)) {
          newDep = './' + newDep;
        }
        console.log('update file: %s\n  %s\n->%s\n', file, dep, newDep);
        fileContent = fileContent.substr(0, m.index) + fileContent.substr(m.index).replace(dep, newDep);
        re.lastIndex += newDep.length - dep.length;
      }
    });
    fs.writeFileSync(file, fileContent);
  });
}


// fix files within subdir
function fixFilesInSubdir() {
  console.log('processing internal files\n\n');
  iterateSourceFiles(subdirNew, { excludes: [IGNORE_DIR] }, ({ file }) => {
    const dir = path.dirname(file);
    const wouldBePath = path.join(subdirOld, path.relative(subdirNew, file));
    const wouldBeDir = path.dirname(wouldBePath);
    let fileContent = fs.readFileSync(file, { encoding: 'utf8' });
    [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fileContent)) !== null) {
        const dep = m[1];
        // 其他模块/文件/包，忽略
        if (!shouldFix(dep)) {
          continue;
        }
        const isRela = isRelative(dep);
        const wouldBeDep = isRelativeToSrcRoot(dep) ?
          path.join(srcRoot, dep) : path.join(wouldBeDir, dep);
        const isInnerFile = isSuperDir(subdirOld, wouldBeDep);
        if ((isRela && isInnerFile) || (!isRela && !isInnerFile)) {
          continue;
        }
        let newDep = '';
        if (isRela) {
          newDep = path.normalize(path.relative(dir, wouldBeDep));
        } else {
          newDep = path.relative(
            srcRoot,
            path.join(subdirNew, path.relative(subdirOld, wouldBeDep)));
        }

        console.log('update file: %s\n  %s\n->%s\n', file, dep, newDep);
        fileContent = fileContent.substr(0, m.index) + fileContent.substr(m.index).replace(dep, newDep);
        re.lastIndex += newDep.length - dep.length;
      }
    });
    fs.writeFileSync(file, fileContent);
  });
}


// fix files outside subdir
function fixFilesOutsideSubdir() {
  console.log('processing external files\n\n');
  iterateSourceFiles(srcRoot,
    { excludes: [d => isSuperDir(subdirNew, d), IGNORE_DIR] },
    ({ file }) => {

    const dir = path.dirname(file);
    let fileContent = fs.readFileSync(file, { encoding: 'utf8' });

    [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fileContent)) !== null) {
        const dep = m[1];
        // 其他模块/文件/包，忽略
        if (!shouldFix(dep)) {
          continue;
        }
        const isRela = isRelative(dep);
        const oldDepPath = isRelativeToSrcRoot(dep) ?
          path.join(srcRoot, dep) : path.join(dir, dep);
        const isAffected = isSuperDir(subdirOld, oldDepPath);
        if (!isAffected) {
          continue;
        }
        const newDepPath = path.join(subdirNew, path.relative(subdirOld, oldDepPath));
        let newDep = isRela ? path.normalize(path.relative(dir, newDepPath))
          : path.normalize(path.relative(srcRoot, newDepPath));
        if (isRela && !isRelative(newDep)) {
          newDep = './' + newDep;
        }
        console.log('update file: %s\n  %s\n->%s\n', file, dep, newDep);
        fileContent = fileContent.substr(0, m.index) + fileContent.substr(m.index).replace(dep, newDep);
        re.lastIndex += newDep.length - dep.length;
      }
    });
    fs.writeFileSync(file, fileContent);
  });
}

if (isDirectory) {
  fixFilesInSubdir();
  fixFilesOutsideSubdir();
} else {
  fixOnlyFile();
  fixFilesDependingOnOnlyFile();
}
