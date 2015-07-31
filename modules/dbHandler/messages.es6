// jshint esnext: true

var Message = require('./message.es6');

module.exports = {
  update(mail_obj, cb){
    var store = db.transaction('box_' + mail_obj.mailbox, 'readwrite').objectStore('box_' + mail_obj.mailbox);
    var put_request = store.put(mail_obj);
    put_request.onsuccess = function(){
      if(cb) cb();
    };
    put_request.onerror = function(err){
      if(cb) cb(err);
    };
  },
	markSeen(mail_obj, cb){
		// Marks a local email as "seen." Resolves if true if the operation was
		// successful, false if it wasn't or if the local mail already was seen.
		var self = this;
		if(mail_obj.flags.indexOf('\\Seen')===-1){
			mail_obj.flags.push('\\Seen');
			self.updateMessageAsync(mail_obj)
				.then(function(){
					cb(null, true);
				});
		}
		else{
			cb(null, false);
		}
		return def.promise;
	},
	thread(mailbox, uid){
		console.log('---- threading message: '+mailbox+':'+uid+' ----');
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
							promises.push(self.moveToCompleteAsync(mailbox, uid));
						}
						else{
							promises.push(self.updateMailObjectAsync(mailbox, uid, results.thread_id));
						}
						return Promise.all(promises);
					})
					.catch(function(err){
						if(cb) cb(err);
					});
			})
			.fin(function(){
				console.log('*** threading of message '+mailbox+':'+uid+' complete');
				if(cb) cb();
			})
			.catch(function(err){
				if(cb) cb(err);
			});

		function findMatchingThread(mail_obj, cb){
			/* Takes an unthreaded $mail_obj and attempts to match it to
			an existing thread based on its properties. Resolves with a
			thread_id, or false if no thread is found.*/

			/* Determines the priority of each threading function. */
			var fncs = [
				getThreadByPID,
				traceInReplyTo,
				traceReferences,
				traceSubject
			];

			/* Step over $fncs until a result is found */
			step(0, function(thread_id){
				cb(null, thread_id);
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

			/* THREADING FUNCTIONS */
			/* These all take a mail_obj and use its properties to try to match it to a thread. */

			function getThreadByPID(mail_obj){
				/* Searches the PIDs for a message. The PID is a quasi-unique identifier based
					on properties of the message. It's best to use this as the first threading
					function to ensure that messages that have already been threaded in the past
					that have since moved mailboxes are attached to the same threads as before.
				*/
				var pid = mail_obj.pid;
				return new Promise(function(resolve, reject){
					var tx = db.transaction("pids","readonly");
					var store = tx.objectStore("pids");
					var get_request = store.get(pid);
					get_request.onsuccess = function(){
						var result = get_request.result;
						if(!result){
							resolve(false);
						}
						else{
							resolve(result.thread);
						}
					};
				});
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
				return new Promise(function(resolve, reject){
					self.findFirstMailWithProperty('short_subject', [mail_obj.short_subject], function(mail_obj){
						resolve(mail_obj.thread_id || false);
					});
				});
			}

			/* Helper functions */
			function traceByProperty(mail_obj, property){
				return new Promise(function(resolve, reject){
					if(mail_obj[property]){
						traceMessage(mail_obj[property])
							.then(function(result){
								resolve(result);
							});
					}
					else{
						resolve(false);
					}
				});
			}
			function traceMessage(message_ids){
				// Searches all mailboxes for a message with a message_id inside $message_ids.
				// Stops when it finds one. Callbacks with the thread id of that message.
				// console.log('tracing message');
				return new Promise(function(resolve, reject){
					self.findFirstMailWithProperty('message_id', message_ids, 0, function(mail_obj){
						if(mail_obj === false){
							resolve(false);
						}
						else{
							resolve(mail_obj.thread_id);
						}
					});
				});
			}
		}
		function saveToNewThread(mailbox, uid, cb){
			/* Takes a mail_obj and stores its ID to a new thread, then callbacks with the new thread's ID */
			var tx = db.transaction("threads","readwrite");
			var store = tx.objectStore("threads");
			var data = {
				messages:[mailbox + ':' + uid]
			};
			var add_request = store.add(data);
			add_request.onsuccess = function(event){
				var thread_id = event.target.result;
				console.log('           saved message ' + mailbox + uid + ' to new thread ' + thread_id);
				cb(null, {thread_id: event.target.result});
			};
		}
		function storePID(mail_object, thread_id, cb){
			// console.log('storing pid '+mail_obj.pid+' to '+thread_id);
			// console.log('updating mail with thread id: '+box_name+':'+uid+' with '+thread_id);
			var tx = db.transaction("pids","readwrite");
			var store = tx.objectStore("pids");
			var put_request = store.put({
				pid:mail_object.pid,
				thread:thread_id
			});
			put_request.onsuccess = function(){
				// console.log('storing PID successful');
				if(cb) cb();
			};
			put_request.onerror = function(err){
				console.log('error storing PID');
				if(cb) cb(err);
			};
		}

		function saveToExistingThread(mailbox_name, mail_uid, thread_id){
			console.log('\t\tsaving '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
			return new Promise(function(resolve, reject){
				var tx = db.transaction("threads","readwrite");
				var store = tx.objectStore("threads");
				var get_request = store.get(thread_id);
				get_request.onsuccess = function(){
					var thread_obj = get_request.result;
					if(thread_obj.messages.indexOf(mailbox_name+':'+mail_uid)>-1){
						updateMailObject(mailbox_name, mail_uid, thread_id)
							.then(function(){
								resolve({thread_id: thread_id});
							});
					}
					else{
						thread_obj.messages.push(mailbox_name+':'+mail_uid);
						var update_request = store.put(thread_obj);
						update_request.onsuccess = function(){
							resolve({thread_id: thread_id, muted: thread_obj.muted});
						};
						update_request.onerror = function(err){
							console.log('FAILED: saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
							console.log(err);
							reject(err);
						};
					}
				};
				get_request.onerror = function(){
					console.log('FAILED');
				};
			});
		}
		function updateMailObject(box_name, uid, thread_id, cb){
			/* Adds $thread_id to a message's local mail object */
			console.log('updating mail object: '+box_name+':'+uid);
			self.getMailFromLocalBox(box_name, uid)
				.then(function(mail_obj){
					mail_obj.thread_id = thread_id;
					var tx = db.transaction("box_"+box_name,"readwrite");
					var store = tx.objectStore("box_"+box_name);
					var update_request = store.put(mail_obj);
					update_request.onsuccess = function(){
						console.log('mail object updated');
						if(cb) cb();
					};
					update_request.onerror = function(){
						console.log('update request error');
						if(cb) cb();
					};
				})
				.catch(function(err){
					if(cb) cb(err);
				});
		}
	},
	threadMessages(message_ids, cb){
		/*
			For all messages in array $message_ids (e.g. "INBOX:100"):
				1. Thread the message, updating the local message object with a thread_id.
				2. Update the thread with the message id.
				3. Store the thread ID with the message's PID.
		*/
		console.log('threading messages');
		var promises = message_ids.map((message_id)=> this.threadMessageAsync(message_id));
		return Promise.reduce(promises); // not sure if this is right
	},
	saveAttachments(box_name, mail_object, cb){
		if(!mail_object.attachments){
			if(cb) cb(null, mail_object);
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
						cb(null, mail_object);
					}
				});
			});
		});
	},
  shortenSubject(subject){
    if(subject){
      return subject.replace(/([\[\(] *)?(RE?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
    }
    else{
      return subject;
    }
  },
	saveToBox(mailbox_name, mail_obj, cb){
		// console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
		process.stdout.write('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
    var db = this.db;
		return this.saveAttachmentsAsync(mailbox_name, mail_obj)
			.then((mail_obj)=>{
				mail_obj.mailbox = mailbox_name;
				var tx = db.transaction("box_"+mailbox_name,"readwrite");
				var store = tx.objectStore("box_"+mailbox_name);
				mail_obj.uid = parseInt(mail_obj.uid,10);
				mail_obj.subject = mail_obj.subject ? mail_obj.subject : '';
				mail_obj.short_subject = this.messages.shortenSubject(mail_obj.subject);
				mail_obj.pid = this.messages.getPID(mail_obj);
				var put_request = store.put(mail_obj);
				put_request.onsuccess = function(){
					// console.log('      save for '+mailbox_name+':'+mail_obj.uid+' successful!');
					// dbHandler.threadMail(mailbox_name, mail_obj);
					if(cb) cb();
				};
				put_request.onerror = function(err){
					if(cb) cb(err);
				};
			})
			.catch((err)=>{
				if(cb) cb(err);
			});
	},
	getPID(mail_obj){
		return [mail_obj.subject.substring(0,10) || '', mail_obj.headers.from || '', mail_obj.date, mail_obj.messageId].join('|');
	}
};
