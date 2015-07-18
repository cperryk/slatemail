# es6-promisify-all
[![npm version](https://badge.fury.io/js/es6-promisify-all.svg)](http://badge.fury.io/js/es6-promisify-all)
[![Build Status](https://travis-ci.org/pgaubatz/node-es6-promisify-all.svg?branch=master)](https://travis-ci.org/pgaubatz/node-es6-promisify-all)
[![Coverage Status](https://coveralls.io/repos/pgaubatz/node-es6-promisify-all/badge.svg)](https://coveralls.io/r/pgaubatz/node-es6-promisify-all)
[![Dependency Status](https://david-dm.org/pgaubatz/node-es6-promisify-all.svg)](https://david-dm.org/pgaubatz/node-es6-promisify-all)

Promisify entire objects.  

## Installation

    npm install --save es6-promisify-all

## Usage
```javascript
var promisifyAll = require('es6-promisify-all');
var fs = promisifyAll(require('fs'));

fs.readFileAsync('myfile.js', 'utf8')
    .then(function(contents) {
        console.log(contents);
    })
    .catch(function(e) {
        console.error(e.stack);
    });
```
