var dbHandler = window.dbHandler;
var Imaper = require('../modules/imaper.js');
var Q = require('Q');
var fs = require('fs-extra');
var syncing = false;

var indexedDB = window.indexedDB;

function Syncer(conf){
	this.imaper = new Imaper();
	this.dbHandler = new dbHandler();
	this.conf = conf;
	return this;
}
Syncer.prototype = {
	start: function(){
		// Starts the syncer, which syncs the mailboxes at regular intervals
		var self = this;
		this.runSync();
		// This poll was meant to keep the syncer running in the case of an IMAP error. However, it doesn't really work well!
		// It needs to be rethought. Probably should just listen for an imap error.
		this.interval = setInterval(function(){
			self.runSync();
		}, 15000);
		return this;
	},
	stop: function(){
		// Stops running the syncer
		if(this.interval){
			clearInterval(this.interval);
		}
		return this;
	},
	runSync: function(){
		var self = this;
		this.syncAll()
			.then(function(results){
				if(results !== false){
					if(self.conf.syncComplete){
						self.conf.syncComplete();
					}
				}
			});
	}
};

Syncer.prototype.syncAll = function(){
	/*
	Syncs all local boxes with all remotes boxes.
	Deletes local messages that no longer exist on the remote server.
	Updates any local flags that do reflect the remote server.
	Threads all new messages.
	 */
	var self = this;
	var def = Q.defer();
	if(syncing === true){
		def.resolve(false);
		return def.promise;
	}
	else{
		syncing = true;
	}
	console.log('syncing all boxes');
	var box_paths = box_paths;
	var remote_descriptors;
	this.imaper.connect()
		.then(function(){
			return self.imaper.getBoxPaths();
		})
		.then(function(paths){
			// These were creating some problems for me so I've removed them from the syncing process for now.
			paths.splice(paths.indexOf('Deleted Items'), 1);
			paths.splice(paths.indexOf('Drafts'), 1);
			box_paths = paths;
			if(global.PREFERENCES.demo){
				box_paths = box_paths.filter(function(i){
					return i.indexOf('SlateMail') === 0 || i === 'INBOX';
				});
			}
			// box_paths = ['INBOX'];
		})
		.then(function(){
			console.log('BOX PATHS', box_paths);
			console.log('deleting boxes');
			var def = Q.defer();
			self.dbHandler.getAllMailboxes()
				.then(function(local_boxes){
					var boxes_to_delete = [];
					local_boxes.forEach(function(local_box){
						if(box_paths.indexOf(local_box)===-1){
							boxes_to_delete.push(local_box);
						}
					});
					if(boxes_to_delete.length > 0){
						self.dbHandler.deleteBoxes(boxes_to_delete)
							.then(function(){
								def.resolve();
							});
					}
					else{
						console.log('no local boxes to delete');
						def.resolve();
					}
				});
			return def.promise;
		})
		.then(function(){
			return self.dbHandler.ensureLocalBoxes(box_paths);
		})
		.then(function(){
			var def = Q.defer();
			var promises = [];
			var box_results = {};
			box_paths.forEach(function(box_path){
				promises.push(function(){
					var def = Q.defer();
					self.getRemoteDescriptors(box_path)
						.then(function(results){
							box_results[box_path] = results;
							def.resolve();
						});
					return def.promise;
				});
			});
			promises.reduce(Q.when, Q())
				.then(function(){
					remote_descriptors = box_results;
					def.resolve();
				})
				.catch(function(err){
					console.log(err);
				});
			return def.promise;
		})
		.then(function(){
			var promises = [];
			var results = [];
			var def = Q.defer();
			box_paths.forEach(function(box_path){
				promises.push(function(){
					return self.syncBox(box_path, remote_descriptors[box_path])
						.then(function(box_results){
							results.push(box_results);
						});
				});
			});
			promises.reduce(Q.when, Q())
				.then(function(){
					def.resolve(results);
				});
			return def.promise;
		})
		.then(function(results){
			console.log('downloading and deletion complete; threading now');
			var def = Q.defer();
			var promises = [];
			results.forEach(function(mailbox){
				mailbox.new_messages.forEach(function(msg){
					if(msg.downloaded === true){
						promises.push(function(){
							return self.dbHandler.threadMessage(mailbox.mailbox, msg.uid);
						});
					}
				});			
			});
			promises.reduce(Q.when, Q())
				.then(function(){
					def.resolve();
				});
			return def.promise;
		})
		.then(function(){
			return self.saveAllDescriptors(remote_descriptors);
		})
		.fin(function(){
			syncing = false;
			console.log('SYNCING COMPLETE');
			def.resolve(true);
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
};


Syncer.prototype.saveAllDescriptors = function(descriptors){
	var def = Q.defer();
	var promises = [];
	for(var i in descriptors){
		promises.push(this.saveDescriptors(i, descriptors[i]));
	}
	Q.all(promises)
		.then(function(){
			def.resolve();
		});
	return def.promise;
};

Syncer.prototype.syncBox = function(mailbox_name, remote_descriptors){
	/* Syncs a box. Returns a list of UIDs of new messages saved */
	console.log('---------------- syncing: '+mailbox_name+' ----------------');
	var def = Q.defer();
	var local_descriptors;
	var downloaded_messages;
	var self = this;
	this.getLocalDescriptors(mailbox_name)
		.then(function(local_descriptors){
			return Q.all([
				self.deleteLocalMessages(mailbox_name, local_descriptors, remote_descriptors), // delete any local messages that are no longer in remote messages
				self.downloadNewMail(mailbox_name, local_descriptors, remote_descriptors), // download any remote messages that are not in local messages
				self.updateFlags(mailbox_name, local_descriptors, remote_descriptors) // update local flags with remote flags where they differ
			]);
		})
		.then(function(outputs){
			// an IMAP box might report a UID before the message is available to download.
			// If any messages failed to download, remove it from the new local descriptors record before it's saved.
			// Otherwise, the client will think it has an email that it doesn't and never download it.
			downloaded_messages = outputs[1];
			downloaded_messages.forEach(function(msg){
				if(msg.downloaded === false){
					delete remote_descriptors[msg.uid];
				}
			});
			return self.imaper.expunge(mailbox_name);
		})
		.then(function(){
			console.log('syncing of '+mailbox_name+' complete');
			def.resolve({
				mailbox: mailbox_name,
				new_messages: downloaded_messages
			});
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
};

Syncer.prototype.updateFlags = function(mailbox_name, local_descriptors, remote_descriptors){
	console.log('updating flags for '+mailbox_name);
	var def = Q.defer();
	var to_update = [];
	var self = this;
	for(var uid in local_descriptors){
		if(remote_descriptors[uid]){
			var local_flags = local_descriptors[uid];
			var remote_flags = remote_descriptors[uid];
			if(!arraysEqual(local_flags, remote_flags)){
				to_update.push({uid:uid,flags:remote_flags});
			}
		}
	}
	var promises = [];
	to_update.forEach(function(update){
		promises.push(self.dbHandler.updateFlags(mailbox_name, update.uid, update.flags));
	});
	Q.all(promises)
		.then(function(){
			console.log('flags updated');
		})
		.catch(function(err){
			console.log(err);
		});
	// dbHandler.updateFlags(mailbox_name, uid, remote_flags);
	function arraysEqual(arr1, arr2) {
		if(arr1.length !== arr2.length)
				return false;
		for(var i = arr1.length; i--;) {
				if(arr1[i] !== arr2[i])
						return false;
		}
		return true;
	}
};

Syncer.prototype.getRemoteDescriptors = function(mailbox_name){
	console.log('get remote descriptor: '+mailbox_name);
	var def = Q.defer();
	this.imaper.getUIDsFlags(mailbox_name)
		.then(function(msgs){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = msg.flags;
			});
			def.resolve(out);			
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
};

Syncer.prototype.getLocalDescriptors = function(mailbox_name){
	var def = Q.defer();
	var request = indexedDB.open('slatemail');
	request.onsuccess = function(){
		var db = request.result;
		var tx = db.transaction("descriptors",'readonly');
		var object_store = tx.objectStore('descriptors');
		var get_request = object_store.get(mailbox_name);
		get_request.onsuccess = function(){
			var result = get_request.result;
			if(result){
				def.resolve(result.descriptors);
			}
			else{
				def.resolve({});
			}
		};
	};
	return def.promise;
};

Syncer.prototype.deleteLocalMessages = function(mailbox_name, local_descriptors, remote_descriptors){
	console.log('deleting local messages');
	var def = Q.defer();
	var promises = [];
	var messages_to_delete = [];
	var self = this;
	for(var uid in local_descriptors){
		if(uid in remote_descriptors === false){
			messages_to_delete.push(parseInt(uid,10));
		}
	}
	messages_to_delete.forEach(function(uid){
		promises.push(self.dbHandler.removeLocalMessage(mailbox_name, uid));
	});
	Q.all(promises)
		.then(function(){
			console.log('local messages deleted');
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
};

Syncer.prototype.saveDescriptors = function(mailbox_name, msgs){
	console.log('saving descriptors');
	var def = Q.defer();
	var request = indexedDB.open('slatemail');
	request.onsuccess = function(){
		var db = request.result;
		var tx = db.transaction("descriptors",'readwrite');
		var object_store = tx.objectStore('descriptors');
		var insert_obj = {
			mailbox: mailbox_name,
			descriptors: msgs
		};
		var put_request = object_store.put(insert_obj);
		put_request.onsuccess = function(){
			def.resolve();
		};
	};
	return def.promise;
};


Syncer.prototype.downloadNewMail = function(mailbox_name, local_descriptors, remote_descriptors){
	console.log('downloading new mail');
	var self = this;
	var def = Q.defer();
	var to_get = [];
	var promises = [];
	for(var uid in remote_descriptors){
		if(uid in local_descriptors === false){
			to_get.push(uid);
		}
	}
	
	console.log('total messages to get: '+promises.length);

	var results = [];
	to_get.forEach(function(uid, index){
		promises.push(function(){
			return self.dbHandler.getMailFromLocalBox(mailbox_name, uid)
				.then(function(mail_obj){
					if(mail_obj === false){
						return self.downloadMessage(mailbox_name, uid, remote_descriptors, index, promises.length)
							.then(function(res){
								results.push(res);
							});
						}
					else{
						console.log('skipping download of '+mailbox_name+':'+uid+'; already in local database');
						results.push({
							uid: uid,
							downloaded: true,
							flags: mail_obj.flags
						});
					}
				});
		});
	});

	promises.reduce(Q.when, Q())
		.then(function(){
			def.resolve(results);
		});
	return def.promise;
};

Syncer.prototype.downloadMessage = function(mailbox_name, uid, remote_descriptors, index, l){
	console.log('------------ downloading message '+mailbox_name+':'+uid+', index = '+index+' of '+l+'-------------------');
	// console.log(remote_descriptors[uid]);
	var def = Q.defer();
	var self = this;
	this.imaper.getMessageWithUID(mailbox_name, uid)
		.then(function(mail_obj){
			if(!mail_obj){
				console.log('no mail object found... '+mailbox_name+':'+uid);
				def.resolve({uid:uid, downloaded:false, flags:mail_obj.flags});
			}
			else{
				// console.log(mail_obj);
				// mail_obj.date = mail_obj.date.toString();
				mail_obj.flags = remote_descriptors[uid];
				mail_obj.uid = uid;
				self.dbHandler.saveMailToLocalBox(mailbox_name, mail_obj)
					.then(function(){
						console.log('\t\tMESSAGE '+uid+' (index '+ index +') SAVED; RESOLVING.');
						def.resolve({
							uid:uid,
							downloaded:true,
							flags:mail_obj.flags
						});
					})
					.catch(function(err){
						console.log("ERROR IN DOWNLOAD MESSAGE");
						console.log(err);
						def.resolve({
							uid:uid,
							downloaded:false,
							flags:mail_obj.flags
						});
					});
			}
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
};

module.exports = Syncer;
