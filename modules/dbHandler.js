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

deleteDB:function(callback){
	var req = indexedDB.deleteDatabase('slatemail');
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
		db.createObjectStore('projects', {keyPath: 'name'});
		console.log('database created with threads store');
	};
	request.onsuccess = function(){
		db = request.result;
		def.resolve();
	};
	return def.promise;
},
ensureProjectStore:function(){
	var def = Q.defer();
	if(db.objectStoreNames.contains('projects')){
		def.resolve();
		return def.promise;
	}
	var version =  parseInt(db.version);
	db.close();
	var open_request = indexedDB.open('slatemail',version+1);
	open_request.onupgradeneeded = function(){
		db = open_request.result;
		db.createObjectStore('projects', {keyPath:'name'});
	};
	open_request.onsuccess = function(){
		def.resolve();
	};
	return def.promise;
},
ensureLocalBox:function(mailbox_name, callback){
	var def = Q.defer();
	if(db.objectStoreNames.contains("box_"+mailbox_name)){
		def.resolve();
		return def.promise;
	}
	var version =  parseInt(db.version);
	db.close();
	var open_request = indexedDB.open('slatemail', version+1);
	open_request.onupgradeneeded = function () {
		db = open_request.result;
		var object_store = db.createObjectStore('box_'+mailbox_name, {
			keyPath: 'uid'
		});
		object_store.createIndex("message_id", "messageId", { unique: false });
		object_store.createIndex("subject", "subject", { unique: false });
		object_store.createIndex("uid","uid", {unique:true});
	};
	open_request.onsuccess = function (e) {
		console.log('local mailbox '+mailbox_name+'created');
		def.resolve();
	};
	return def.promise;
},
saveMailToLocalBox:function(mailbox_name, mail_obj, callback){
	console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
	dbHandler.saveAttachments(mailbox_name, mail_obj, function(){
		mail_obj.mailbox = mailbox_name;
		var tx = db.transaction("box_"+mailbox_name,"readwrite");
		var store = tx.objectStore("box_"+mailbox_name);
		mail_obj.uid = parseInt(mail_obj.uid,10);
		store.put(mail_obj);
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
					traceSubject(function(thread_id){
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
	function traceSubject(callback){
		callback(false);
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
	console.log('getting mail from local box '+mailbox_name+': '+uid);
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
deleteMessage:function(box_name, uid){
	var def = Q.defer();
	console.log('deleting local '+box_name+':'+uid);
	var objectStore = db.transaction("box_"+box_name,'readwrite').objectStore("box_"+box_name);
	var delete_request = objectStore.delete(uid);
	delete_request.onsuccess = function(){
		console.log('deleted: '+box_name+':'+uid);
		def.resolve();
	};
	return def.promise;
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
getThreads:function(thread_ids){
	var def = Q.defer();
	var thread_objs = [];
	thread_ids.forEach(function(thread_id,index){
		console.log(thread_id);
		dbHandler.getThread(thread_id)
			.then(function(thread_obj){
				thread_objs.push(thread_obj);
				if(index === thread_ids.length-1){
					def.resolve(thread_objs);
				}
			});
	});
	return def.promise;
},
getThread:function(thread_id){
	console.log('getting thread: '+thread_id);
	var def = Q.defer();
	var objectStore = db.transaction('threads','readonly').objectStore('threads');
	var get_request = objectStore.get(thread_id);
	get_request.onsuccess = function(){
		var matching = get_request.result;
		def.resolve(matching);
	};
	return def.promise;
},
getThreadMessages:function(thread_obj){
	console.log('getting thread messages');
	var def = Q.defer();
	var message_umis = thread_obj.messages;
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
					mail_objs.sort(sortByDate);
					def.resolve(mail_objs);
				}
			});
		});
	function sortByDate(a,b){
		if(a.date > b.date){
			return -1;
		}
		else{
			return 1;
		}
	}
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
	dbHandler.getMailFromLocalBox(box_name, uid)
		.then(function(mail_obj){
			return dbHandler.getThread(mail_obj.thread_id);
		})
		.then(function(thread){
			thread.messages.forEach(function(message_id){
				moveToComplete(message_id);
			});
			def.resolve();
		});
	function moveToComplete(message_id){
		var box_name = message_id.split(':')[0];
		var uid = message_id.split(':')[1];
		if(box_name!=='complete'){
			imapHandler.move(box_name, 'complete', uid)
				.then(function(){
					dbHandler.deleteMessage(box_name,uid);
				});
		}
	}
	return def.promise;
},
ensureProject:function(project_name){
	console.log('ensuring project: '+project_name);
	var def = Q.defer();
	var tx = db.transaction('projects',"readwrite");
	var store = tx.objectStore('projects');
	var blank_project = {
		threads:[]
	};
	var get_request = store.get(project_name);
	get_request.onsuccess = function(){
		console.log('success');
		var data = get_request.result;
		if(data===undefined){
			var put_request = store.put({
				name:project_name,
				threads:[]
			});
			put_request.onsuccess = function(){
				console.log('project '+project_name+' created');
				def.resolve();
			};
			put_request.onerror = function(){
				console.log('error ensuring project: '+project);
				console.log(event);
			};
		}
		else{
			def.resolve();
		}
	};
	get_request.onerror = function(event){
		console.log('error ensuring project: '+project);
		console.log(event);
	};
	// var request = store.put(blank_project);
	// request.onsuccess = function(){
	// 	def.resolve();
	// };
	return def.promise;
},
putInProject:function(box_name, uid, project_name){
	console.log('putting '+box_name+':'+uid+' in project: '+project_name);
	dbHandler.ensureProjectStore()
		.then(function(){
			return dbHandler.ensureProject(project_name);
		})
		.then(function(){
			return dbHandler.getMailFromLocalBox(box_name, uid);
		})
		.then(function(message_obj){
			console.log('adding thread id to project object');
			var def = Q.defer();
			var tx = db.transaction('projects','readwrite');
			var store = tx.objectStore('projects');
			var get_request = store.get(project_name);
			get_request.onsuccess = function(){
				var project = get_request.result;
				if(project.threads.indexOf(message_obj.thread_id)===-1){
					project.threads.push(message_obj.thread_id);
					var put_request = store.put(project);
					put_request.onsuccess = function(){
						def.resolve(message_obj);
					};
					put_request.onerror = function(err){
						console.log('error updating project');
						console.log(err);
					};
				}
				else{
					def.resolve(message_obj);
				}
			};
			get_request.onerror = function(err){
				console.log('error updating project');
				console.log(err);
			};
			return def.promise;
		})
		.then(function(message_obj){
			console.log('updating thread object');
			console.log(message_obj);
			var def = Q.defer();
			var thread_id = message_obj.thread_id;
			var tx = db.transaction('threads', 'readwrite');
			var store = tx.objectStore('threads');
			var get_request = store.get(thread_id);
			get_request.onsuccess = function(){
				var thread_obj = get_request.result;
				if(thread_obj.project_id === project_name){
					def.resolve();
				}
				else{
					thread_obj.project_id = project_name;
					var put_request  = store.put(thread_obj);
					put_request.onsuccess = function(){
						def.resolve();
					};
					put_request.onerror = function(err){
						console.log(err);
					};
				}
			};
			get_request.onerror = function(err){
				console.log(err);
			};
			return def.promise;
		})
		.catch(function(error){
			console.log(error);
		});
},
getProject:function(project_name){
	var def = Q.defer();
	var tx = db.transaction('projects','readonly');
	var store = tx.objectStore('projects');
	var get_request = store.get(project_name);
	get_request.onsuccess = function(){
		var result = get_request.result;
		def.resolve(result);
	};
	get_request.onerror = function(err){
		console.log('could not retrieve project: '+project_name);
		console.log(err);
	};
	return def.promise;
}

};

module.exports = dbHandler;
