#! /usr/bin/env node
import path from 'path';
import fs from 'fs';
import traverser from 'directory-traverser';
import { isRelative, isSuperDir } from './utils';

const args = process.argv;
const subdirOld = args[1];
const subdirNew = args[2];
const srcRoot = process.cwd();


if (fs.existsSync(subdirNew)) {
  throw new Error(`subdirNew exists: ${subdirNew}`);
}
if (!fs.existsSync(subdirOld)) {
  throw new Error(`subdirOld does not exists: ${subdirOld}`);
}
fs.renameSync(subdirOld, subdirNew);


const MATCH_REQUIRE = /require\(['"](.+?)['"]\)/g;
const MATCH_IMPORT = /import .+? from ['"](.+?)['"]/g;
const IGNORE_DIR = /\/node_modules\/?$/;
const SELECT_SOURCE_FILE = /\.js$/;

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
      } else if (re instanceof Regex) {
        return re.test(d);
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

// fix files within subdir
iterateSourceFiles(subdirNew, { excludes: [IGNORE_DIR] }, ({ file }) => {
  const dir = path.dirname(file);
  const wouldBePath = path.join(subdirOld, path.relative(subdirNew, file));
  const wouldBeDir = path.dirname(wouldBePath);
  const fileContent = fs.readFileSync(file);
  const lines = fileContent.split('\n');

  lines.forEach((line, ii) => {
    [MATCH_IMPORT, MATCH_REQUIRE].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const dep = m[0];
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

        lines[ii] = line.substr(0, m.index) + line.substr(m.index).replace(dep, newDep);
      }
    });
  });
  fs.writeFileSync(file, lines.join('\n'));
});


// fix files outside subdir
iterateSourceFiles(srcRoot,
  { excludes: [d => isSuperDir(subdirNew, d), IGNORE_DIR] },
  ({ file }) => {

  const dir = path.dirname(file);
  const fileContent = fs.readFileSync(file);
  const lines = fileContent.split('\n');

  lines.forEach((line, ii) => {
    [MATCH_IMPORT, MATCH_REQUIRE].forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const dep = m[0];
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
        const newDep = isRela ? path.relative(dir, newDepPath) : path.relative(srcRoot, newDepPath);
        lines[ii] = line.substr(0, m.index) +
          line.substr(m.index).replace(dep, path.normalize(newDep));
      }
    });
  });
  fs.writeFileSync(file, lines.join('\n'));
});
