threadMessage: function(message_id){
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
									// console.log('existing thread ID detected with subject header');
									saveToExistingThread(thread_id);
									storePID(mail_obj, thread_id);
								}
							});
						}
						else{
							// console.log('existing thread ID detected with references header');
							saveToExistingThread(thread_id);
							storePID(mail_obj, thread_id);
						}
					});
				}
				else{
					// console.log('existing thread ID detected with reply-to header.');
					saveToExistingThread(thread_id);
					storePID(mail_obj, thread_id);
				}
			});
		}
		else{
			// console.log('existing thread ID detected with PID (this email has already been threaded, but it has likely moved mailboxes)');
			saveToExistingThread(thread_id);
		}
	});
	var threadBy = {
		replyTo:function(cb){
			if(!mail_obj.inReplyTo || mail_obj.inReplyTo.length === 0){
				callback(false);
			}
			else{
				traceMessage(mail_obj.inReplyTo, 0, callback);
			}
		},
		references:function(cb){
			if(!mail_obj.references || mail_obj.references.length === 0){
				callback(false);
			}
			else{
				traceMessage(mail_obj.references, 0, callback);
			}
		},
		subject:function(cb){
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
	};

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
		// console.log('\t\tsaving '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
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
					// console.log('saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
					updateMailObject(mail_obj.mailbox, mail_obj.uid, thread_id);
				};
				request_update.onerror = function(){
					// console.log('FAILED: saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
				};
			}
		};
		get_request.onerror = function(){
			console.log('FAILED');
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
	function traceMessage(message_ids, callback){
		// Searches all mailboxes for a message with a message_id inside $message_ids.
		// Stops when it finds one. Callbacks with the thread id of that message.
		dbHandler.findFirstMailWithProperty('message_id', message_ids, 0, function(mail_obj){
			if(mail_obj === false){
				callback(false);
			}
			else{
				callback(mail_obj.thread_id);
			}
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
					// console.log('mail object updated');
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
			// console.log('storing PID successful');
			if(callback){
				callback();
			}
		};
		put_request.onerror = function(){
			console.log('error storing PID');
		};
	}
}