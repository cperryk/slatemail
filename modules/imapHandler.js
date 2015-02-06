var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var Q = require('q');
var imap;
var fs = require('fs');

var imapHandler = {
	connect:function(){
		// console.log('connecting');
		var loc_imap = imap;
		if(imap){
			// console.log(imap.state);
		}
		if(loc_imap && loc_imap.state && loc_imap.state === 'authenticated'){
			// console.log('already authenticated');
			return Q(true);
		}
		var def = Q.defer();
		var conf = JSON.parse(fs.readFileSync('credentials/credentials2.json')).internal;
		// console.log(conf);
		// conf.debug = function(s){
		//   console.log(s);
		// };
		loc_imap = new Imap(conf);
		loc_imap.connect();
		loc_imap
			.once('ready',function(){
				console.log('ready');
				def.resolve();
			})
			.once('error',function(err){
				console.log('imap error: '+err);
				console.log(err);
			})
			.once('end', function() {
				console.log('Connection ended');
			})
			.once('close', function(){
				console.log('imap connection closed');
			});
		imap = loc_imap;
		return def.promise;
	},
	setError:function(fnc){
		imap.once('error', fnc);
	},
	connectAndOpen:function(box_name){
		// console.log('connecting and opening: '+box_name);
		var def = Q.defer();
		imapHandler.connect()
			.then(function(){
				return imapHandler.openBox(box_name);
			})
			.then(function(box){
				def.resolve(box);
				return true;
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	disconnect:function(){
		// console.log('disconnecting');
		// imap.end();
	},
	openBox:function(box_name){
		var def = Q.defer();
		if(imap._box && (imap._box.name === box_name)){
			return Q(imap._box);
		}
		imap.openBox(box_name, false, function(err, box){
			// console.log('BOX IS OPEN');
			// console.log(box);
			if (err){
				console.log('error in openBox');
				console.log(err);
				throw err;
			}
			else{
				// console.log('box opened');
				def.resolve(box);
			}
		});
		return def.promise;
	},
	getUIDsFlags:function(box_name){
		// console.log('get uids flags from '+box_name);
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				// if you try to fetch on a box that doesn't have any messages,
				// the IMAP connection may break.
				console.log(box);
				if(box.messages.total === 0){
					def.resolve([]);
					return;
				}
				var message_identifiers = [];
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
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	getMessageWithUID:function(box_name, uid){
		// console.log('getting message with uid: '+uid);
		var def = Q.defer();
		var message;
		var message_found = false;
		// if(uid == 29949){
		// 	console.log('CANCELLING');
		// 	def.resolve();
		// 	return def.promise;	
		// }
		imapHandler.getMessagesWithSearchCriteria({
			box_name:box_name,
			criteria:[['UID',parseInt(uid,10)]]
		})
		.then(function(messages){
			// console.log('getting results for '+box_name+':'+uid+' search');
			if(!messages || messages.length === 0){
				// console.log('imapHandler resolving with false');
				def.resolve(false);
			}
			else{
				// console.log('imapHandler resolving with message '+box_name+':'+uid);
				def.resolve(messages[0]);
			}
		})
		.catch(function(err){
			console.log(err);
		});
		return def.promise;
	},
	getMessagesWithSearchCriteria:function(conf){
		// console.log('ImapHandler: Get messages with search criteria: '+conf.criteria);
		var def = Q.defer();
		var messages_found = 0;
		var messages = [];
		imapHandler.connectAndOpen(conf.box_name)
			.then(function(box){
				imap.search(conf.criteria, function(err,results){
					if(err || !results || results.length === 0){
						def.resolve(false);
						return;
					}
					var fetch = imap.fetch(results,{ bodies: '' });
					fetch.on('message', function(msg) {
						messages_found++;
						imapHandler.getMailObject(msg)
							.then(function(mail_object){
								messages.push(mail_object);
								if(messages.length === messages_found){
									def.resolve(messages);
								}
							})
							.catch(function(err){
								console.log(err);
							});
					});
					fetch.once('error', function(err) {
						console.log(err);
						def.resolve();
					});
					fetch.once('end',function(){
						if(messages_found===0){
							def.resolve();
						}
					});
				});
			})
			.catch(function(err){
				console.log(err);
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
	markSeen:function(box_name, uid){
		console.log('marking seen: '+uid);
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				imap.addFlags(uid,['Seen'],function(err){
					if(err){
						console.log(err);
					}
					def.resolve();
				});
			});
		return def.promise;
	},
	markDeleted:function(box_name, uid){
		console.log('marking for deletion: '+uid);
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				imap.addFlags(uid,['Deleted'],function(err){
					if(err){
						console.log(err);
					}
					def.resolve();
				});
			});
		return def.promise;
	},
	expunge:function(box_name){
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				// console.log(box_name+ 'expunged');
				imap.expunge();
				def.resolve();
			});
		return def.promise;
	},
	getBoxes:function(){
		// returns an object reflecting the organizational structure of the user's mailboxes
		var def = Q.defer();
		imapHandler.connect()
			.then(function(){
				imap.getBoxes(function(err, boxes){
					def.resolve(boxes);
				});
			});
		return def.promise;
	},
	getBoxPaths:function(){
		/* Resolves with an array of mailboxes in the user's mailbox.
			Includes only boxes that contain email.
		*/
		var def = Q.defer();
		imapHandler.getBoxes()
			.then(function(boxes){ // get the mailbox names for syncing
				var box_names = [];
				for(var i in boxes){
					if(i!=='Calendar' && i!=='Contacts' && i!=='Tasks'){ // skip these boxes as they do not have email
						addBoxes(i, boxes[i]);
					}
				}
				def.resolve(box_names);
				function addBoxes(box_path, box_properties){
					box_names.push(box_path);
					for(var i in box_properties.children){
						addBoxes(box_path+'/'+i, box_properties.children[i]);
					}
				}
			});
		return def.promise;
	},
	getMessageCount:function(box_name){
		var deferred = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				return deferred.resolve(box.messages.total);
			});
		return deferred.promise;
	},
	ensureBox:function(box_name){
		var def = Q.defer();
		imapHandler.getBoxes()
			.then(function(boxes){
				if(boxes[box_name]){
					// console.log('box already exists; ensured.');
					def.resolve();
					return true;
				}
				else{
					// console.log('box does not exist; creating');
					return imapHandler.createBox(box_name);
				}
			})
			.fin(function(){
				// console.log('box ensured');
				def.resolve();
			});
		return def.promise;
	},
	createBox:function(box_name){
		var def = Q.defer();
		imap.addBox(box_name, function(){
			def.resolve();
		});
		return def.promise;
	},
	move:function(from_box, to_box, uid){
		console.log('moving '+from_box+':'+uid+' to '+to_box);
		var def = Q.defer();
		imapHandler.ensureBox(to_box)
			.then(function(){
				return imapHandler.connectAndOpen(from_box);
			})
			.then(function(){
				imap.move(uid, to_box, function(err){
					if(err){
						console.log(err);
					}
					return true;
				});
			})
			.catch(function(err){
				console.log(err);
			})
			.fin(function(){
				console.log('move complete');
				def.resolve();
			});
//		imapHandler.connectAndOpen(from_box)
//			.then(function(){
//				imap.move(uid, to_box, function(){
//					def.resolve();
//				});
//			})
		return def.promise;
	},
	addKeywords:function(box_name, uid, keywords){
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				console.log(box);
				console.log('adding keywords '+box_name+':'+uid+' '+keywords);
				imap.setKeywords(uid, keywords, function(err){
					if(err){
						console.log(err);
					}
					def.resolve();
				});
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	addMessageToBox:function(box_name, message_data){
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				imap.append(message_data, function(){
					console.log('message appended to box');
					def.resolve();
				});
			});
		return def.promise;
	}
};

module.exports = imapHandler;
