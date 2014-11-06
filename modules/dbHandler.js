var MailParser = require("mailparser").MailParser;
var imapHandler = require("./imapHandler.js");
var fs = require('fs-extra');
var Q = require('q');
var db;
var indexedDB = window.indexedDB;

// careful. //console.log(mail_obj) may crash node-webkit with no errors. Perhaps because mail_objs may be huge.

// to-do: build routine to ensure deleted mailboxes are deleted locally

var dbHandler = {

deleteDB:function(){
	var def = Q.defer();
	var req = indexedDB.deleteDatabase('slatemail');
	req.onsuccess = function () {
		//console.log("Deleted database successfully");
		def.resolve();
	};
	req.onerror = function () {
		//console.log("Couldn't delete database");
		def.resolve();
	};
	req.onblocked = function () {
		//console.log("Couldn't delete database due to the operation being blocked");
		def.resolve();
	};
	return def.promise;
},
connect:function(callback){
	var def = Q.defer();
	var request = indexedDB.open("slatemail");
	request.onupgradeneeded = function(){
		//console.log('upgrade needed');
		db = request.result;
		db.createObjectStore('threads', {keyPath:'thread_id', autoIncrement: true});
		db.createObjectStore('contacts', {keyPath:'address'});
		db.createObjectStore('projects', {keyPath: 'name'});
		db.createObjectStore('pids', {keyPath:'pid'});
		//console.log('database created with threads store');
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
		object_store.createIndex("short_subject", "short_subject", { unique: false });
		object_store.createIndex("uid","uid", {unique:true});
	};
	open_request.onsuccess = function (e) {
		//console.log('local mailbox '+mailbox_name+'created');
		def.resolve();
	};
	return def.promise;
},
saveMailToLocalBox:function(mailbox_name, mail_obj){
	var def = Q.defer();
	console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
	dbHandler.saveAttachments(mailbox_name, mail_obj)
		.then(function(mail_obj){
			mail_obj.mailbox = mailbox_name;
			var tx = db.transaction("box_"+mailbox_name,"readwrite");
			var store = tx.objectStore("box_"+mailbox_name);
			mail_obj.uid = parseInt(mail_obj.uid,10);
			mail_obj.short_subject = dbHandler.shortenSubject(mail_obj.subject);
			mail_obj.pid = dbHandler.getPID(mail_obj);
			var put_request = store.put(mail_obj);
			put_request.onsuccess = function(){
				// console.log('      save for '+mailbox_name+':'+mail_obj.uid+' successful!');
				dbHandler.threadMail(mailbox_name, mail_obj);	
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
	// return subject.replace(/([\[\(] *)?(RE|FWD?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
	return subject.replace(/([\[\(] *)?(RE?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
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
threadMail:function(mailbox_name, mail_obj){
	var mail_uid = mail_obj.uid;
	// console.log('\t\tthreading message '+mailbox_name+':'+mail_uid);
	getThreadByPID(mail_obj.pid, function(thread_id){
		if(!thread_id){
			// console.log('\t\tthread id via pid not found for '+mailbox_name+':'+mail_uid);
			traceInReplyTo(function(thread_id){
				if(!thread_id){
					traceReferences(function(thread_id){
						if(!thread_id){
							traceSubject(function(thread_id){
								if(!thread_id){
									saveMailObjectToNewThread(mail_obj, function(thread_id){
										updateMailObject(mail_obj.mailbox, mail_obj.uid, thread_id);
										storePID(mail_obj, thread_id);
									});
								}
								else{
									saveToExistingThread(thread_id);
									storePID(mail_obj, thread_id);
								}
							});
						}
						else{
							saveToExistingThread(thread_id);
							storePID(mail_obj, thread_id);
						}
					});
				}
				else{
					saveToExistingThread(thread_id);
					storePID(mail_obj, thread_id);
				}
			});
		}
		else{
			saveToExistingThread(thread_id);
		}
	});

	function getThreadByPID(pid, cb){
		// console.log('\t\tgetting thread via PID '+mailbox_name+':'+mail_uid);
		var tx = db.transaction("pids","readonly");
		var store = tx.objectStore("pids");
		var get_request = store.get(pid);
		get_request.onsuccess = function(){
			var result = get_request.result;
			if(!result){
				cb(false);
			}
			else{
				// console.log('\t\t thread id for '+mailbox_name+':'+mail_uid+' is '+result.thread);
				cb(result.thread);
			}
		};
	}

	function saveToExistingThread(thread_id){
		console.log('\t\tsaving '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var get_request = store.get(thread_id);
		get_request.onsuccess = function(){
			var data = get_request.result;
			data.thread_id = thread_id;
			if(data.messages.indexOf(mailbox_name+':'+mail_uid)>-1){
				updateMailObject(mail_obj.mailbox, mail_obj.uid, thread_id);
			}
			else{
				data.messages.push(mailbox_name+':'+mail_uid);
				var request_update = store.put(data);
				request_update.onsuccess = function(){
					console.log('saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
					updateMailObject(mail_obj.mailbox, mail_obj.uid, thread_id);
				};
			}
		};
	}
	function saveMailObjectToNewThread(mail_obj, callback){
		// //console.log('saving mail_obj to new thread');
		var tx = db.transaction("threads","readwrite");
		var store = tx.objectStore("threads");
		var data = {
			messages:[mailbox_name+':'+mail_uid]
		};
		var add_request = store.add(data);
		add_request.onsuccess = function(event){
			var thread_id = event.target.result;
			console.log('           saved message '+mailbox_name+mail_uid+' to new thread '+thread_id);
			mail_obj.thread_id = event.target.result;
			if(callback){
				callback(mail_obj.thread_id);
			}
		};
	}
	function traceInReplyTo(callback){
		// //console.log('tracing in reply to');
		if(!mail_obj.inReplyTo || mail_obj.inReplyTo.length === 0){
			callback(false);
		}
		else{
			traceMessage(mail_obj.inReplyTo, 0, callback);
		}
	}
	function traceReferences(callback){
		// //console.log('tracing references');
		if(!mail_obj.references || mail_obj.references.length === 0){
			callback(false);
		}
		else{
			traceMessage(mail_obj.references, 0, callback);
		}
	}
	function traceSubject(cb){
		//console.log('tracing subject');
		if(!mail_obj.subject || mail_obj.subject === '' || mail_obj.subject === ' '){
			cb(false);
		}
		else{
			dbHandler.findMailWithProperty('short_subject',mail_obj.short_subject)
				.then(function(mail_obj){
					if(!mail_obj){
						cb(false);
					}
					else{
						//console.log('FOUND VIA SUBJECT: '+mail_obj.thread_id);
						cb(mail_obj.thread_id);
					}
				});
		}
	}
	function traceMessage(message_ids, current_index, callback){
		var message_id = message_ids[current_index];
		dbHandler.findMailWithProperty('message_id', message_id)
			.then(function(mail_object){
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
					//console.log('message trace found thread_id: '+mail_object.thread_id);
					callback(mail_object.thread_id);
				}
			})
			.catch(function(err){
				//console.log(err);
			});
	}
	function updateMailObject(box_name, uid, thread_id){
		var def = Q.defer();
		// console.log('updating mail object: '+box_name+':'+uid);
		var tx = db.transaction("box_"+box_name,"readwrite");
		var store = tx.objectStore("box_"+box_name);
		var get_request = store.get(uid);
		get_request.onsuccess = function(){
			if(!get_request.result){
				def.resolve();
			}
			else{
				var data = get_request.result;
				data.thread_id = thread_id;
				var update_request = store.put(data);
				update_request.onsuccess = function(){
					def.resolve();
				};
			}
		};
		return def.promise;
		}
	function storePID(mail_object, thread_id, callback){
		// console.log('storing pid '+mail_obj.pid+' to '+thread_id);
		//console.log('updating mail with thread id: '+box_name+':'+uid+' with '+thread_id);
		var def = Q.defer();
		var tx = db.transaction("pids","readwrite");
		var store = tx.objectStore("pids");
		var put_request = store.put({
			pid:mail_object.pid,
			thread:thread_id
		});
		put_request.onsuccess = function(){
			if(callback){
				callback();
			}
		};
	}
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
findMailWithProperty:function(property, value){
	// Searches all of the mailboxes for a message with a $property set to $value.
	// For example, property can be 'message_id'. Only works with properties that are
	// indexed.
	//console.log('searching for: '+value);
	var def = Q.defer();
	var boxes = dbHandler.getLocalMailboxes();
	iteration(boxes, 0, function(mail_obj){
		def.resolve(mail_obj);
	});
	function iteration(boxes, index, cb){
		dbHandler.getMailFromBoxWithProperty(boxes[index], property, value)
			.then(function(mail_obj){
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
			});
	}
	return def.promise;
},
getMailFromBoxWithProperty:function(mailbox_name, property, value){
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
	}
	return def.promise;
},
getMailFromLocalBox:function(mailbox_name, uid){
	// //console.log('getting mail from local box '+mailbox_name+': '+uid);
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
deleteMessage:function(box_name, uid){
	var def = Q.defer();
	//console.log('deleting local '+box_name+':'+uid);
	var get_request = db.transaction("box_"+box_name,'readonly').objectStore("box_"+box_name).get(uid);
	get_request.onsuccess = function(){
		var message_obj = get_request.result;
		var thread = message_obj.thread_id;
		var delete_request = db.transaction("box_"+box_name,'readwrite').objectStore("box_"+box_name).delete(uid);
		delete_request.onsuccess = function(){
			//console.log('deleted: '+box_name+':'+uid);
			dbHandler.removeMessageFromThread(thread, box_name, uid)
				.then(function(){
					def.resolve();
				});
		};

	};
	return def.promise;
},
removeMessageFromThread:function(thread_id, box_name, uid){
	var def = Q.defer();
	var get_request = db.transaction("threads", "readonly").objectStore("threads").get(thread_id);
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
getMessagesFromMailbox:function(box_name, onMessage){
	var def = Q.defer();
	if(!db.objectStoreNames.contains("box_"+box_name)){
		//console.log('local box does not exist');
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
			def.resolve();
		}
	};
	return def.promise;
},
getThreads:function(thread_ids){
	var def = Q.defer();
	var thread_objs = [];
	thread_ids.forEach(function(thread_id,index){
		//console.log(thread_id);
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
	//console.log('getting thread: '+thread_id);
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
	//console.log('getting thread messages');
	var def = Q.defer();
	var message_umis = thread_obj.messages;
	var messages_to_get = message_umis.length;
	var mail_objs = [];
	var messages_checked = 0;
	message_umis.forEach(function(umi, index){
		umi = umi.split(':');
		var mailbox_name = umi[0];
		var uid = parseInt(umi[1],10);
		dbHandler.getMailFromLocalBox(mailbox_name, uid)
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
saveAttachments:function(box_name, mail_object){
	var def = Q.defer();
	if(!mail_object.attachments){
		def.resolve(mail_object);
		return def.promise;
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
					def.resolve(mail_object);
				}
			});
		});
	});
	return def.promise;
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
				// //console.log('creating directory: '+path);
				fs.mkdir(path, callback);
			}
			else{
				callback();
			}
		});
	}
},
markSeen:function(box_name,uid){
	var def = Q.defer();
	var store_name = 'box_'+box_name;
	console.log(store_name);
	var store = db.transaction(store_name,"readwrite").objectStore(store_name);
	var get_request = store.get(uid);
	get_request.onsuccess = function(){
		var mail_obj = get_request.result;
		if(mail_obj.flags.indexOf('\\Seen')===-1){
			imapHandler.markSeen(box_name, uid)
				.then(function(){
					mail_obj.flags.push('\\Seen');
					var store2 = db.transaction(store_name,"readwrite").objectStore(store_name);
					var put_request = store2.put(mail_obj);
					put_request.onsuccess = function(){
						def.resolve();
					};
					put_request.onerror = function(err){
						console.log(err);
					};
				});
		}
	};
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
	dbHandler.ensureProjectStore()
		.then(function(){
			return dbHandler.ensureProject(project_name);
		})
		.then(function(){
			return dbHandler.getMailFromLocalBox(box_name, uid);
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
		.catch(function(error){
			//console.log(error);
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
		//console.log('could not retrieve project: '+project_name);
		//console.log(err);
	};
	return def.promise;
},
markComplete:function(box_name, uid){
	//console.log('marking complete: '+box_name+':'+uid);
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
		console.log('uid is '+uid);
		if(box_name!=='complete'){
			imapHandler.move(box_name, 'complete', uid)
				.then(function(){
					dbHandler.deleteMessage(box_name, uid);
				});
		}
	}
	return def.promise;
},
schedule:function(date, box_name, uid){
	console.log(box_name);
	var def = Q.defer();
	var date_box = 'SlateMail/scheduled/'+[date.getFullYear(), date.getMonth()+1, date.getDate()].join('-');
	console.log(date_box);
	imapHandler.ensureBox(date_box)
		.then(function(){
			return dbHandler.getMailFromLocalBox(box_name, uid);			
		})
		.then(function(mail_obj){
			return dbHandler.getThread(mail_obj.thread_id);
		})
		.then(function(thread){
			thread.messages.forEach(function(message_id){
				var box_name = message_id.split(':')[0];
				var uid = message_id.split(':')[1];
				imapHandler.move(box_name, date_box, uid);
			});
		})
		.then(function(){
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}


};

module.exports = dbHandler;
