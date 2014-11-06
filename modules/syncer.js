var dbHandler = require('../modules/dbHandler.js');
var imapHandler = require('../modules/imapHandler.js');
var Q = require('Q');
var fs = require('fs-extra');

function syncAll(){
	console.log('syncing all boxes');
	var def = Q.defer();
	imapHandler.getBoxes()
		.then(function(boxes){ // get the mailbox names for syncing
			var box_names = [];
			for(var i in boxes){
				if(i!=='Calendar' && i!=='Contacts' && i!=='Tasks'){
					box_names.push(i);
				}
			}
			return box_names;
		})
		.then(function(box_names){ // get the promises
			var chain = Q.fcall(function(){});
			box_names.forEach(function(box_name){
				var link = function(){
					var def = Q.defer();
					syncBox(box_name)
						.then(function(){
							def.resolve();
						});
					return def.promise;
				};
				chain = chain.then(link);
			});
			return chain;
		})
		.then(function(){
			console.log('full sync complete!');
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}

function syncBox(mailbox_name){
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
				var downloaded_messages = outputs[1];
				downloaded_messages.forEach(function(msg){
					if(msg.downloaded === false){
						delete remote_descriptors[msg.uid];
					}
				});
				return Q.all([
					saveDescriptors(mailbox_name, remote_descriptors) // save the remote descriptors to local
				]);
			});
		})
		.then(function(){
			console.log('sync complete!');
			def.resolve();
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
			console.log('FLAGS UPDATED');
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
		promises.push(dbHandler.deleteMessage(mailbox_name, uid));
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
	var def = Q.defer();
	var to_get = [];
	var promises = [];
	for(var uid in remote_descriptors){
		if(uid in local_descriptors === false){
			to_get.push(uid);
		}
	}

	// promises.push(downloadMessage(mailbox_name, to_get[0], remote_descriptors, 0));
	to_get.forEach(function(uid, index){
		promises.push(downloadMessage(mailbox_name, uid, remote_descriptors, index));
	});
	

	Q.all(promises)
		.then(function(results){
			console.log('ALL MESSAGES DOWNLOADED');
			def.resolve(results);
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}

var resolved_messages = 0;

function downloadMessage(mailbox_name, uid, remote_descriptors, index){
	// console.log('downloading message with uid: '+uid);
	// console.log(remote_descriptors[uid]);
	var def = Q.defer();
	imapHandler.getMessageWithUID(mailbox_name, uid)
		.then(function(mail_obj){
			if(!mail_obj){
				console.log('no mail object found... '+mailbox_name+':'+uid);
				def.resolve({uid:uid, downloaded:false, flags:mail_obj.flags});
			}
			else{
				mail_obj.flags = remote_descriptors[uid];
				mail_obj.uid = uid;
				dbHandler.saveMailToLocalBox(mailbox_name, mail_obj)
					.then(function(){
						resolved_messages++;
						// console.log('\t\tMESSAGE '+uid+' SAVED; RESOLVING. '+(index+1)+' - '+resolved_messages+' resolved');
						def.resolve({uid:uid, downloaded:true, flags:mail_obj.flags});
					})
					.catch(function(err){
						console.log("ERROR IN DOWNLOAD MESSAGE");
						console.log(err);
						def.resolve({uid:uid, downloaded:false, flags:mail_obj.flags});
					});
			}
		})
		.catch(function(err){
			console.log(err);
		});
	return def.promise;
}


module.exports = {syncAll:syncAll, syncBox:syncBox};