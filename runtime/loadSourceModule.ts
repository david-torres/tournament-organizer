export {};

const path = require('path');

function loadSourceModule(...segments) {
  return require(path.join(process.cwd(), ...segments));
}

module.exports = {
  loadSourceModule,
};
