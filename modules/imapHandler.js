var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var Q = require('q');
var imap;
var fs = require('fs');

var imapHandler = {
  connect:function(callback){
    if(imap && imap.state && imap.state === 'authenticated'){
      return Q(true);
    }
    console.log('connecting...');
    var def = Q.defer();
    var conf = JSON.parse(fs.readFileSync('credentials/credentials2.json'));
    // conf.debug = function(s){
    //   console.log(s);
    // };
    imap = new Imap(conf);
    imap.connect();
    imap
      .once('ready',function(){
        def.resolve();
      })
      .once('error',function(err){
        console.log('imap error: '+err);
      })
      .once('end', function() {
        console.log('Connection ended');
      });
    return def.promise;
  },
  connectAndOpen:function(box_name, callback){
    var def = Q.defer();
    imapHandler.connect()
      .then(function(){
        return imapHandler.openBox(box_name);
      })
      .then(function(box){
        def.resolve(box);
        return true;
      });
    return def.promise;
  },
	disconnect:function(){
		console.log('disconnecting');
		imap.end();
	},
	openBox:function(box_name, callback){
    var def = Q.defer();
    if(imap.opened_box === box_name){
      return Q(box_name);
    }
    console.log('opening box: '+box_name+'...');
		imap.openBox(box_name, false, function(err, box){
			if (err){
				throw err;
			}
			else{
        imap.opened_box = box_name;
				def.resolve(box);
			}
		});
    return def.promise;
	},
	getUIDsFlags:function(box_name, callback){
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
      .then(function(box){
        var message_identifiers = [];
  			//var range_string = Math.max(1,(box.messages.total-Math.min(box.messages.total,50)))+':'+box.messages.total;
  			var range_string = 1+':'+box.messages.total;
  			var f = imap.seq.fetch(range_string)
          .on('message', function(msg, seqno) {
    				var message_id;
    				var uid;
            var flags;
    				msg
              .once('attributes', function(attrs) {
      					uid = attrs.uid;
                flags = (function(){
                  var out = [];
                  var flags = attrs.flags;
                  for(var i in flags){
                    if(flags.hasOwnProperty(i)){
                      out.push(flags[i]);
                    }
                  }
                  return out;
                }());
      				})
      				.once('end', function() {
    						message_identifiers.push({
    						 	uid:uid,
                  flags:flags
    						});
      				});
    			})
          .once('error', function(err) {})
  		    .once('end', function() {
  				  def.resolve(message_identifiers);
          });
  		});
    return def.promise;
	},
	getMessageWithUID:function(box_name, uid, callback){
		var def = Q.defer();
    imapHandler.getMessagesWithSearchCriteria({
      box_name:box_name,
			criteria:[['UID',parseInt(uid,10)]],
			callback_on_message:callback,
		})
    .then(function(){
      def.resolve();
    });
    return def.promise;
	},
	getMessagesWithSearchCriteria:function(conf){
		// console.log('ImapHandler: Get messages with search criteria: '+conf.criteria);
    var def = Q.defer();
    imapHandler.connectAndOpen(conf.box_name).then(function(box){
      imap.search(conf.criteria, function(err,results){
        if(err || !results || results.length === 0){
          console.log('no results found');
          if(conf.callback_on_end){
            conf.callback_on_end(false);
          }
          return;
        }
        var fetch = imap.fetch(results,{ bodies: '' });
        fetch.on('message', function(msg) {
          imapHandler.getMailObject(msg)
            .then(function(mail_object){
              if(conf.callback_on_message){
                conf.callback_on_message(mail_object);
              }
            });
        });
        fetch.once('error', function(err) {
          def.resolve();
        });
        fetch.once('end',function(){
          def.resolve();
        });
      });
    });
    return def.promise;
	},
	getMailObject: function(msg){
    var def = Q.defer();
		var parser = new MailParser();
		parser.on('end', function(mail_object){
      def.resolve(mail_object);
    });
		msg.on('body', function(stream, info) {
			stream.pipe(parser);
		});
    return def.promise;
	},
  markSeen:function(box_name, uid, callback){
    console.log('marking seen: '+uid);
    var def = Q.defer();
    imapHandler.connectAndOpen(box_name)
      .then(function(box){
        imap.addFlags(uid,['Seen'],function(err){
          def.resolve();
        });
      });
    return def.promise;
  },
  getBoxes:function(callback){
    imapHandler.connect(function(){
      imap.getBoxes(function(err, boxes){
        callback(boxes);
      });
    });
  },
  getMessageCount:function(box_name, callback){
    var deferred = Q.defer();
    imapHandler.connectAndOpen(box_name)
      .then(function(box){
        return deferred.resolve(box.messages.total);
      });
    return deferred.promise;
  }
};

module.exports = imapHandler;
