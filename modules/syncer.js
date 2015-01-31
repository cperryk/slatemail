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
	imapHandler.getBoxes() // returns an object reflecting the organizational structure of the user's mailboxes
		.then(function(boxes){ // get the mailbox names for syncing
			boxes = (function toArray(){
				// returns an array of all box paths
				var box_names = [];
				for(var i in boxes){
					if(i!=='Calendar' && i!=='Contacts' && i!=='Tasks'){ // skip these boxes as they do not have email
						addBoxes(i, boxes[i]);
					}
				}
				return box_names;
				function addBoxes(box_path, box_properties){
					box_names.push(box_path);
					for(var i in box_properties.children){
						addBoxes(box_path+'/'+i, box_properties.children[i]);
					}
				}
			}());
			return boxes;
			// return ['INBOX'];
		})
		.then(function syncBoxes(box_names){
			// build and run a promise chain that syncs the boxes sequentially
			var chain = Q.fcall(function(){
				return [];
			});
			box_names.forEach(function(box_name){
				if(box_name.substring(0, 'Deleted Items'.length) === 'Deleted Items' || box_name === "Drafts"){
					return;
				}
				var link = function(arr){
					var def = Q.defer();
					syncBox(box_name)
						.then(function(results){
							setTimeout(function(){
								arr.push(results);
								def.resolve(arr);
							},0);
						});
					return def.promise;
				};
				chain = chain.then(link);
			});
			return chain;
		})
		.then(function listNewMessages(sync_results){
			// compile a single list of message IDs for all new messages that have just been downloaded
			var all_new_messages = [];
			sync_results.forEach(function(box){
				box.new_messages.forEach(function(message){
					if(message.downloaded){
						all_new_messages.push(box.mailbox+':'+message.uid);
					}
				});
			});
			return all_new_messages;
		})
		.then(function(new_messages){
			console.log(new_messages);
			// thread all these new messages
			return dbHandler.threadMessages(new_messages);
		})
		.fin(function(){
			console.log('*** SYNCING COMPLETE ***');
			syncing = false;
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}

function syncBox(mailbox_name){
	/* Syncs a box. Returns a list of UIDs of new messages saved */
	console.log('---------------- syncing: '+mailbox_name+' ----------------');
	var def = Q.defer();
	dbHandler.ensureLocalBox(mailbox_name)
		.then(function(){
			return Q.all([
				getLocalDescriptors(mailbox_name),
				getRemoteDescriptors(mailbox_name)
			]);
		})
		.then(function(descriptors){
			var local_descriptors = descriptors[0];
			var remote_descriptors = descriptors[1];
			return Q.all([
				deleteLocalMessages(mailbox_name, local_descriptors, remote_descriptors), // delete any local messages that are no longer in remote messages
				downloadNewMail(mailbox_name, local_descriptors, remote_descriptors), // download any remote messages that are not in local messages
				updateFlags(mailbox_name, local_descriptors, remote_descriptors) // update local flags with remote flags where they differ
			])
			.then(function(outputs){
				// an IMAP box might report a UID before the message is available to download.
				// If any messages failed to download, remove it from the new local descriptors record before it's saved.
				// Otherwise, the client will think it has an email that it doesn't and never download it.
				console.log(outputs);
				var downloaded_messages = outputs[1];
				var saved_messages = [];
				downloaded_messages.forEach(function(msg){
					if(msg.downloaded === false){
						delete remote_descriptors[msg.uid];
					}
				});
				return Q.all([
					saveDescriptors(mailbox_name, remote_descriptors), // save the remote descriptors to local descriptor file
					imapHandler.expunge(mailbox_name)
				])
				.then(function(){
					return downloaded_messages;
				});
			});
		})
		.then(function(downloaded_messages){
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
	var deferred = Q.defer();
	var file_name = './descriptors/'+mailbox_name+'_uids.json';
	var data = JSON.stringify(msgs);
	fs.outputFile(file_name, data, function(err){
		deferred.resolve();
	});
	return deferred.promise;
}



function downloadNewMail(mailbox_name, local_descriptors, remote_descriptors){
	console.log('downloading new mail');
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
			return downloadMessage(mailbox_name, uid, remote_descriptors, index, promises.length)
				.then(function(res){
					results.push(res);
				});
		});
	});

	promises.reduce(Q.when, Q(true))
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
