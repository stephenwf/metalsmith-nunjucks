const fs = require('fs');
const path = require('path');
const nunjucks = require('nunjucks');
const ignoreFrontMatter = require('./ignoreFrontMatter');
const isLernaProject = require('./isLernaProject');

const NodeLoader = nunjucks.FileSystemLoader.extend({
  init(searchPaths, opts) {
    this.reporter = opts ? opts.reporter : {};
    nunjucks.FileSystemLoader.prototype.init.call(this, searchPaths, opts);
  },
  resolve(from, to) {
    return ['', ...this.searchPaths].reduce((found, next) => {
      if (found) return found;
      const pathParsed = path.parse(from);
      if (fs.existsSync(path.resolve(path.join(next, pathParsed.dir, to)))) {
        return path.resolve(path.join(next, pathParsed.dir, to));
      }
      if (fs.existsSync(path.resolve(path.join(next, from, to)))) {
        return path.resolve(path.join(next, from, to));
      }
    }, null);
  },
  getSource(name) {
    let fullPath = null;
    const paths = this.searchPaths;

    for (let i = 0; i < paths.length; i++) {
      const p = path.resolve(paths[i], name);

      if (fs.existsSync(p)) {
        fullPath = p;
        break;
      }
    }

    if (!fullPath) {
      try {
        fullPath = require.resolve(path.join(process.cwd(), 'node_modules', name));
        this.reporter[name] = fullPath;
      } catch (err) {
      }
    }

    // Lerna
    if (!fullPath && isLernaProject()) {
      try {
        fullPath = require.resolve(path.join(process.cwd(), '..', '..', 'node_modules', name));
        this.reporter[name] = fullPath;
      } catch (err) {
      }
    }

    if (!fullPath) {
      return null;
    }

    this.pathsToNames[fullPath] = name;

    return {
      src: ignoreFrontMatter(fs.readFileSync(fullPath, 'utf-8')),
      path: fullPath,
      noCache: this.noCache
    };
  }
});

module.exports = NodeLoader;
