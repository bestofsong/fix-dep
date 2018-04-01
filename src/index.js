#! /usr/bin/env node
import path from 'path';
import fs from 'fs';
import traverser from 'directory-traverser';
import { resolveDep, useImplicitPrefix } from './module_resolver';
import {
  isRelative,
  isSuperDir,
  toAbsolute,
  isSameFile,
  depMatchFs,
  addSuffix,
  trimSuffix,
  fsToDep,
  getSuffix,
} from './utils';


const srcRoot = process.cwd();
const args = process.argv;
const fromFile = toAbsolute(args[2], srcRoot);
let toFile = toAbsolute(args[3], srcRoot);

(function checkFromFile() {
  fs.statSync(fromFile);
})();

(function checkAndFixToFile() {
  try {
    const stat2 = fs.statSync(toFile);
    if (stat2.isDirectory()) {
      toFile = path.join(toFile, path.basename(fromFile));
      if (fs.existsSync(toFile)) {
        throw new Error('目标文件已存在，不允许覆盖');
      }
    } else {
      help();
      throw new Error(`toFile already exists and is a plain file: ${toFile}`);
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      return;
    }
    throw e;
  }
})();

const isDirectory = fs.statSync(fromFile).isDirectory();
const subdirOld = isDirectory && fromFile;
const subdirNew = isDirectory && toFile;

function help() {
  console.error('Usage: js-refactor <from-file-or-directory> <to-file-or-directory>');
}


const MATCH_REQUIRE = /require\s*\(\s*['"]([\s\S]+?)['"]\s*\)/g;
const MATCH_IMPORT = /import[\s\S]+?from\s*['"](.+?)['"]/g;
const MATCH_EXPORT = /export[\s\S]+?from\s*['"](.+?)['"]/g;
const IGNORE_DIR = /\/node_modules\/?$/;
const SELECT_SOURCE_FILE = /\.js$/;


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
  if ((getSuffix(toFile) || '').toLowerCase() !== 'js') {
    return;
  }
  console.log('fix only file...\n\n');
  let fileContent = fs.readFileSync(fromFile, { encoding: 'utf8' });
  [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(fileContent)) !== null) {
      const dep = m[1];
      const isRela = isRelative(dep);
      // 移动单个文件不影响该文件对其他module的绝对路径导入
      if (!isRela) {
        continue;
      }
      const dirOld = path.dirname(fromFile);
      const dirNew = path.dirname(toFile);
      if (isSameFile(dirOld, dirNew)) {
        return;
      }
      const realDep = path.join(dirOld, dep);
      let newDep = path.relative(dirNew, realDep);
      if (isRela && !isRelative(newDep)) {
        newDep = './' + newDep;
      }

      console.log('update file: %s\n  %s\n->%s\n', toFile, dep, newDep);
      fileContent = fileContent.substr(0, m.index) + fileContent.substr(m.index).replace(dep, newDep);
      re.lastIndex += newDep.length - dep.length;
    }
  });
  fs.writeFileSync(fromFile, fileContent);
}


function fixFilesDependingOnOnlyFile() {
  console.log('fix files depending on only file...\n\n');
  iterateSourceFiles(srcRoot,
    { excludes: [IGNORE_DIR] },
    ({ file }) => {
    if (isSameFile(file, fromFile)) {
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
        const isRela = isRelative(dep);
        const resolvePath = resolveDep(dir, dep);
        if (!resolvePath) {
          continue;
        }

        if (!depMatchFs(resolvePath, fromFile)) {
          continue;
        }
        const fixDep = fsToDep(toFile);
        let newDep = isRela ? path.relative(dir, fixDep) : useImplicitPrefix(fixDep);
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
  console.log('processing internal files...\n\n');
  iterateSourceFiles(subdirOld, { excludes: [IGNORE_DIR] }, ({ file }) => {
    const dir = path.dirname(file);
    const wouldBePath = path.join(subdirNew, path.relative(subdirOld, file));
    const wouldBeDir = path.dirname(wouldBePath);
    let fileContent = fs.readFileSync(file, { encoding: 'utf8' });
    [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fileContent)) !== null) {
        const dep = m[1];
        // 其他模块/文件/包，忽略
        const resolvePath = resolveDep(dir, dep);
        if (!resolvePath) {
          continue;
        }
        const isRela = isRelative(dep);
        const isInnerFile = isSuperDir(subdirOld, resolvePath);
        if ((isRela && isInnerFile) || (!isRela && !isInnerFile)) {
          continue;
        }
        let newDep = '';
        if (isRela) {
          newDep = path.normalize(
            path.relative(wouldBeDir, path.join(dir, dep))
          );
        } else {
          newDep = useImplicitPrefix(fsToDep(
            path.join(subdirNew, path.relative(subdirOld, resolvePath))
          ));
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
  console.log('processing external files...\n\n');
  iterateSourceFiles(srcRoot,
    { excludes: [d => isSuperDir(subdirOld, d), IGNORE_DIR] },
    ({ file }) => {

    const dir = path.dirname(file);
    let fileContent = fs.readFileSync(file, { encoding: 'utf8' });

    [MATCH_IMPORT, MATCH_REQUIRE, MATCH_EXPORT].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fileContent)) !== null) {
        const dep = m[1];
        // 其他模块/文件/包，忽略
        const resolvePath = resolveDep(dir, dep);
        if (!resolvePath) {
          continue;
        }
        const isRela = isRelative(dep);
        const isInnerFile = isSuperDir(subdirOld, resolvePath);
        if (!isInnerFile) {
          continue;
        }

        const newPath = path.join(subdirNew, path.relative(subdirOld, resolvePath));
        let newDep = isRela ? path.normalize(
          path.relative(dir, fsToDep(newPath))
        ) : useImplicitPrefix(fsToDep(newPath));
        if (isRela && !isRelative(newDep)) {
          newDep = `./${newDep}`;
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
fs.renameSync(fromFile, toFile);
