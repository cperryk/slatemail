var request = require('request')
  , Url     = require('url');


// Public: Find the URL of a web site's favicon.
// 
// url      - The String web site URL.
// callback - Receives `(err, favicon_url)`. `favicon_url` will be a
//            String if an icon is discovered, and `null` otherwise.
// 
// Examples:
// 
//   favicon("http://nodejs.org/", function(err, favicon_url) {
//     
//   });
// 
// Returns Nothing.
module.exports = function(url, callback) {
  var p    = Url.parse(url)
    , root = p.protocol + "//" + p.host
    , ico  = root + "/favicon.ico";
  
  // Check the root of the web site.
  does_it_render(ico, function(err, renders) {
    if (err) return callback(err);
    if (renders) return callback(null, ico);
    
    // Check for <link rel="icon" href="???"> tags to indicate
    // the location of the favicon.
    request(root, function(err, res, body) {
      var link_re = /<link (.*)>/gi
        , rel_re  = /rel=["'][^"]*icon[^"']*["']/i
        , href_re = /href=["']([^"']*)["']/i
        , match, ico_match;
      
      while (match = link_re.exec(body)) {
        if (rel_re.test(match[1]) && (ico_match = href_re.exec(match[1]))) {
          ico = ico_match[1];
          if (ico[0] == "/") {
            ico = root + ico;
          }
          return callback(null, ico);
        }
      }
      
      // No favicon could be found.
      return callback(null, null);
    });
  });
};


// Internal: Check the status code.
function does_it_render(url, callback) {
  request(url, function(err, res, body) {
    if (err) return callback(err);
    callback(null, res.statusCode == 200);
  });
}

