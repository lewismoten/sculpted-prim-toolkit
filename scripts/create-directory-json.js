const fs = require('fs');
const path = require('path');

const files = JSON.parse(fs.readFileSync('./src/files.json', 'utf8'));

function readDirectory(directory) {
  return fs.readdirSync(directory)
    .filter(file => fs.statSync(path.join(directory, file)).isFile())
    .sort();
};
function compareCaseInsensitive(a, b) {
  const sort = a.toLowerCase().localeCompare(b.toLowerCase());
  return sort === 0 ? a.localeCompare(b) : sort;
}

files.sculptedPrims = readDirectory('./src/images/sculpted-prims');
files.textures = readDirectory('./src/images/textures');
if(!files.sculptedPrimNames) 
  files.sculptedPrimNames = {};
 
files.sculptedPrims.forEach(file => {
  if(files.sculptedPrimNames[file]) return;

  let displayName = file
    .replace(/\.(png)$/, '')
      .replace('Sculpty ', '')
      .replace(' Sculpty', '')
      .replace(' sculpty', '')
      .replace(/squaring the circle \(Scupty (.*)\)/i, '$1')
      .replace('_sculpture', '')
      .replace('[DMGS] ', '')
      .replace('[Pz]', '')
      .replace(' - ', '')
      .replace('sculpt - ', '')
      .trim();
  files.sculptedPrimNames[displayName] = file;
 });
 files.sculptedPrimNames = Object.keys(files.sculptedPrimNames).sort(compareCaseInsensitive).reduce((acc, key) => {
  acc[key] = files.sculptedPrimNames[key];
  return acc;
}
, {});

fs.writeFileSync('./src/files.json', JSON.stringify(files, null, 2));

