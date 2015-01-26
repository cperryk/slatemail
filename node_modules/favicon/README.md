# Favicon

[![Build Status](https://secure.travis-ci.org/sentientwaffle/node-favicon.png?branch=master)](http://travis-ci.org/sentientwaffle/node-favicon)

A Node.js module for finding the URL of a web site's
[favicon](http://en.wikipedia.org/wiki/Favicon).

# Installation

    $ npm install favicon

# Usage

In this example, `favicon_url` is a `String` if an icon is found, or
`null` otherwise.

    var favicon = require('favicon');
    
    favicon("http://nodejs.org/", function(err, favicon_url) {
      // ...
    });

# License

See LICENSE.
