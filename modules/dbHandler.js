var fs = require('fs');
// for some reason, setting fs to fs-extra isn't recognized later in the execution...?
var fsx = require('fs-extra');
var Q = require('q');
var db;
var indexedDB = window.indexedDB;

// careful. //console.log(mail_obj) may crash node-webkit with no errors. Perhaps because mail_objs may be huge.

function dbHandler(){}
dbHandler.prototype = {
addObjectStore: function(store_name, store_conf){
	// Convenience function for creating an object store manually
	var def = Q.defer();
	if(db.objectStoreNames.contains(store_name)){
		def.resolve();
		return def.promise;
	}
	var version =  parseInt(db.version);
	db.close();
	var open_request = indexedDB.open('slatemail',version+1);
	open_request.onupgradeneeded = function(){
		db = open_request.result;
		db.createObjectStore(store_name, store_conf);
	};
	open_request.onsuccess = function(){
		def.resolve();
	};
	return def.promise;
},
deleteDB:function(){
	console.log('delete request');
	var def = Q.defer();
	var req = indexedDB.deleteDatabase('slatemail');
	req.onsuccess = function () {
		console.log("Deleted database successfully");
		def.resolve();
	};
	req.onerror = function () {
		console.log("Couldn't delete database");
		def.resolve();
	};
	req.onblocked = function () {
		console.log("Couldn't delete database due to the operation being blocked");
		def.resolve();
	};
	return def.promise;
},
connect:function(callback){
	console.log('connecting local database');
	var def = Q.defer();
	var request = indexedDB.open("slatemail");
	request.onupgradeneeded = function(){
		console.log('upgrade needed');
		db = request.result;

		// Maps thread IDs to arrays that contain the message IDs of their emails.
		db.createObjectStore('threads', {keyPath:'thread_id', autoIncrement: true});

		// Maps contact names to email addresses (unused right now).
		db.createObjectStore('contacts', {keyPath:'address'});

		// Maps project IDs to arrays containing the thread IDs of the threads in the project.
		db.createObjectStore('projects', {keyPath: 'name'});

		// Maps PIDs to thread IDs. This is to ensure that a message that is moved to a different
		// box is organized into the same thread.
		db.createObjectStore('pids', {keyPath:'pid'});

		// Stores email addresses that the user has blocked. Messages from these addresses are
		// downloaded but are never stored in a local box. An IMAP request is sent to delete them.
		db.createObjectStore('blocked', {keyPath:'address'});

		// Caches user actons, like marking an email as complete
		db.createObjectStore('actions', {keyPath:'action_id', autoIncrement:true});

		// Caches descriptors for each mailbox. Descriptors are a snapshot of the UIDs and flags
		// in each mailbox according to the LAST sync.
		db.createObjectStore('descriptors', {keyPath:'mailbox'});

	};
	request.onsuccess = function(){
		console.log('success');
		db = request.result;
		db.onversionchange = function(event){
			console.log('db version chagned');
		};
		db.onclose = function(event){
			console.log('db closed');
		};
		db.onerorr = function(event){
			console.log('db error');
			console.log(event);
		};
		def.resolve(db);
	};
	request.onerror = function(){
		console.log('error');
		console.log(request.error);
	};
	request.onblocked = function(){
		console.log('blocked');
	};
	// console.log(request);
	return def.promise;
},
ensureProjectStore:function(){ // Is this necessary? Isn't the project ensured in the initial connect() method?
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
ensureLocalBoxes:function(boxes){
	console.log('ensuring local boxes: ',boxes);
	if(typeof boxes === 'string'){
		return this.ensureLocalBoxes([boxes]);
	}
	// If local store for $mailbox_name does not exist, create it.
	var def = Q.defer();
	var boxes_to_make = (function(){
		var out = [];
		boxes.forEach(function(box){
			if(db.objectStoreNames.contains('box_'+box) === false){
				out.push(box);
			}
		});
		return out;
	}());
	console.log('boxes to make: ',boxes_to_make);
	if(boxes_to_make.length === 0){
		def.resolve();
		return def.promise;
	}
	var version = parseInt(db.version, 10);
	db.close();
	var open_request = indexedDB.open('slatemail', version+1);
	open_request.onupgradeneeded = function () {
		db = open_request.result;
		boxes_to_make.forEach(function(box){
			var object_store = db.createObjectStore('box_'+box, {
				keyPath: 'uid'
			});
			object_store.createIndex("message_id", "messageId", { unique: false });
			object_store.createIndex("short_subject", "short_subject", { unique: false });
			object_store.createIndex("uid","uid", {unique:true});
			object_store.createIndex("date","date",{unique: false});
		});
	};
	open_request.onsuccess = function (e) {
		console.log('local mailboxes created: ',boxes_to_make);
		def.resolve();
	};
	open_request.onerror = function(event){
		console.log(event);
	};
	open_request.onblocked = function(event){
		console.log('blocked!');
	};
	return def.promise;
},
saveMailToLocalBox:function(mailbox_name, mail_obj){
	var def = Q.defer();
	// console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
	process.stdout.write('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
	var self = this;
	this.saveAttachments(mailbox_name, mail_obj)
		.then(function(mail_obj){
			mail_obj.mailbox = mailbox_name;
			var tx = db.transaction("box_"+mailbox_name,"readwrite");
			var store = tx.objectStore("box_"+mailbox_name);
			mail_obj.uid = parseInt(mail_obj.uid,10);
			mail_obj.subject = mail_obj.subject ? mail_obj.subject : '';
			mail_obj.short_subject = self.shortenSubject(mail_obj.subject);
			mail_obj.pid = self.getPID(mail_obj);
			var put_request = store.put(mail_obj);
			put_request.onsuccess = function(){
				// console.log('      save for '+mailbox_name+':'+mail_obj.uid+' successful!');
				// dbHandler.threadMail(mailbox_name, mail_obj);
				def.resolve();
			};
			put_request.onerror = function(err){
				console.log("ERROR");
				console.log(err);
				def.resolve();
			};
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
},
getPID:function(mail_obj){
	return [mail_obj.subject.substring(0,10) || '', mail_obj.headers.from || '', mail_obj.date, mail_obj.messageId].join('|');
},
shortenSubject:function(subject){
	if(subject){
		return subject.replace(/([\[\(] *)?(RE?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
	}
	else{
		return subject;
	}
	// return subject.replace(/([\[\(] *)?(RE|FWD?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
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
		//console.log('contact stored: '+sender_address);
	};
},
getLocalMailboxes:function(){
	var stores = db.objectStoreNames;
	var out = [];
	var l = stores.length;
	for(var i=0;i<l;i++){
		var store = stores[i];
		if(store.indexOf('box_')>-1){
			out.push(store.replace('box_',''));
		}
	}
	//console.log(out);
	return out;
},
findFirstMailWithProperty:function(property, values, current_index, callback){
	// Searches all mailboxes for a message in which $property matches one of $values.
	// Stops when a message is found. Callback includes the FIRST message that is found.
	// console.log('find first mail with property '+property+' set to one of:');
	// console.log(values);
	if(typeof current_index === 'function'){
		callback = current_index;
		current_index = 0;
	}
	var self = this;
	var value = values[current_index];
	this.findMailWithProperty(property, value)
		.then(function(mail_object){
			if(mail_object === false || !mail_object.thread_id){
				if(current_index < values.length - 1){
					self.findFirstMailWithProperty(property, values, current_index+1, callback);
				}
				else{
					callback(false);
				}
			}
			else{
				//console.log('message trace found thread_id: '+mail_object.thread_id);
				callback(mail_object);
			}
		})
		.catch(function(err){
			console.log(err);
		});
},
findMailWithProperty:function(property, value){
	// Searches all of the mailboxes for a message with a $property set to $value.
	// For example, property can be 'message_id'. Only works with properties that are
	// indexed.
	// console.log('searching for: '+property+', '+value);
	var def = Q.defer();
	var boxes = this.getLocalMailboxes();
	var self = this;
	iteration(boxes, 0, function(mail_obj){
		def.resolve(mail_obj);
	});
	function iteration(boxes, index, cb){
		self.getMailFromBoxWithProperty(boxes[index], property, value)
			.then(function(mail_obj){
				// console.log(mail_obj);
				if(!mail_obj){
					if(index < boxes.length-1){
						iteration(boxes, index+1, cb);
					}
					else{
						cb(false);
					}
				}
				else{
					cb(mail_obj);
				}
			})
			.catch(function(err){
				console.log(err);
			});
	}
	return def.promise;
},
getMailFromBoxWithProperty:function(mailbox_name, property, value){
	// console.log('getting mail from box '+mailbox_name + ' with property '+property+' set to '+value);
	var def = Q.defer();
	var store_name = 'box_'+mailbox_name;
	if(!db.objectStoreNames.contains(store_name)){
		def.resolve(false);
	}
	else{
		var tx = db.transaction(store_name,"readonly");
		var store = tx.objectStore(store_name);
		var index = store.index(property);
		var get_request = index.get(value);
		get_request.onsuccess = function(){
			var matching = get_request.result;
			if(matching!==undefined){
				def.resolve(get_request.result);
			}
			else{
				def.resolve(false);
			}
		};
		get_request.onerror = function(err){
			console.log(err);
		};
	}
	return def.promise;
},
getMailFromLocalBox:function(mailbox_name, uid){
	console.log('getting mail from local box '+mailbox_name+':'+uid);
	uid = parseInt(uid, 10);
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
	request.onerror = function(){
		console.log('error getting mail from local box '+mailbox_name+':'+uid);
	};
	return def.promise;
},
updateFlags:function(box_name, uid, flags, callback){
	//console.log('updating flags on '+box_name+':'+uid);
	var tx = db.transaction("box_"+box_name,"readwrite");
	var store = tx.objectStore("box_"+box_name);
	var get_request = store.get(uid);
	get_request.onsuccess = function(){
		if(!get_request.result){
			return;
		}
		var data = get_request.result;
		if(!arraysEqual(data.flags, flags)){
			data.flags = flags;
			var update_request = store.put(data);
			update_request.onsuccess = function(){
				//console.log('flag updated');
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
// eraseMessage:function(box_name, uid){
// 	// Removes every trace of the message everywhere.
// 	var def = Q.defer();
// 	var self = this;
// 	Q.all([
// 		self.removeLocalMessage(box_name, uid),
// 		// dbHandler.removePid(), // TO-DO
// 		self.imaper.markDeleted(box_name, uid)
// 	])
// 	.then(function(){
// 		self.imaper.expunge(box_name);
// 		def.resolve();
// 	});
// 	return def.promise;
// },
removePID:function(pid){ // TO-DO
	var def = Q.defer();
	def.resolve();
	return def.promise;
},
removeLocalMessage:function(box_name, uid){
	// Removes a message from the local store and removes it from its thread.
	// This does NOT delete the message on the IMAP server. It also does NOT
	// remove the message's PID.
	var self = this;
	var def = Q.defer();
	uid = parseInt(uid, 10);
	console.log('deleting local '+box_name+':'+uid);
	// var get_request = db.transaction("box_"+box_name,'readonly').objectStore("box_"+box_name).get(uid);
	this.getMailFromLocalBox(box_name, uid)
		.then(function(mail_obj){
			if(!mail_obj){
				console.log('resolving because no mail object found');
				def.resolve();
			}
			else{
				console.log('message retrieved, ',mail_obj);
				var thread = mail_obj.thread_id;
				var tx = db.transaction("box_"+box_name,'readwrite');
				var object_store = tx.objectStore("box_"+box_name);
				var delete_request = object_store.delete(uid);
				delete_request.onsuccess = function(event){
					console.log('deleted: '+box_name+':'+uid);
					def.resolve();
					// self.removeMessageFromThread(thread, box_name, uid)
					// 	.then(function(){
					// 		def.resolve();
					// 	});
				};
				delete_request.onerror = function(err){
					console.log(err);
				};
				tx.onsuccess = function(){
					console.log('transaction success');
				};
				tx.onerror = function(err){
					console.log('transaction error: ',err);
				};
			}
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
},
removeMessageFromThread:function(thread_id, box_name, uid){
	console.log('removing message '+box_name+':'+uid+' from '+thread_id);
	var def = Q.defer();
	var object_store = db.transaction("threads", "readonly").objectStore("threads");
	var get_request = object_store.get(thread_id);
	get_request.onsuccess = function(){
		var thread_obj = get_request.result;
		var messages = thread_obj.messages;
		var mid = box_name+':'+uid;
		var index = messages.indexOf(mid);
		if(index>-1){
			messages.splice(index,1);
			var put_request = db.transaction("threads", "readwrite").objectStore("threads").put(thread_obj);
			put_request.onsuccess = function(){
				def.resolve();
			};
		}
		else{
			def.resolve();
		}
	};
	get_request.onerror = function(error){
		console.log(error);
		def.resolve();
	};
	return def.promise;
},
getUIDsFromMailbox:function(box_name, onKey, onEnd){
	if(!db.objectStoreNames.contains("box_"+box_name)){
		//console.log('local box does not exist');
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
getMessagesFromMailbox: function(box_name, onMessage, limit, offset){
	console.log('get messages from '+box_name+', limit is '+limit+', offset is '+offset);
	var def = Q.defer();
	if(!db.objectStoreNames.contains("box_"+box_name)){
		console.log(box_name+' does not exist');
		def.resolve();
	}
	else{
		var tx = db.transaction("box_"+box_name);
		var store = tx.objectStore("box_"+box_name);
		var index = store.index('date');
		var count = 0;
		index.openCursor(null, 'prev').onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				if(offset !== undefined && offset > 0 && count === 0){
					cursor.advance(offset);
					offset = undefined;
				}
				else{
					var mail_object = cursor.value;
					if(onMessage){
						onMessage(mail_object);
					}
					count ++;
					if(limit === undefined || (count < limit)){
						cursor.continue();					
					}
					else{
						console.log('resolving because limit is undefined or count is less than limit, offset is '+offset+' and limit is '+limit);
						def.resolve();
					}
				}
			}
			else {
				console.log('resolving because no cursor anymore');
				def.resolve();
			}
		};
	}
	return def.promise;
},
getThreads:function(thread_ids){
	console.log('GETTING THREADS IN DBHANDLER, thread_ids...');
	console.log(thread_ids);
	var def = Q.defer();
	var thread_objs = [];
	var promises = [];
	var self = this;
	thread_ids.forEach(function(thread_id){
		promises.push(self.getThread(thread_id));
	});
	Q.all(promises)
		.then(function(out){
			def.resolve(out);
		});
	return def.promise;
},
getThread:function(thread_id){
	console.log('dBHandler - getting thread '+thread_id);
	thread_id = parseInt(thread_id, 10);
	var def = Q.defer();
	var tx = db.transaction('threads','readonly');
	var objectStore = tx.objectStore('threads');
	var get_request = objectStore.get(thread_id);
	get_request.onsuccess = function(event){
		var matching = get_request.result;
		// console.log('THREAD '+thread_id+' LOCATED, result is...');
		// console.log(matching);
		def.resolve(matching);
	};
	get_request.onerror = function(err){
		def.resolve();
	};
	return def.promise;
},
getThreadMessages:function(thread_obj){
	// console.log('getting thread messages');
	var def = Q.defer();
	var message_umis = thread_obj.messages;
	var messages_to_get = message_umis.length;
	var mail_objs = [];
	var messages_checked = 0;
	var self = this;
	message_umis.forEach(function(umi, index){
		umi = umi.split(':');
		var mailbox_name = umi[0];
		var uid = parseInt(umi[1],10);
		self.getMailFromLocalBox(mailbox_name, uid)
			.then(function(mail_obj){
				if(mail_obj!==false){
					mail_objs.push(mail_obj);
				}
				messages_checked ++;
				if(messages_checked === messages_to_get){
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
	return def.promise;
},
saveAttachments:function(box_name, mail_object){
	var def = Q.defer();
	if(!mail_object.attachments){
		def.resolve(mail_object);
		return def.promise;
	}
	var path = 'attachments/'+box_name+'/'+mail_object.uid+'/';
	fsx.ensureDir(path, function(){
		var attachments = mail_object.attachments;
		var attachments_to_save = attachments.length;
		var saved_attachments = 0;
		attachments.forEach(function(attachment, index){
			fsx.writeFile(path+attachment.fileName, attachment.content, function(){
				delete mail_object.attachments[index].content;
				saved_attachments ++;
				if(saved_attachments === attachments_to_save){
					def.resolve(mail_object);
				}
			});
		});
	});
	return def.promise;
},
ensureProject:function(project_name){
	//console.log('ensuring project: '+project_name);
	var def = Q.defer();
	var tx = db.transaction('projects',"readwrite");
	var store = tx.objectStore('projects');
	var blank_project = {
		threads:[]
	};
	var get_request = store.get(project_name);
	get_request.onsuccess = function(){
		//console.log('success');
		var data = get_request.result;
		if(data===undefined){
			var put_request = store.put({
				name:project_name,
				threads:[]
			});
			put_request.onsuccess = function(){
				//console.log('project '+project_name+' created');
				def.resolve();
			};
			put_request.onerror = function(){
				//console.log('error ensuring project: '+project);
				//console.log(event);
			};
		}
		else{
			def.resolve();
		}
	};
	get_request.onerror = function(event){
		//console.log('error ensuring project: '+project);
		//console.log(event);
	};
	// var request = store.put(blank_project);
	// request.onsuccess = function(){
	// 	def.resolve();
	// };
	return def.promise;
},
putInProject:function(box_name, uid, project_name){
	//console.log('putting '+box_name+':'+uid+' in project: '+project_name);
	var def = Q.defer();
	var self = this;
	this.ensureProjectStore()
		.then(function(){
			return self.ensureProject(project_name);
		})
		.then(function(){
			return self.getMailFromLocalBox(box_name, uid);
		})
		.then(function(message_obj){
			//console.log('adding thread id to project object');
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
					put_request.onerror = function(){
						//console.log('error updating project');
						//console.log(err);
					};
				}
				else{
					def.resolve(message_obj);
				}
			};
			get_request.onerror = function(err){
				//console.log('error updating project');
				//console.log(err);
			};
			return def.promise;
		})
		.then(function(message_obj){
			//console.log('updating thread object');
			//console.log(message_obj);
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
						//console.log(err);
					};
				}
			};
			get_request.onerror = function(err){
				//console.log(err);
			};
			return def.promise;
		})
		.fin(function(){
			def.resolve();
		})
		.catch(function(error){
			//console.log(error);
		});
	return def.promise;
},
getProject:function(project_name){
	// Resolves with the project object of project name. The project object contains the message IDs.
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
},
listProjects:function(){
	// Resolves with a complete list of project names
	var def = Q.defer();
	var tx = db.transaction("projects");
	var objectStore = tx.objectStore("projects");
	var arr = [];
	objectStore.openCursor(null, 'prev').onsuccess = function(event) {
		var cursor = event.target.result;
		if (cursor) {
			arr.push(cursor.value.name);
			cursor.continue();
		}
		else {
			def.resolve(arr);
		}
	};
	return def.promise;
},
threadMessages:function(message_ids){
	/* 
		For all messages in array $message_ids (e.g. "INBOX:100"):
			1. Thread the message, updating the local message object with a thread_id.
			2. Update the thread with the message id.
			3. Store the thread ID with the message's PID.
	*/
	console.log('threading messages');
	var self = this;
	var promises = message_ids.map(function(message_id){
		return self.threadMessage(message_id);
	});
	return promises.reduce(Q.when, Q());
},
threadMessage:function(mailbox, uid){
	console.log('---- threading message: '+mailbox+':'+uid+' ----');
	var def = Q.defer();
	var self = this;
	self.getMailFromLocalBox(mailbox, uid)
		.then(function(mail_obj){ 
			if(mail_obj.thread_id){
				console.log(mailbox+':'+uid+' already has thread; skipping');
				return;
			}
			return findMatchingThread(mail_obj)
				.then(function(thread_id){
					return thread_id === false ? saveToNewThread(mailbox, uid) : saveToExistingThread(mailbox, uid, thread_id);
				})
				.then(function(results){
					console.log('threading results', results);
					var promises = [
						storePID(mail_obj, results.thread_id)
					];
					if(results.muted === true && mailbox !== 'complete'){
						promises.push(self.moveToComplete(mailbox, uid));
					}
					else{
						promises.push(updateMailObject(mailbox, uid, results.thread_id));
					}
					return Q.all(promises);
				})
				.catch(function(err){
					console.log(err);
				});
		})
		.fin(function(){
			console.log('*** threading of message '+mailbox+':'+uid+' complete');
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;

	function findMatchingThread(mail_obj){
		/* Takes an unthreaded $mail_obj and attempts to match it to 
		an existing thread based on its properties. Resolves with a
		thread_id, or false if no thread is found.*/
		var def = Q.defer();

		/* Determines the priority of each threading function. */
		var fncs = [
			getThreadByPID,
			traceInReplyTo,
			traceReferences,
			traceSubject
		];

		/* Step over $fncs until a result is found */
		step(0, function(thread_id){
			def.resolve(thread_id);
		});
		function step(i, cb){
			var fnc = fncs[i];
			fnc(mail_obj)
				.then(function(thread_id){
					// console.log(thread_id);
					if(thread_id === false){
						if(i === fncs.length - 1){
							cb(false);
						}
						else{
							step(i+1, cb);
						}
					}
					else{
						// console.log('returning with thread_id: '+thread_id);
						cb(thread_id);
					}
				});
		}
		return def.promise;

		/* THREADING FUNCTIONS */
		/* These all take a mail_obj and use its properties to try to match it to a thread. */

		function getThreadByPID(mail_obj){
			/* Searches the PIDs for a message. The PID is a quasi-unique identifier based
				on properties of the message. It's best to use this as the first threading
				function to ensure that messages that have already been threaded in the past
				that have since moved mailboxes are attached to the same threads as before.
			*/
			var pid = mail_obj.pid;
			var def = Q.defer();
			var tx = db.transaction("pids","readonly");
			var store = tx.objectStore("pids");
			var get_request = store.get(pid);
			get_request.onsuccess = function(){
				var result = get_request.result;
				if(!result){
					def.resolve(false);
				}
				else{
					def.resolve(result.thread);
				}
			};
			return def.promise;
		}
		function traceInReplyTo(mail_obj){
			// console.log('by reply to');
			return traceByProperty(mail_obj, 'inReplyTo');
		}
		function traceReferences(mail_obj){
			// console.log('by references');
			return traceByProperty(mail_obj, 'references');
		}
		function traceSubject(mail_obj){
			// console.log('by subject');
			var def = Q.defer();
			self.findFirstMailWithProperty('short_subject', [mail_obj.short_subject], function(mail_obj){
				def.resolve(mail_obj.thread_id || false);
			});
			return def.promise;
		}

		/* Helper functions */
		function traceByProperty(mail_obj, property){
			var def = Q.defer();
			if(mail_obj[property]){
				traceMessage(mail_obj[property])
					.then(function(result){
						def.resolve(result);
					});
			}
			else{
				def.resolve(false);			
			}
			return def.promise;
		}
		function traceMessage(message_ids){
			// Searches all mailboxes for a message with a message_id inside $message_ids.
			// Stops when it finds one. Callbacks with the thread id of that message.
			// console.log('tracing message');
			var def = Q.defer();
			self.findFirstMailWithProperty('message_id', message_ids, 0, function(mail_obj){
				if(mail_obj === false){
					def.resolve(false);
				}
				else{
					def.resolve(mail_obj.thread_id);
				}
			});
			return def.promise;
		}
	}
	function saveToNewThread(mailbox, uid, callback){
		/* Takes a mail_obj and stores its ID to a new thread, then callbacks with the new thread's ID */
		var def = Q.defer();
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var data = {
			messages:[mailbox + ':' + uid]
		};
		var add_request = store.add(data);
		add_request.onsuccess = function(event){
			var thread_id = event.target.result;
			console.log('           saved message ' + mailbox + uid + ' to new thread ' + thread_id);
			def.resolve({thread_id: event.target.result});
		};
		return def.promise;
	}
	function storePID(mail_object, thread_id){
		// console.log('storing pid '+mail_obj.pid+' to '+thread_id);
		// console.log('updating mail with thread id: '+box_name+':'+uid+' with '+thread_id);
		var def = Q.defer();
		var tx = db.transaction("pids","readwrite");
		var store = tx.objectStore("pids");
		var put_request = store.put({
			pid:mail_object.pid,
			thread:thread_id
		});
		put_request.onsuccess = function(){
			// console.log('storing PID successful');
			def.resolve();
		};
		put_request.onerror = function(){
			console.log('error storing PID');
			def.resolve();
		};
		return def.promise;
	}

	function saveToExistingThread(mailbox_name, mail_uid, thread_id){
		console.log('\t\tsaving '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
		var def = Q.defer();
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var get_request = store.get(thread_id);
		get_request.onsuccess = function(){
			var thread_obj = get_request.result;
			if(thread_obj.messages.indexOf(mailbox_name+':'+mail_uid)>-1){
				updateMailObject(mailbox_name, mail_uid, thread_id)
					.then(function(){
						def.resolve({thread_id: thread_id});
					});
			}
			else{
				thread_obj.messages.push(mailbox_name+':'+mail_uid);
				var update_request = store.put(thread_obj);
				update_request.onsuccess = function(){
					def.resolve({thread_id: thread_id, muted: thread_obj.muted});
				};
				update_request.onerror = function(err){
					console.log('FAILED: saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
					console.log(err);
				};
			}
		};
		get_request.onerror = function(){
			console.log('FAILED');
		};
		return def.promise;
	}
	function updateMailObject(box_name, uid, thread_id){
		/* Adds $thread_id to a message's local mail object */
		var def = Q.defer();
		console.log('updating mail object: '+box_name+':'+uid);
		self.getMailFromLocalBox(box_name, uid)
			.then(function(mail_obj){
				mail_obj.thread_id = thread_id;
				var tx = db.transaction("box_"+box_name,"readwrite");
				var store = tx.objectStore("box_"+box_name);
				var update_request = store.put(mail_obj);
				update_request.onsuccess = function(){
					console.log('mail object updated');
					def.resolve();
				};
				update_request.onerror = function(){
					console.log('update request error');
					def.resolve();
				};
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	}
},
blockSender: function(sender_address){
	var def = Q.defer();
	var tx = db.transaction('blocked', 'readwrite');
	var store = tx.objectStore('blocked');
	var update_request = store.put({address: sender_address});
	update_request.onsuccess = function(){
		console.log(sender_address+' added to blocked store');
		def.resolve();
	};
	update_request.onerror = function(){
		console.log('error adding '+sender_address+' to blocked store');
		def.resolve();
	};
	return def.promise;
},
isSenderBlocked: function(sender_address){
	var def = Q.defer();
	var tx = db.transaction('blocked', 'readonly');
	var store = tx.objectStore('blocked');
	var get_request = store.get(sender_address);
	get_request.onsuccess = function(){
		if(get_request.result){
			def.resolve(true);
		}
		else{
			def.resolve(false);
		}
	};
	get_request.onerror = function(){
		def.resolve(false);
	};
	return def.promise;
},
getDueMail:function(){ // TO-DO
	console.log('GET DUE MAIL');
	// Collects all mail that is past due from the scheduled local boxes.
	// Resolves with an array of mail objects sorted descended by date.
	var def = Q.defer();
	var self = this;
	function getAllScheduleBoxes(){
		var def = Q.defer();
		self.getAllStores()
			.then(function(stores){
				var arr = [];
				for(var i=0;i<stores.length;i++){
					var store = stores[i];
					var prefix = 'box_SlateMail/scheduled/';
					if(store.length >= prefix.length){
						if(store.substring(0, prefix.length) === 'box_SlateMail/scheduled/'){
							var store_date = new Date(store);
							var current_date = new Date();
							if(store_date < current_date){
								arr.push(store);
							}
						}
					}
				}
				def.resolve(arr);
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	}
	getAllScheduleBoxes()
		.then(function getMailObjects(stores){
			var def = Q.defer();
			var msgs = [];
			var promises = [];
			stores.forEach(function(store){
				var mailbox_name = store.substring(4, store.length);
				promises.push(
					self.getMessagesFromMailbox(mailbox_name, function(mail_obj){
						msgs.push(mail_obj);
					})
				);
			});
			Q.all(promises)
				.then(function(){
					def.resolve(msgs);
				});
			return def.promise;
		})
		.then(function(msgs){
			msgs.sort(function(a,b){
				return a.date > b.date ? -1 : 1;
			});
			def.resolve(msgs);
		});
	return def.promise;
},
getAllStores:function(){
	// Gets the names of all the object stores in the slatemail database.
	// Resolves with a DOMStringList of the store names.
	var def = Q.defer();
	indexedDB.open('slatemail').onsuccess = function(sender, args){
		def.resolve(sender.target.result.objectStoreNames);
	};
	return def.promise;
},
getAllMailboxes: function(){
	// Resolves with all local mailboxes (no box_ prefix) in an array.
	var def = Q.defer();
	this.getAllStores()
		.then(function(stores){
			var out = [];
			for(var i=0; i<stores.length; i++){
				var store = stores[i];
				if(store.substring(0,4) === 'box_'){
					out.push(store.substring(4, store.length));
				}
			}
			def.resolve(out);
		});
	return def.promise;
},
getMailboxTree:function(){
	// Gets all of the local mailboxes, and resolves with a tree-like structure describing the hierarchy
	// e.g. {INBOX:{},FolderA:{FolderB:{}}} etc.
	var def = Q.defer();
	this.getAllMailboxes()
		.then(function(boxes){
			var tree = arrToTree(boxes);
			def.resolve(tree);
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;

	function arrToTree(paths){
		// Takes an array of paths and turns it into a tree.
		// ['a','a/b','a/c'] becomes {a:{b:{},c:{}}
		// So does ['a/b/c'];
		var tree = {};
		paths.forEach(function(path){
			var segs = path.split('/');
			var last = tree;
			for(var i=0; i<segs.length; i++){
				if(!last[segs[i]]){
					last[segs[i]] = {};
				}
				last = last[segs[i]];
			}
		});
		return tree;
	}
},
deleteBoxes:function(box_paths){
	var def = Q.defer();
	var promises = box_paths.map(function(box_path){
		return deleteDescriptors(box_path);
	});
	Q.all(promises)
		.then(function(){
			return deleteObjectStores(box_paths);
		})
		.then(function(){
			def.resolve();
		});
	return def.promise;
	function deleteDescriptors(box_name){
		var def = Q.defer();
		var store = db.transaction('descriptors',"readwrite").objectStore('descriptors');
		var delete_request = store.delete(box_name);
		delete_request.onsuccess = function(){
			def.resolve();
		};
		delete_request.onerror = function(err){
			console.log(error);
			def.resolve();
		};
		return def.promise;
	}
	function deleteObjectStores(box_paths){
		var def = Q.defer();
		var version =  parseInt(db.version);
		db.close();
		var open_request = indexedDB.open('slatemail',version+1);
		open_request.onupgradeneeded = function(event){
			var db = event.target.result;
			box_paths.forEach(function(box_path){
				if(db.objectStoreNames.contains('box_'+box_path)){
					console.log('DELETE '+box_path);
					db.deleteObjectStore('box_'+box_path);
				}
			});
			def.resolve();
		};
		open_request.onsuccess = function(){
			def.resolve();
		};
		return def.promise;
		
	}
},
markSeen:function(box_name, uid){
	// Marks a local email as "seen." Resolves if true if the operation was
	// successful, false if it wasn't or if the local mail already was seen.
	console.log('mark seen: '+box_name+':'+uid);
	uid = parseInt(uid,10);
	var def = Q.defer();
	var self = this;
	this.getMailFromLocalBox(box_name, uid)
		.then(function(mail_obj){
			if(mail_obj.flags.indexOf('\\Seen')===-1){	
				mail_obj.flags.push('\\Seen');
				var store = db.transaction('box_'+box_name,"readwrite").objectStore('box_'+box_name);
				var put_request = store.put(mail_obj);
				put_request.onsuccess = function(){
					def.resolve(true);
				};
				put_request.onerror = function(err){
					console.log(err);
					def.resolve(false);
				};
			}
			else{
				def.resolve(false);
			}
		});
	return def.promise;
},
muteThread: function(thread_id){
	console.log('muting thread '+thread_id);
	return this.setThreadMuteState(thread_id, true);
},
unmuteThread: function(thread_id){
	return this.setThreadMuteState(thread_id, false);
},
setThreadMuteState:function(thread_id, state){
	console.log('set mute state: '+thread_id);
	var def = Q.defer();
	this.getThread(thread_id)
		.then(function(thread_obj){
			console.log('thread_obj', thread_obj);
			thread_obj.muted = state;
			var tx = db.transaction('threads',"readwrite");
			var store = tx.objectStore('threads');
			var put_request = store.put(thread_obj);
			put_request.onsuccess = function(){
				console.log('success');
				def.resolve(true);
			};
			put_request.onerror = function(err){
				console.log(err);
				def.resolve(false);
			};
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
},
deleteProject:function(project_name){
	console.log('deleting project: '+project_name);
	var self = this;
	var def = Q.defer();
	this.getProject(project_name)
		.then(function(project_obj){
			var thread_ids = project_obj.threads;
			var promises = thread_ids.map(function(thread_id){
				return self.clearProjectFromThread(thread_id);
			});
			return Q.all(promises);
		})
		.then(function(){
			var def = Q.defer();
			var tx = db.transaction('projects','readwrite');
			var store = tx.objectStore('projects');
			var req = store.delete(project_name);
			req.onsuccess = function(){
				def.resolve();
			};
			req.onerror = function(err){
				console.log(err);
				def.resolve();
			};
			return def.promise;
		})
		.fin(function(){
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
},
clearProjectFromThread:function(thread_id){
	console.log('clearing project from thread: '+thread_id);
	var def = Q.defer();
	var self = this;
	this.getThread(thread_id)
		.then(function(thread_obj){
			if(!thread_obj){
				def.resolve();
				return;
			}
			if(thread_obj.project_id){
				delete thread_obj.project_id;
			}
			var tx = db.transaction('threads','readwrite');
			var store = tx.objectStore('threads');
			var put_request = store.put(thread_obj);
			put_request.onsuccess = function(){
				console.log('project removed from thread: '+thread_id);
				def.resolve();
			};
			put_request.onerror = function(err){
				console.log(err);
				def.resolve();
			};
		});
	return def.promise;
}

};
