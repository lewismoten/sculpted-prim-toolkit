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
function getDisplayName(file) {
  return file
    .replace(/\.(png)$/, '')
      .replace('Sculpty ', '')
      .replace(' Sculpty', '')
      .replace(' sculpty', '')
      .replace(' Sculpted', '')
      .replace('sculpt ', '')
      .replace(/squaring the circle \(Scupty (.*)\)/i, '$1')
      .replace('_sculpture', '')
      .replace('[DMGS] ', '')
      .replace('[Pz]', '')
      .replace(' - ', ' ')
      .replace('sculpt - ', '')
      .replace('_texture', '')
      .replace(' Texture', '')
      .replace(' texture', '')
      .replace('-skin', '')
      .trim()
}
files.sculptedPrims = readDirectory('./src/images/sculpted-prims');
files.textures = readDirectory('./src/images/textures');
if(!files.sculptedPrimNames) 
  files.sculptedPrimNames = {};
let mappedNames = Object.values(files.sculptedPrimNames);
 
files.sculptedPrims.forEach(file => {
  if(mappedNames.includes(file)) return;
  files.sculptedPrimNames[getDisplayName(file)] = file;
 });
 files.sculptedPrimNames = Object.keys(files.sculptedPrimNames).sort(compareCaseInsensitive).reduce((acc, key) => {
  acc[key] = files.sculptedPrimNames[key];
  return acc;
}
, {});

if(!files.textureNames) 
  files.textureNames = {};
 
mappedNames = Object.values(files.textureNames);
files.textures.forEach(file => {
  
  if(mappedNames.includes(file)) return;
  files.textureNames[getDisplayName(file)] = file;
 });
 files.textureNames = Object.keys(files.textureNames).sort(compareCaseInsensitive).reduce((acc, key) => {
  acc[key] = files.textureNames[key];
  return acc;
}
, {});

fs.writeFileSync('./src/files.json', JSON.stringify(files, null, 2));

