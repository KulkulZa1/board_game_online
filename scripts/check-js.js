#!/usr/bin/env node
// Cross-platform JavaScript syntax check for all repo JS files.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'android', 'ios', 'dist', 'coverage']);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(path.join(dir, entry.name));
    }
  }
}

function parseFile(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.startsWith('#!')) {
    source = source.replace(/^#!.*\r?\n/, '');
  }

  // scene.js is loaded as an ES module in the browser. This checker validates
  // the module body without requiring a separate parser dependency.
  if (/^\s*import\s.+from\s+['"].+['"];?\s*$/m.test(source)) {
    source = source.replace(/^\s*import\s.+from\s+['"].+['"];?\s*$/gm, '');
  }

  new Function(source);
}

function checkJavaScriptSyntax(options = {}) {
  const files = [];
  walk(root, files);

  let failed = 0;
  for (const file of files.sort()) {
    try {
      parseFile(file);
    } catch (error) {
      failed += 1;
      console.error(`Syntax error: ${path.relative(root, file)}`);
      console.error(error.message);
    }
  }

  if (failed) {
    console.error(`JS syntax check failed: ${failed}/${files.length} files`);
    return false;
  }

  if (!options.silent) {
    console.log(`JS syntax check passed: ${files.length} files`);
  }
  return true;
}

if (require.main === module) {
  process.exit(checkJavaScriptSyntax() ? 0 : 1);
}

module.exports = { checkJavaScriptSyntax };
