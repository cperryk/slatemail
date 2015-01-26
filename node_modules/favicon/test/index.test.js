var should  = require('should')
  , favicon = require(__dirname + '/../');

describe("favicon", function() {
  it("discovers a favicon.ico in the web site root", function(done) {
    favicon("http://nodejs.org/", function(err, url) {
      if (err) return done(err);
      url.should.eql("http://nodejs.org/favicon.ico");
      done();
    });
  });
  
  it("discovers a favicon found from a <link> tag", function(done) {
    favicon("http://hyperpolyglot.org/lisp", function(err, url) {
      if (err) return done(err);
      url.should.eql("http://hyperpolyglot.org/local--favicon/favicon.gif");
      done();
    });
  });
  
  it("can handle https protocol", function(done) {
    favicon("https://github.com/sentientwaffle/gift", function(err, url) {
      if (err) return done(err);
      url.should.eql("https://github.com/favicon.ico")
      done();
    });
  });
  
  it("handles single quotes", function(done) {
    favicon("http://hashrocket.com/articles", function(err, url) {
      if (err) return done(err);
      url.should.eql("http://hashrocket.com/favicon.png");
      done();
    });
  });
});
