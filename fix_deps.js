#! /usr/bin/env node
import path from 'path';
import fs from 'fs';


const args = process.argv;
const subdirOld = args[2];
const subdirNew = args[3];

const srcRoot = process.cwd();


const MATCH_REQUIRE = /require\(['"](.+?)['"]\)/g;
const MATCH_IMPORT = /import .+? from ['"](.+?)['"]/g;
const IGNORE_DIR = /node_modules\/?$/;

function shouldFix(file) {
  return /^(src\/)|\.\/|\.\.\//.test(file);
}

function isRelativeToSrcRoot(file) {
  return /^src\//.test(file);
}

// utils
function isRelative(file) {
  return /^\.\/|\.\.\//.test(file);
}

function isSuperDir(superDir, childDir) {
  let norm1 = path.normalize(superDir);
  const norm2 = path.normalize(childDir);
  if (!/\/$/.test(norm1)) {
    norm1 = `${norm1}/`;
  }
  return norm2.startsWith(norm1);
}

// traverse source file
function iterateImportLines(dir, options = {}, callback) {
  const { excludes } = options;
}

// fix files within subdir
iterateImportLines(subdirNew, { excludes: [IGNORE_DIR] }, ({ file }) => {
  const dir = path.dirname(file);
  const wouldBePath = path.join(subdirOld, path.relative(subdirNew, file));
  const wouldBeDir = path.dirname(wouldBePath);
  const fileContent = fs.readfileSync(file);
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
        if (isRela && isInnerFile) {
          continue;
        }

        let newDep = '';
        if (isRela) {
          newDep = path.relative()
        }
      }
    });
  });
  fs.writefileSync(file, lines.join('\n'));
});

// fix files outside subdir
iterateImportLines(srcRoot,
  { excludes: [new Regex(subdirNew), IGNORE_DIR] },
  ({ file }) => {
});
