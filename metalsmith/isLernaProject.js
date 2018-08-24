const fs = require('fs');
const path = require('path');

function isLernaProject() {
  return fs.existsSync(
    path.resolve(
      path.join(
        process.cwd(),
        '..',
        '..',
        'lerna.json'
      )
    )
  )
}

module.exports = isLernaProject;
