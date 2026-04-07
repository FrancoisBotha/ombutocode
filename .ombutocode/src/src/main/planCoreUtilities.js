'use strict';

const path = require('path');

let PROJECT_ROOT = null;
let DOCS_DIR = null;

function init(projectRoot) {
  PROJECT_ROOT = projectRoot;
  DOCS_DIR = path.join(projectRoot, 'docs');
}

module.exports = {
  init,
  get PROJECT_ROOT() { return PROJECT_ROOT; },
  get DOCS_DIR() { return DOCS_DIR; },
};
