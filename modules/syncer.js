var dbHandler = window.dbHandler;
var imapHandler = require('../modules/imapHandler.js');
var Q = require('Q');
var fs = require('fs-extra');
var syncing = false;

function syncAll(){
	/*
	Syncs all local boxes with all remotes boxes.
	Deletes local messages that no longer exist on the remote server.
	Updates any local flags that do reflect the remote server.
	Threads all new messages.
	 */
	console.log('syncing all boxes');
	if(syncing === true){
		return;
	}
	else{
		syncing = true;
	}
	var def = Q.defer();
	var box_paths = box_paths;
	var remote_descriptors;
	imapHandler.getBoxPaths()
		.then(function(paths){
			// console.log(paths);
			paths.splice(paths.indexOf('Deleted Items'), 1);
			paths.splice(paths.indexOf('Drafts'), 1);
			paths.splice(paths.indexOf('List'), 1);
			box_paths = paths;
			// box_paths = ['INBOX','2014/08/quiz: yogurt'];
		})
		.then(function(){
			console.log('deleting boxes');
			var def = Q.defer();
			dbHandler.getAllMailboxes()
				.then(function(local_boxes){
					var boxes_to_delete = [];
					local_boxes.forEach(function(local_box){
						if(box_paths.indexOf(local_box)===-1){
							boxes_to_delete.push(local_box);
						}
					});
					if(boxes_to_delete.length > 0){
						dbHandler.deleteBoxes(boxes_to_delete)
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
			console.log(box_paths);
			var def = Q.defer();
			var promises = [];
			var box_results = {};
			box_paths.forEach(function(box_path){
				promises.push(function(){
					var def = Q.defer();
					getRemoteDescriptors(box_path)
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
			box_paths.forEach(function(box_path){
				promises.push(function(){
					return syncBox(box_path, remote_descriptors[box_path]);
				});
			});
			return promises.reduce(Q.when, Q());
		})
		.then(function(){
			console.log('downloading and deletion complete; threading now');
			var def = Q.defer();
			var promises = [];
			for(var box in remote_descriptors){
				for(var uid in remote_descriptors[box]){
					addIt(box, uid);
				}
			}
			console.log('plength: '+promises.length);
			console.log(promises);
			promises.reduce(Q.when, Q())
				.then(function(){
					def.resolve();
				});
			return def.promise;
			function addIt(box, uid){
				promises.push(function(){
					return dbHandler.threadMessage(box, uid);
				});
			}
			function thread(box, uid){
				return dbHandler.threadMessage(box, uid);
			}
		})
		.then(function(){
			var def = Q.defer();
			return saveAllDescriptors(remote_descriptors);
		})
		.fin(function(){
			syncing = false;
			console.log('SYNCING COMPLETE');
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}


function saveAllDescriptors(descriptors){
	console.log('HELLO< WTF');
	var def = Q.defer();
	var promises = [];
	for(var i in descriptors){
		promises.push(saveDescriptors(i, descriptors[i]));
	}
	Q.all(promises)
		.then(function(){
			def.resolve();
		});
	return def.promise;
}

function syncBox(mailbox_name, remote_descriptors){
	/* Syncs a box. Returns a list of UIDs of new messages saved */
	console.log('---------------- syncing: '+mailbox_name+' ----------------');
	console.log(remote_descriptors);
	var def = Q.defer();
	var local_descriptors;
	var downloaded_messages;
	dbHandler.ensureLocalBox(mailbox_name)
		.then(function(){
			return getLocalDescriptors(mailbox_name);
		})
		.then(function(local_descriptors){
			return Q.all([
				deleteLocalMessages(mailbox_name, local_descriptors, remote_descriptors), // delete any local messages that are no longer in remote messages
				downloadNewMail(mailbox_name, local_descriptors, remote_descriptors), // download any remote messages that are not in local messages
				updateFlags(mailbox_name, local_descriptors, remote_descriptors) // update local flags with remote flags where they differ
			]);
		})
		.then(function(outputs){
			// an IMAP box might report a UID before the message is available to download.
			// If any messages failed to download, remove it from the new local descriptors record before it's saved.
			// Otherwise, the client will think it has an email that it doesn't and never download it.
			console.log(outputs);
			downloaded_messages = outputs[1];
			downloaded_messages.forEach(function(msg){
				if(msg.downloaded === false){
					delete remote_descriptors[msg.uid];
				}
			});
			return imapHandler.expunge(mailbox_name);
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
}

function updateFlags(mailbox_name, local_descriptors, remote_descriptors){
	console.log('updating flags');
	var def = Q.defer();
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
	var promises = [];
	to_update.forEach(function(update){
		promises.push(dbHandler.updateFlags(mailbox_name, update.uid, update.flags));
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
}

function getRemoteDescriptors(mailbox_name){
	console.log('get remote descriptor: '+mailbox_name);
	var def = Q.defer();
	imapHandler.getUIDsFlags(mailbox_name)
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
}

function getLocalDescriptors(mailbox_name){
	var def = Q.defer();
	var file_path = './descriptors/'+mailbox_name+'_uids.json';
	fs.exists(file_path, function(exists){
		if(!exists){
			def.resolve({});
		}
		fs.readJson(file_path, 'utf8', function(err, msgs){
			def.resolve(msgs);
		});
	});
	return def.promise;
}





function deleteLocalMessages(mailbox_name, local_descriptors, remote_descriptors){
	console.log('deleting local messages');
	var def = Q.defer();
	var promises = [];
	var messages_to_delete = [];
	for(var uid in local_descriptors){
		if(uid in remote_descriptors === false){
			messages_to_delete.push(parseInt(uid,10));
		}
	}
	messages_to_delete.forEach(function(uid){
		promises.push(dbHandler.removeLocalMessage(mailbox_name, uid));
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
}

function saveDescriptors(mailbox_name, msgs){
	console.log('saving descriptors');
	var def = Q.defer();
	var file_name = './descriptors/'+mailbox_name+'_uids.json';
	var data = JSON.stringify(msgs);
	fs.outputFile(file_name, data, function(err){
		def.resolve();
	});
	return def.promise;
}



function downloadNewMail(mailbox_name, local_descriptors, remote_descriptors){
	console.log('downloading new mail');

	// imapHandler.setError(function(){
	// 	console.log('error detected; responding');
	// 	return downloadNewMail(mailbox_name, local_descriptors, remote_descriptors);
	// });

	resolved_messages = 0;
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
			return dbHandler.getMailFromLocalBox(mailbox_name, uid)
				.then(function(mail_obj){
					if(mail_obj === false){
						return downloadMessage(mailbox_name, uid, remote_descriptors, index, promises.length)
							.then(function(res){
								results.push(res);
							});
						}
					else{
						console.log('skipping download of '+mailbox_name+':'+uid+'; already in local database');
					}
				});
		});
	});

	promises.reduce(Q.when, Q())
		.then(function(){
			def.resolve(results);
		});
	// Q.all(promises)
		// .then(function(results){
		// 	console.log('all messages downloaded');
		// 	def.resolve(results);
		// })
		// .catch(function(err){
		// 	console.log(err);
		// });
	return def.promise;
}

var resolved_messages = 0;

function downloadMessage(mailbox_name, uid, remote_descriptors, index, l){
	console.log('------------ downloading message '+mailbox_name+':'+uid+', index = '+index+' of '+l+'-------------------');
	// console.log(remote_descriptors[uid]);
	var def = Q.defer();
	imapHandler.getMessageWithUID(mailbox_name, uid)
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
				dbHandler.saveMailToLocalBox(mailbox_name, mail_obj)
					.then(function(){
						resolved_messages++;
						console.log('\t\tMESSAGE '+uid+' (index '+ index +') SAVED; RESOLVING. '+(index+1)+' of '+resolved_messages+' resolved');
						def.resolve({uid:uid, downloaded:true, flags:mail_obj.flags});
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
}

module.exports = {syncAll:syncAll, syncBox:syncBox};
