var MailParser = require("mailparser").MailParser;
var imapHandler = require("./imapHandler.js");
var fs = require('fs-extra');
var step = require('step');
var Q = require('q');
var box_names = [];
var db;
var indexedDB = window.indexedDB;
var async = require('async');

// careful. console.log(mail_obj) may crash node-webkit with no errors. Perhaps because mail_objs may be huge.

// to-do: build routine to ensure deleted mailboxes are deleted locally

var dbHandler = {

deleteDB:function(db_name, callback){
	var req = indexedDB.deleteDatabase(db_name);
	req.onsuccess = function () {
		console.log("Deleted database successfully");
		if(callback){
			callback();
		}
	};
	req.onerror = function () {
		console.log("Couldn't delete database");
		if(callback){
			callback();
		}
	};
	req.onblocked = function () {
		console.log("Couldn't delete database due to the operation being blocked");
		if(callback){
			callback();
		}
	};
},
connect:function(callback){
	var def = Q.defer();
	var request = indexedDB.open("slatemail");
	request.onupgradeneeded = function(){
		console.log('upgrade needed');
		db = request.result;
		db.createObjectStore("threads", {keyPath:"thread_id", autoIncrement: true});
		db.createObjectStore("contacts", {keyPath:"address"});
		console.log('database created with threads store');
	};
	request.onsuccess = function(){
		db = request.result;
		def.resolve();
	};
	return def.promise;
},
ensureLocalBox:function(mailbox_name, callback){
	var def = Q.defer();
	console.log('creating local box');
	if(db.objectStoreNames.contains("box_"+mailbox_name)){
		def.resolve();
		return def.promise;
	}
	var version =  parseInt(db.version);
	console.log(db);
	console.log('closing database');
	db.close();
	console.log(db);
	console.log('opening databse');
	var open_request = indexedDB.open('slatemail', version+1);
	open_request.onupgradeneeded = function () {
		console.log('upgrade needed');
		db = open_request.result;
		var objectStore = db.createObjectStore('box_'+mailbox_name, {
			keyPath: 'uid'
		});
		objectStore.createIndex("message_id", "messageId", { unique: false });
		objectStore.createIndex("subject", "subject", { unique: false });
		objectStore.createIndex("uid","uid", {unique:true});
	};
	open_request.onsuccess = function (e) {
		console.log('local mailbox '+mailbox_name+'created');
		def.resolve();
	};
	return def.promise;
},
saveMailToLocalBox:function(mailbox_name, mail_obj, callback){
	console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
	// console.log(mail_obj);
	dbHandler.saveAttachments(mailbox_name, mail_obj, function(){
		var tx = db.transaction("box_"+mailbox_name,"readwrite");
		var store = tx.objectStore("box_"+mailbox_name);
		store.put(mail_obj);
		// console.log('database insertion successful');
		dbHandler.threadMail(mailbox_name, mail_obj, callback);
	});
	// saveContact(mail_obj);
},
saveContact:function(mail_obj){
	var sender = mail_obj.from[0];
	var sender_name = sender.name;
	var sender_address = sender.address;
	var data_to_store = {
		address:sender_address,
		name:sender_name
	};
	var tx = db.transaction("contacts","readonly");
	var store = tx.objectStore("contacts");
	var request = store.put(data_to_store);
	request.onsuccess = function(){
		console.log('contact stored: '+sender_address);
	};
},
threadMail:function(mailbox_name, mail_obj, callback){
	var mail_uid = mail_obj.uid;
	// console.log('threading message '+mailbox_name+':'+mail_uid);
	traceInReplyTo(function(thread_id){
		if(!thread_id){
			traceReferences(function(thread_id){
				if(!thread_id){
					saveMailObjectToNewThread(mail_obj, function(thread_id){
						updateMailWithThreadID(mailbox_name, mail_uid, thread_id, callback);
					});
				}
				else{
					saveToExistingThread(thread_id, callback);
				}
			});
		}
		else{
			saveToExistingThread(thread_id, callback);
		}
	});
	function saveToExistingThread(thread_id, callback){
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var get_request = store.get(thread_id);
		get_request.onsuccess = function(){
			// console.log('existing thread found');
			var data = get_request.result;
			data.thread_id = thread_id;
			data.messages.push(mailbox_name+':'+mail_uid);
			var request_update = store.put(data);
			request_update.onsuccess = function(){
				// console.log('saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
				updateMailWithThreadID(mailbox_name, mail_uid, thread_id, callback);
			};
		};
	}
	function saveMailObjectToNewThread(mail_obj, callback){
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var data = {
			messages:[mailbox_name+':'+mail_uid]
		};
		var add_request = store.add(data);
		add_request.onsuccess = function(event){
			var thread_id = event.target.result;
			// console.log('saved message '+mailbox_name+mail_uid+' to new thread '+thread_id);
			mail_obj.thread_id = event.target.result;
			if(callback){
				callback(mail_obj.thread_id);
			}
		};
	}
	function traceInReplyTo(callback){
		if(!mail_obj.inReplyTo || mail_obj.inReplyTo.length === 0){
			callback(false);
		}
		else{
			traceMessage(mail_obj.inReplyTo, 0, callback);
		}
	}
	function traceReferences(callback){
		if(!mail_obj.references || mail_obj.references.length === 0){
			callback(false);
		}
		else{
			traceMessage(mail_obj.references, 0, callback);
		}
	}
	function traceMessage(message_ids, current_index, callback){
		var message_id = message_ids[current_index];
		dbHandler.findMailWithMessageID(message_id, function(mail_object){
			if(mail_object === false){
				if(current_index < message_ids.length - 1){
					traceMessage(message_ids, current_index+1, callback);
				}
				else{
					callback(false);
				}
			}
			else if(!mail_object.thread_id){
				traceMessage(message_ids, current_index+1, callback);
			}
			else{
				callback(mail_object.thread_id);
			}
		});
	}
	function updateMailWithThreadID(box_name, uid, thread_id, callback){
		var tx = db.transaction("box_"+box_name,"readwrite");
		var store = tx.objectStore("box_"+box_name);
		var get_request = store.get(uid);
		get_request.onsuccess = function(){
			var data = get_request.result;
			data.thread_id = thread_id;
			var update_request = store.put(data);
			update_request.onsuccess = function(){
				if(callback){
					callback();
				}
			};
		};
	}
},
findMailWithMessageID:function(message_id, callback){
	dbHandler.getMailFromBoxWithMessageId('INBOX', message_id, callback);
},
getMailFromBoxWithMessageId:function(mailbox_name, message_id, callback){
	var tx = db.transaction('box_'+mailbox_name,"readonly");
	var store = tx.objectStore('box_'+mailbox_name);
	var index = store.index('message_id');
	var get_request = index.get(message_id);
	get_request.onsuccess = function(){
		var matching = get_request.result;
		if(matching!==undefined){
			callback(get_request.result);
		}
		else{
			callback(false);
		}
	};
},
getMailFromLocalBox:function(mailbox_name, uid){
	// console.log('getting mail from local box '+mailbox_name+': '+uid);
	var def = Q.defer();
	var tx = db.transaction("box_"+mailbox_name,"readonly");
	var store = tx.objectStore("box_"+mailbox_name);
	var request = store.get(uid);
	request.onsuccess = function(){
		var matching = request.result;
		if(matching!==undefined){
			def.resolve(request.result);
		}
		else{
			def.resolve(false);
		}
	};
	return def.promise;
},
updateFlags:function(box_name, uid, flags, callback){
	console.log('updating flags on '+box_name+':'+uid);
	var tx = db.transaction("box_"+box_name,"readwrite");
	var store = tx.objectStore("box_"+box_name);
	var get_request = store.get(uid);
	get_request.onsuccess = function(){
		var data = get_request.result;
		if(!arraysEqual(data.flags, flags)){
			data.flags = flags;
			var update_request = store.put(data);				
			update_request.onsuccess = function(){
				console.log('flag updated');
				if(callback){
					callback();
				}
			};
		}
		else{
			if(callback){
				callback();
			}
		}
	};
	function arraysEqual(arr1, arr2) {
		if(arr1.length !== arr2.length)
				return false;
		for(var i = arr1.length; i--;) {
				if(arr1[i] !== arr2[i])
						return false;
		}
		return true;
	}
},
syncAll:function(){
	console.log('syncing all boxes');
	var def = Q.defer();
	imapHandler.getBoxes()
		.then(function(boxes){
			var box_names = [];
			for(var i in boxes){
				box_names.push(i);
			}
			var ind = 0;
			syncBox(box_names, 0, function(){
				console.log('syncAll complete');
				def.resolve();
			});
			function syncBox(box_names, current_index, callback){
				dbHandler.syncBox(box_names[current_index])
					.then(function(){
						if(current_index === box_names.length-1){
							callback();
						}
						else{
							syncBox(box_names, current_index+1, callback);
						}
					});
			}
		});
	return def.promise;
},
syncBox:function(mailbox_name, callback){
	console.log('---------------- syncing: '+mailbox_name+' ----------------');
	var def = Q.defer();
	dbHandler.ensureLocalBox(mailbox_name)
		.then(function(){
			console.log('local box created; proceeding');
			return imapHandler.getUIDsFlags(mailbox_name);
		})
		.then(function(msgs){
			if(msgs.length===0){
				console.log('throwing');
				throw new Error("No messages");
			}
			this.msgs = msgs;
			return deleteLocalMessages(msgs);
		})
		.then(function(){
			console.log('downloading new mail');
			return downloadNewMail(this.msgs);
		})
		.then(function(){
			console.log('updating flags');
			return updateFlags(this.msgs);
		})
		.then(function(){
			console.log('saving uids');
			return saveUIDs(this.msgs);
		})
		.then(function(){
			console.log('resolving');
			if(callback){
				callback(null, true);
			}
			else{
				def.resolve();
			}
		})
		.catch(function(error){
			console.log(error);
			if(callback){
				callback(null,true);
			}
			else{
				def.resolve();
			}
		});
	return def.promise;

	function updateFlags(msgs){
		msgs = (function(){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = msg.flags;
			});
			return out;
		}());
		var def = Q.defer();
		var file_path = './descriptors/'+mailbox_name+'_uids.json';
		fs.exists(file_path, function(exists){
			if(exists){
				fs.readJson(file_path, 'utf8', function(err, existing_msgs){
					existing_msgs.forEach(function(msg){
						var uid = msg[0];
						var local_flags = msg[1];
						var remote_flags = msgs[uid];
						if(msgs[uid]){
							if(!arraysEqual(msg[1],msgs[uid])){
								dbHandler.updateFlags(mailbox_name, uid, remote_flags);
							}
						}
					});
					def.resolve();
				});
			}
			else{
				def.resolve();
			}
		});
		function arraysEqual(arr1, arr2) {
			if(arr1.length !== arr2.length)
					return false;
			for(var i = arr1.length; i--;) {
					if(arr1[i] !== arr2[i])
							return false;
			}
			return true;
		}
		return def.promise;
	}

	function saveUIDs(msgs, callback){
		var deferred = Q.defer();
		var uids = (function(){
			var out = [];
			msgs.forEach(function(msg){
				out.push([msg.uid,msg.flags]);
			});
			return out;
		}());
		var file_name = './descriptors/'+mailbox_name+'_uids.json';
		var data = JSON.stringify(uids);
		fs.outputFile(file_name, data, function(err){
			deferred.resolve();
		});
		return deferred.promise;
	}
	function downloadNewMail(msgs){
		var deferred = Q.defer();
		syncChunk(msgs, 0, msgs.length, function(){
			console.log('sync complete');
			deferred.resolve();
		});
		return deferred.promise;
	}
	function syncChunk(msgs, limitx, message_count, callback){
		console.log('--- sync chunk '+limitx+','+message_count);
		var max_msg = Math.min(message_count, limitx+100);
		var chunk = msgs.slice(limitx, max_msg);
		addLocalMessages(chunk, function(){
			if(max_msg < message_count){
				syncChunk(msgs, max_msg, message_count, callback);
			}
			else{
				if(callback){
					callback();
				}
			}
		});
	}
	function addLocalMessages(msgs, callback){
		var messages_to_process = msgs.length;
		msgs.forEach(function(msg, index){
			//  console.log('- processing: '+msg.uid);
			dbHandler.getMailFromLocalBox(mailbox_name, msg.uid)
				.then(function(result){
					if(!result){
						//  console.log(msg.uid+' not found; retrieving');
						imapHandler.getMessageWithUID(mailbox_name, msg.uid)
							.then(function(mail_obj){
								//  console.log(msg.uid+"'s mail object retrieved from remote server");
								mail_obj.uid = msg.uid;
								mail_obj.flags = msg.flags;
								//  console.log('saving '+msg.uid+" to local store");
								dbHandler.saveMailToLocalBox(mailbox_name, mail_obj, function(){
									//  console.log('saved '+msg.uid+' to local store');
									checkEnd(index);
								});
							});
					}
					else{
						// console.log('found, proceeding...');
						checkEnd(index);
					}
				});
		});
		function checkEnd(index){
			if(index === messages_to_process-1){
				if(callback){
					callback();
				}
			}
		}
	}
	function deleteLocalMessages(msgs, callback){
		console.log('deleting local messages');
		var def = Q.defer();
		var uids = (function(){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = null;
			});
			return out;
		}());
		console.log(uids[426800]);
		fs.exists('descriptors/'+mailbox_name+'_uids.json', function(exists){
			if(exists){
				fs.readFile('descriptors/'+mailbox_name+'_uids.json','utf8',function(err,data){
					var existing_msgs = JSON.parse(data);
					console.log(existing_msgs);
					existing_msgs.forEach(function(msg){
						console.log(msg[0]);
						console.log(msg[0] in uids);
						if(msg[0] in uids === false){
							dbHandler.deleteMessage(mailbox_name, msg[0]);
						}
					});
					def.resolve();
				});
			}
			else{
				def.resolve();
			}
		});
		return def.promise;
		// console.log(t1);
		// dbHandler.getUIDsFromMailbox(mailbox_name, function(uid){
		//   // if((uid in uids) === false){
		//   //   dbHandler.deleteMessage(mailbox_name, uid);
		//   // }
		// }, function(){
		//   console.log('delete local messages complete');
		//   console.log(' ');
		//   var t2 = new Date();
		//   console.log(t2);
		//   if(callback){
		//     callback();
		//   }
		// });
	}
},
deleteMessage:function(box_name, uid, callback){
	console.log('deleting local '+box_name+':'+uid);
	var objectStore = db.transaction("box_"+box_name,'readwrite').objectStore("box_"+box_name);
	var delete_request = objectStore.delete(uid);
	delete_request.onsuccess = function(){
		console.log(box_name+':'+uid+' deleted');
		if(callback){
			callback();
		}
	};
},
getUIDsFromMailbox:function(box_name, onKey, onEnd){
	if(!db.objectStoreNames.contains("box_"+box_name)){
		console.log('local box does not exist');
		return;
	}
	var objectStore = db.transaction("box_"+box_name).objectStore("box_"+box_name);
	objectStore.index('uid').openKeyCursor().onsuccess = function(event) {
		var cursor = event.target.result;
		if (cursor) {
			if(onKey){
				onKey(cursor.key);
			}
			cursor.continue();
		}
		else {
			if(onEnd){
				onEnd();
			}
		}
	};
},
getMessagesFromMailbox:function(box_name, onMessage, onEnd){
	if(!db.objectStoreNames.contains("box_"+box_name)){
		console.log('local box does not exist');
		return;
	}
	var tx = db.transaction("box_"+box_name);
	var objectStore = tx.objectStore("box_"+box_name);
	objectStore.openCursor(null, 'prev').onsuccess = function(event) {
		var cursor = event.target.result;
		if (cursor) {
			var mail_object = cursor.value;
			if(onMessage){
				onMessage(mail_object);
			}
			cursor.continue();
		}
		else {
			if(onEnd){
				onEnd();
			}
		}
	};
},
getThread:function(thread_id, callback){
	var def = Q.defer();
	var objectStore = db.transaction('threads','readonly').objectStore('threads');
	var get_request = objectStore.get(thread_id);
	get_request.onsuccess = function(){
		var matching = get_request.result;
		def.resolve(matching);
	};
	return def.promise;
},
getThreadMessages:function(thread_id){
	var def = Q.defer();
	dbHandler.getThread(thread_id)
		.then(function(thread_data){
			var message_umis = thread_data.messages;
			var messages_to_get = message_umis.length;
			var mail_objs = [];
			message_umis.forEach(function(umi, index){
				umi = umi.split(':');
				var mailbox_name = umi[0];
				var uid = parseInt(umi[1],10);
				dbHandler.getMailFromLocalBox(mailbox_name, uid)
					.then(function(mail_obj){
						mail_objs.push(mail_obj);
						if(mail_objs.length === messages_to_get){
							mail_objs.sort(sortbyuid);
							def.resolve(mail_objs);
						}
					});
				});
		});
	function sortbyuid(a,b){
		if(a.uid > b.uid){
			return -1;
		}
		else{
			return 1;
		}
	}
	return def.promise;
},
saveAttachments:function(box_name, mail_object, callback){
	if(!mail_object.attachments){
		callback(mail_object);
		return;
	}
	createFolders(function(){
		var path = 'attachments/'+box_name+'/'+mail_object.uid+'/';
		var attachments = mail_object.attachments;
		var attachments_to_save = attachments.length;
		var saved_attachments = 0;
		attachments.forEach(function(attachment, index){
			fs.writeFile(path+attachment.fileName, attachment.content, function(){
				delete mail_object.attachments[index].content;
				saved_attachments ++;
				if(saved_attachments === attachments_to_save){
					if(callback){
						callback(mail_object);
					}
				}
			});
		});
	});
	function createFolders(callback){
		createDirectoryIfNotExists('attachments', function(){
			createDirectoryIfNotExists('attachments/'+box_name, function(){
				createDirectoryIfNotExists('attachments/'+box_name+'/'+mail_object.uid,callback);
			});
		});
	}
	function createDirectoryIfNotExists(path, callback){
		fs.exists(path,function(exists){
			if(!exists){
				// console.log('creating directory: '+path);
				fs.mkdir(path, callback);
			}
			else{
				callback();
			}
		});
	}
},
markComplete:function(box_name, uid){
	console.log('marking complete: '+box_name+':'+uid);
	var def = Q.defer();
		imapHandler.move(box_name, 'complete', uid);
//		.catch(function(error){
//			console.log(error);
//		})
//		.fin(function(){
//			def.resolve();
//		});
	return def.promise;
}

};



module.exports = dbHandler;
