// jshint esnext: true

var promisifyAll = require('es6-promisify-all');

class Thread{
  constructor(thread_id, api){
    this.id = parseInt(thread_id, 10);
    this.db = api.db;
    this.api = this.api;
    return this;
  }
  update(thread_obj, cb){
		var tx = this.db.transaction('threads',"readwrite");
		var store = tx.objectStore('threads');
		var put_request = store.put(thread_obj);
		put_request.onsuccess = function(){
			console.log('success');
			if(cb) cb();
		};
		put_request.onerror = function(err){
			console.log(err);
			if(cb) cb(null, false);
		};
  }
  get(cb){
		console.log('dBHandler - getting thread ' + this.id);
		var tx = this.db.transaction('threads','readonly');
		var objectStore = tx.objectStore('threads');
		var get_request = objectStore.get(this.id);
		get_request.onsuccess = function(event){
			var matching = get_request.result;
			if(cb) cb(null, matching);
		};
		get_request.onerror = function(err){
			if(cb) cb(err, null);
		};
  }
	getMessages(cb){
		this.getAsync()
      .then((thread_obj)=>{
    		var message_umis = thread_obj.messages;
    		return this.api.messages.getMessagesAsync(message_umis);
      })
      .then(function(mail_objs){
        cb(null, mail_objs);
      })
      .catch(function(err){
        cb(err);
      });
	}
	muteThread(cb){
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
		console.log('clearing project from thread: '+this.id);
		this.getAsync()
			.then((thread_obj)=>{
				if(thread_obj.project_id){
					delete thread_obj.project_id;
				}
        return this.updateAsync(thread_obj);
      })
      .then(()=>{
        console.log('cleared project from '+this.id);
        cb();
      })
      .catch((err)=>cb);
	}
}

promisifyAll(Thread.prototype);

module.exports = Thread;
