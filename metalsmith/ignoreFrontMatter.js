// https://github.com/jxson/front-matter/blob/master/index.js#L2-L13
const optionalByteOrderMark = '\\ufeff?'
const pattern = '^(' +
  optionalByteOrderMark +
  '(= yaml =|---)' +
  '$([\\s\\S]*?)' +
  '^(?:\\2|\\.\\.\\.)' +
  '$' +
  (process.platform === 'win32' ? '\\r?' : '') +
  '(?:\\n)?)'
// NOTE: If this pattern uses the 'g' flag the `regex` variable definition will
// need to be moved down into the functions that use it.
const regex = new RegExp(pattern, 'm');

function ignoreFrontMatter(file) {
  return file.replace(regex, '')
}

module.exports = ignoreFrontMatter;
