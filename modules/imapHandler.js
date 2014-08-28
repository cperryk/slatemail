var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var imap;
var imapHandler = {
  connect:function(callback){
    if(imap && imap.state && imap.state === 'authenticated'){
      if(callback){
        callback();
        return;
      }
    }
    var fs = require('fs');
    var conf = JSON.parse(fs.readFileSync('credentials/credentials2.json'));
    // conf.debug = function(s){
    //   console.log(s);
    // };
    conf.port = 993;
    conf.tls = true;
    imap = new Imap(conf);
    imap.connect();
    imap.once('ready',function(){
      console.log('ready');
      if(callback){
        callback();
      }
    });
    imap.once('end', function() {
      console.log('Connection ended');
    });
  },
	disconnect:function(){
		console.log('disconnecting');
		imap.end();
	},
	openBox:function(box_name, callback){
    if(imap.opened_box === box_name){
      callback(imap._box);
      return;
    }
    console.log('OPENING BOX');
		imap.openBox(box_name, false, function(err, box){
			if (err){
				throw err;
			}
			else{
        imap.opened_box = box_name;
				callback(box);
			}
		});
	},
	getUIDsFlags:function(box_name, callback){
		console.log('get inbox message ids');
		// returns a list of objects representing emails in the inbox. These objects include both the email's UID and its Message ID
		imapHandler.connect(function(){
  		var message_identifiers = [];
  		imapHandler.openBox(box_name, function(box){
  			var range_string = Math.max(1,(box.messages.total-Math.min(box.messages.total,50)))+':'+box.messages.total;
  			var f = imap.seq.fetch(range_string);
  			f.on('message', function(msg, seqno) {
  				var message_id;
  				var uid;
          var flags;
  				msg.once('attributes', function(attrs) {
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
  				});
  				msg.once('end', function() {
						message_identifiers.push({
              // message_id:message_id,
						 	uid:uid,
              flags:flags
						});
  				});
  			});
  			f.once('error', function(err) {
  			});
  			f.once('end', function() {
  				callback(message_identifiers);
  			});
  		});
    }); // end imap.connect
	},
	getMessageWithUID:function(box_name, uid, callback){
		imapHandler.getMessagesWithSearchCriteria({
      box_name:box_name,
			criteria:[['UID',parseInt(uid,10)]],
			callback_on_message:callback
		});
	},
	getMessagesWithSearchCriteria:function(conf){
		console.log('ImapHandler: Get messages with search criteria: '+conf.criteria);
		imapHandler.openBox(conf.box_name, function(box){
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
					imapHandler.getMailObject(msg,function(mail_object){
						if(conf.callback_on_message){
							conf.callback_on_message(mail_object);
						}
					});
				});
				fetch.once('error', function(err) {
					if(conf.callback_on_end){
						conf.callback_on_end(false);
					}
				});
				fetch.once('end',function(){
					if(conf.callback_on_end){
						conf.callback_on_end();
					}
				});
			});
		});
	},
	getMailObject: function(msg,callback){
		var parser = new MailParser();
		parser.on('end', callback);
		msg.on('body', function(stream, info) {
			stream.pipe(parser);
		});
		msg.once('attributes', function(attrs) {

		});
		msg.once('end', function() {

		});
	},
  markSeen:function(box_name, uid, callback){
    console.log('marking seen: '+uid);
    imapHandler.connect(function(){
      imapHandler.openBox(box_name, function(){
        imap.addFlags(uid,['Seen'],function(err){
          if(callback){
            callback();
          }
        });
      });
    });
  },
  getBoxes:function(callback){
    imapHandler.connect(function(){
      imap.getBoxes(function(err, boxes){
        callback(boxes);
      });
    });
  },
  getMessageCount:function(box_name, callback){
    imapHandler.connect(function(){
      imapHandler.openBox(box_name, function(box){
        callback(box.messages.total);
      });
    });
  }
};

module.exports = imapHandler;
