var dbHandler = require('../modules/dbHandler.js');
var imapHandler = require('../modules/imapHandler.js');
var Q = require('Q');
var fs = require('fs-extra');

function syncAll(){
	console.log('syncing all boxes');
	var def = Q.defer();
	imapHandler.getBoxes()
		.then(function(boxes){
			var box_names = [];
			for(var i in boxes){
				if(i!=='Calendar' && i!=='Contacts' && i!=='Tasks'){
					box_names.push(i);
				}
			}
			syncBoxRecursion(box_names, 0, function(){
				console.log('syncAll complete');
				def.resolve();
			});
			function syncBoxRecursion(box_names, current_index, callback){
				syncBox(box_names[current_index])
					.then(function(){
						if(current_index === box_names.length-1){
							callback();
						}
						else{
							syncBoxRecursion(box_names, current_index+1, callback);
						}
					})
					.catch(function(err){
						console.log(err);
					});
			}
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
			return imapHandler.getUIDsFlags(mailbox_name);
		})
		.then(function(msgs){
			if(msgs.length===0){
				throw new Error("No messages");
			}
			this.msgs = msgs;
			return deleteLocalMessages(msgs);
		})
		.then(function(){
			console.log('downloading new mail...');
			return downloadNewMail(this.msgs);
		})
		.then(function(){
			console.log('updating flags...');
			return updateFlags(this.msgs);
		})
		.then(function(){
			console.log('saving uids...');
			return saveUIDs(this.msgs);
		})
		.then(function(){
			def.resolve();
		})
		.catch(function(error){
			def.resolve();
		});
	return def.promise;

	function updateFlags(msgs){
		msgs = (function(){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = msg.flags;
			});
			return out;
		}());
		var def = Q.defer();
		var file_path = './descriptors/'+mailbox_name+'_uids.json';
		fs.exists(file_path, function(exists){
			if(exists){
				fs.readJson(file_path, 'utf8', function(err, existing_msgs){
					existing_msgs.forEach(function(msg){
						var uid = msg[0];
						var local_flags = msg[1];
						var remote_flags = msgs[uid];
						if(msgs[uid]){
							if(!arraysEqual(msg[1],msgs[uid])){
								dbHandler.updateFlags(mailbox_name, uid, remote_flags);
							}
						}
					});
					def.resolve();
				});
			}
			else{
				def.resolve();
			}
		});
		function arraysEqual(arr1, arr2) {
			if(arr1.length !== arr2.length)
					return false;
			for(var i = arr1.length; i--;) {
					if(arr1[i] !== arr2[i])
							return false;
			}
			return true;
		}
		return def.promise;
	}

	function saveUIDs(msgs, callback){
		var deferred = Q.defer();
		var uids = (function(){
			var out = [];
			msgs.forEach(function(msg){
				out.push([msg.uid,msg.flags]);
			});
			return out;
		}());
		var file_name = './descriptors/'+mailbox_name+'_uids.json';
		var data = JSON.stringify(uids);
		fs.outputFile(file_name, data, function(err){
			deferred.resolve();
		});
		return deferred.promise;
	}
	function downloadNewMail(msgs){
		var deferred = Q.defer();
		syncChunk(msgs, 0, msgs.length, function(){
			console.log('sync complete');
			deferred.resolve();
		});
		return deferred.promise;
	}
	function syncChunk(msgs, limitx, message_count, callback){
		console.log('--- sync chunk '+limitx+','+message_count);
		var max_msg = Math.min(message_count, limitx+100);
		var chunk = msgs.slice(limitx, max_msg);
		addLocalMessages(chunk, function(){
			if(max_msg < message_count){
				syncChunk(msgs, max_msg, message_count, callback);
			}
			else{
				if(callback){
					callback();
				}
			}
		});
	}
	function addLocalMessages(msgs, callback){
		var messages_to_process = msgs.length;
		msgs.forEach(function(msg, index){
			dbHandler.getMailFromLocalBox(mailbox_name, msg.uid) // does this have to happen? Can't we tell the message is there based on the descriptors file?
				.then(function(result){
					if(!result){
						imapHandler.getMessageWithUID(mailbox_name, msg.uid)
							.then(function(mail_obj){
								if(!mail_obj){
									console.log('no mail object found...');
									checkEnd(index);
								}
								else{
									mail_obj.uid = msg.uid;
									mail_obj.flags = msg.flags;
									dbHandler.saveMailToLocalBox(mailbox_name, mail_obj, function(){
										checkEnd(index);
									});
								}
							})
							.catch(function(err){
								console.log(err);
							});
					}
					else{
						checkEnd(index);
					}
				})
				.catch(function(err){
					console.log(err);
				});
		});
		function checkEnd(index){
			if(index === messages_to_process-1){
				if(callback){
					callback();
				}
			}
		}
	}
	function deleteLocalMessages(msgs, callback){
		console.log('deleting local messages');
		var def = Q.defer();
		var uids = (function(){
			var out = {};
			msgs.forEach(function(msg){
				out[msg.uid] = null;
			});
			return out;
		}());
		fs.exists('descriptors/'+mailbox_name+'_uids.json', function(exists){
			if(exists){
				fs.readFile('descriptors/'+mailbox_name+'_uids.json','utf8',function(err,data){
					var existing_msgs = JSON.parse(data);
					console.log(existing_msgs);
					existing_msgs.forEach(function(msg){
						// console.log(msg[0]);
						// console.log(msg[0] in uids);
						if(msg[0] in uids === false){
							dbHandler.deleteMessage(mailbox_name, msg[0]);
						}
					});
					def.resolve();
				});
			}
			else{
				def.resolve();
			}
		});
		return def.promise;
	}
}
module.exports = {syncAll:syncAll, syncBox:syncBox};