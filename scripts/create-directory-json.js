const fs = require('fs');
const path = require('path');

function readDirectory(directory) {
  return fs.readdirSync(directory)
    .filter(file => fs.statSync(path.join(directory, file)).isFile())
    .sort();
};

const sculptedPrims = readDirectory('./src/images/sculpted-prims');
const textures = readDirectory('./src/images/textures');
const files = {
  sculptedPrims,
  textures
};
fs.writeFileSync('./src/files.json', JSON.stringify(files, null, 2));

