// jshint esnext: true

class Thread{
  constructor(thread_id, api){
    this.id = parseInt(thread_id, 10);
    this.db = api.db;
    this.api = this.api;
  }
  update(thread_obj, cb){
		var tx = this.db.transaction('threads',"readwrite");
		var store = tx.objectStore('threads');
		var put_request = store.put(thread_obj);
		put_request.onsuccess = function(){
			console.log('success');
			if(cb) cb(null, true);
		};
		put_request.onerror = function(err){
			console.log(err);
			if(cb) cb(null, false);
		};
  }
  get(){
		console.log('dBHandler - getting thread ' + this.id);
		var tx = this.db.transaction('threads','readonly');
		var objectStore = tx.objectStore('threads');
		var get_request = objectStore.get(this.id);
		get_request.onsuccess = function(event){
			var matching = get_request.result;
			// console.log('THREAD '+thread_id+' LOCATED, result is...');
			// console.log(matching);
			cb(null, matching);
		};
		get_request.onerror = function(err){
			cb(err, null);
		};
  }
	getMessages(cb){
		// console.log('getting thread messages');
		this.get()
      .then((thread_obj)=>{
    		var message_umis = thread_obj.messages;
    		console.time('getThreadMessages');
    		console.log('Total messages to get', message_umis.length);
    		var promises = message_umis.map((umi, index)=>{
    			umi = umi.split(':');
    			var mailbox_name = umi[0];
    			var uid = parseInt(umi[1],10);
    			return this.api.mailboxes.select(mailbox_name).select(uid).get();
    		});
        return Promises.all(promises);
      })
		.then((results)=>{
			promises.sort(sortByDate);
			cb(null, results);
		})
		.catch(cb);
		function sortByDate(a,b){
			if(a.date > b.date){
				return -1;
			}
			else{
				return 1;
			}
		}
	}
	muteThread(thread_id, cb){
		console.log('muting thread ' + this.id);
		this.setMute(true)
			.then(function(){
				cb();
			})
			.catch(cb);
	}
	unmuteThread(){
		return this.setMute(false);
	}
	setMute(state, cb){
    var db = this.db;
		this.get()
			.then((thread_obj)=>{
				console.log('thread_obj', thread_obj);
				thread_obj.muted = state;
        return this.updateAsync(thread_obj);
			})
			.catch(function(err){
				if(cb) cb(err, null);
			});
	}
	clearProject(cb){
		console.log('clearing project from thread: '+thread_id);
		var self = this;
		this.get(thread_id)
			.then((thread_obj)=>{
				if(thread_obj.project_id){
					delete thread_obj.project_id;
				}
        return this.updateAsync(thread_obj);
      })
      .then(()=>{
        cb();
      })
      .catch((err)=>cb);
	}
}

module.exports = Thread;
