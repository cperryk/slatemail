// jshint esnext: true
var dbHandler = window.dbHandler;
var Imaper = require('../modules/imaper.es6');
var Q = require('Q');
var fs = require('fs-extra');
var throat = require('throat');
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
		this.stopped = false;
		this.runSync();
		return this;
	},
	stop: function(){
		// Stops running the syncer
		this.stopped = true;
		return this;
	},
	runSync: function(){
		if(self.stopped !== false){
			return;
		}
		this.syncAll()
			.then((results)=>{
				if(results !== false){
					if(this.conf.onSyncComplete){
						this.conf.onSyncComplete();
					}
					setTimeout(()=>{
						this.runSync();
					}, 15000);
				}
			});
	}
};

Syncer.prototype.syncAll = function(cb){
	/*
	Syncs all local boxes with all remotes boxes.
	Deletes local messages that no longer exist on the remote server.
	Updates any local flags that do reflect the remote server.
	Threads all new messages.
	 */
	var self = this;
	if(syncing === true){
		return cb();
	}
	else{
		syncing = true;
	}
	console.log('syncing all boxes');
	var box_paths = box_paths;
	var remote_descriptors;
	this.imaper.connect()
		.then(()=>{
			return this.imaper.getBoxPaths();
		})
		.then((paths)=>{
			paths.splice(paths.indexOf('Deleted Items'), 1);
			paths.splice(paths.indexOf('Drafts'), 1);
			if(global.PREFERENCES.demo){
				box_paths = paths.filter((path)=>{
					return path.indexOf('SlateMail') === 0 || path === 'INBOX' || path === 'Sent Items';
				});
			}
		})
		.then(()=>{
			console.log('BOX PATHS', box_paths);
			console.log('deleting boxes');
			var local_boxes = this.dbHandler.list();
			var boxes_to_delete = local_boxes.filter((local_box)=>{
				return box_paths.indexOf(local_box) === -1;
			});
			if(boxes_to_delete.length > 0){
				return this.dbHandler.mailboxes.delete(boxes_to_delete);
			}
			else{
				console.log('no local boxes to delete');
				return true;
			}
		})
		.then(()=>{
			return this.dbHandler.mailboxes.ensure(box_paths);
		})
		.then(()=>{
			var box_results = {};
			var promises = box_paths.map(function(box_path){
				return new Promise((resolve, reject)=>{
					self.getRemoteDescriptorsAsync(box_path)
						.then(function(results){
							box_results[box_path] = results;
							resolve();
						})
						.catch(reject);
				});
			});
			return promises.reduce(Q.when, Q())
				.then(function(){
					remote_descriptors = box_results;
				});
		})
		.then(function(){
			return new Promise(function(resolve, reject){
				var results = [];
				var promises = box_paths.map(function(box_path){
					return new Promise(function(resolve, reject){
						self.syncBoxAsync(box_path, remote_descriptors[box_path])
							.then(function(box_results){
								results.push(box_results);
								resolve();
							});
					});
				});
				return promises.reduce(Q.when, Q())
					.then(function(){
						resolve(results);
					});
			});
		})
		.then(function(results){
			console.log(results);
			console.log('downloading and deletion complete; threading now');
			var def = Q.defer();
			var promises = [];
			results.forEach(function(mailbox){
				mailbox.new_messages.forEach(function(msg){
					if(msg.downloaded === true){
						promises.push(function(){
							return self.dbHandler.messages.threadAsync(mailbox.mailbox, msg.uid);
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
			cb(null, true);
		})
		.catch(function(err){
			console.log(err);
			cb(err);
		});
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
	this.getLocalDescriptorsAsync(mailbox_name)
		.then((local_descriptors)=>{
			// if(mailbox_name==='INBOX'){
			// 	local_descriptors = [];
			// }
			return Q.all([
				this.deleteLocalMessagesAsync(mailbox_name, local_descriptors, remote_descriptors),
				this.downloadNewMailAsync(mailbox_name, local_descriptors, remote_descriptors),
				this.updateFlagsAsync(mailbox_name, local_descriptors, remote_descriptors)
			]);
		})
		.then(function(outputs){
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

Syncer.prototype.updateFlags = function(mailbox_name, local_descriptors, remote_descriptors, cb){
	console.log('updating flags for '+mailbox_name);
	var to_update = [];
	for(var uid in local_descriptors){
		if(remote_descriptors[uid]){
			var local_flags = local_descriptors[uid];
			var remote_flags = remote_descriptors[uid];
			if(!arraysEqual(local_flags, remote_flags)){
				to_update.push({uid:uid,flags:remote_flags});
			}
		}
	}
	var promises = to_update.map((update)=>{
		return promises.push(this.dbHandler.mailboxes.select(mailbox_name).select(update.uid).updateFlags(update.flags));
	});
	Promise.all(promises)
		.then(function(){
			console.log('flags updated');
			cb();
		})
		.catch(function(err){
			cb(err);
		});
};

Syncer.prototype.getRemoteDescriptors = function(mailbox_name, cb){
	console.log('get remote descriptor: '+mailbox_name);
	this.imaper.getUIDsFlags(mailbox_name)
		.then(function(msgs){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = msg.flags;
			});
			cb(null, out);
		})
		.catch(function(err){
			cb(err);
		});
};

Syncer.prototype.getLocalDescriptors = function(mailbox_name, cb){
	var request = indexedDB.open('slatemail');
	request.onsuccess = function(){
		var db = request.result;
		var tx = db.transaction("descriptors",'readonly');
		var object_store = tx.objectStore('descriptors');
		var req = object_store.get(mailbox_name);
		req.onsuccess = function(){
			var result = req.result;
			if(result){
				cb(null, result.descriptors);
			}
			else{
				cb(null, {});
			}
		};
		req.onerror = function(err){
			cb(err);
		};
	};
};

Syncer.prototype.deleteLocalMessages = function(mailbox_name, local_descriptors, remote_descriptors, cb){
	console.log('deleting local messages');
	var messages_to_delete = [];
	for(var uid in local_descriptors){
		if(uid in remote_descriptors === false){
			messages_to_delete.push(parseInt(uid,10));
		}
	}
	var promises = messages_to_delete.map((uid)=>{
		return this.dbHandler.mailboxes.select(mailbox_name).select(uid).deleteAsync();
	});
	Promise.all(promises)
		.then(function(){
			console.log('local messages deleted');
			if(cb) cb();
		})
		.catch(function(err){
			if(cb) cb(err);
		});
};

Syncer.prototype.saveDescriptors = function(mailbox_name, msgs){
	// console.log('saving descriptors');
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
	// var promises = [];
	for(var uid in remote_descriptors){
		if(uid in local_descriptors === false){
			to_get.push(uid);
		}
	}


	var results = [];
	var promises = to_get.map(function(uid, index){
		return function(){
			return self.dbHandler.getMailFromLocalBoxAsync(mailbox_name, uid)
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
		};
	});

	console.log('total messages to get: '+promises.length);

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
				self.dbHandler.saveMailToLocalBoxAsync(mailbox_name, mail_obj)
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

function arraysEqual(arr1, arr2) {
	if(arr1.length !== arr2.length)
			return false;
	for(var i = arr1.length; i--;) {
			if(arr1[i] !== arr2[i])
					return false;
	}
	return true;
}

module.exports = Syncer;
