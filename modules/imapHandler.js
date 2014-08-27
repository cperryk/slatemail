var Imap = require('imap');
var imap;
var ImapHandler = {
  connect:function(callback){
    if(imap && imap.state && imap.state === 'authenticated'){
      if(callback){
        callback();
        return;
      }
    }
    var fs = require('fs');
    var credentials = JSON.parse(fs.readFileSync('credentials/credentials2.json'));
    imap = new Imap(credentials);
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
		this.imap.end();
	},
	openInbox:function(callback){
		console.log('opening inbox');
		imap.openBox('INBOX', true, function(err, box){
			if (err){
				throw err;
			}
			else{
				callback(box);
			}
		});
	},
	getInboxMessageIDs:function(callback,range_string){
		console.log('get inbox message ids');
		// returns a list of objects representing emails in the inbox. These objects include both the email's UID and its Message ID
		ImapHandler.connect(function(){
  		var message_identifiers = [];
  		ImapHandler.openInbox(function(box){
  			var range_string = Math.max(1,(box.messages.total-Math.min(box.messages.total,50)))+':'+box.messages.total;
  			var f = imap.seq.fetch(range_string, { bodies: ['HEADER.FIELDS (MESSAGE-ID)'] });
  			f.on('message', function(msg, seqno) {
  				var message_id;
  				var uid;
  				msg.on('body', function(stream, info) {
  					var buffer = '', count = 0;
  					stream.on('data', function(chunk) {
  						count += chunk.length;
  						buffer += chunk.toString('utf8');
  					});
  					stream.once('end', function() {
  						if (info.which !== 'TEXT'){
  							var Imap = require('Imap');
  							var headers = Imap.parseHeader(buffer);
  							if(headers && headers['message-id']){
  								message_id = headers['message-id'][0];
  							}
  						}
  					});
  				});
  				msg.once('attributes', function(attrs) {
  					uid = attrs.uid;
  				});
  				msg.once('end', function() {
  					if(message_id && uid){
  						message_identifiers.push({
  							message_id:message_id,
  							uid:uid
  						});
  					}
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
	getMessageWithUID:function(uid, callback){
		this.getMessagesWithSearchCriteria({
			criteria:[['UID',parseInt(uid,10)]],
			callback_on_message:callback
		});
	},
	getMessagesWithSearchCriteria:function(conf){
		console.log('****************** get messages with search criteria: '+conf.criteria);
		var imap = this.imap;
		var self = this;
		this.openInbox(function(box){
			console.log('box open');
			self.imap.search(conf.criteria, function(err,results){
				console.log('search done');
				if(err || !results || results.length === 0){
					console.log('no results found');
					if(conf.callback_on_end){
						conf.callback_on_end(false);
					}
					return;
				}
				var fetch = imap.fetch(results,{ bodies: '' });
				fetch.on('message', function(msg) {
					self.getMailObject(msg,function(mail_object){
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
		console.log('get mail object');
		var MailParser = require("mailparser").MailParser;
		var parser = new MailParser();
		parser.on('end', function(mail_object){
			callback(mail_object);
		});
		msg.on('body', function(stream, info) {
			stream.pipe(parser);
		});
		msg.once('attributes', function(attrs) {

		});
		msg.once('end', function() {

		});
	}
};

module.exports = ImapHandler;
