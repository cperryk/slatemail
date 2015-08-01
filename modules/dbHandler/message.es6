// jshint esnext: true
var promisifyAll = require('es6-promisify-all');
class Message{
  constructor(box_name, uid, api){
    this.box_name = box_name;
    this.uid = parseInt(uid,10);
    this.db = api.db;
    this.api = api;
    return this;
  }
  update(mail_obj, cb){
    var db = this.db;
    var box_name = this.box_name;
    var tx = db.transaction("box_"+box_name,"readwrite");
		var store = tx.objectStore("box_"+box_name);
    var update_request = store.put(mail_obj);
    update_request.onsuccess = ()=>{
      if(cb) cb();
    };
    update_request.onerror = (err)=> {
      if(cb) cb(err, null);
    };
  }
	updateFlags(flags, cb){
    var box_name = this.box_name;
    var uid = this.uid;
		//console.log('updating flags on '+box_name+':'+uid);
		var db = this.db;
    this.get()
      .then((mail_obj)=>{
  			if(!arraysEqual(mail_obj.flags, flags)){
          mail_obj.flags = flags;
          return this.updateAsync(mail_obj);
  			}
        return;
      })
      .then(()=>{
        if(cb) cb();
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
	}
	putInProject(project_name){
    var box_name = this.box_name;
    var uid = this.uid;
		//console.log('putting '+box_name+':'+uid+' in project: '+project_name);
		var project = this.api.projects.select(project_name);
    var message_obj;
		this.api.projects.ensureAsync(project_name)
			.then(()=>this.get())

      // update project
			.then((my_message_obj) => {
        message_obj = my_message_obj;
        return project.get();
      })
      .then((project_obj)=> {
				if(project_obj.threads.indexOf(message_obj.thread_id) === -1){
					project_obj.threads.push(message_obj.thread_id);
					return project.update(project_obj);
				}
        return;
			})

      // update thread;
      .then((message_obj, cb)=>{
        var thread = this.api.threads.select(message_obj.thread_id);
				return thread.get();
			})
      .then((thread_obj) => {
        thread_obj.project_id = project_name;
        return thread.update(thread_obj);
      })

			.catch(function(error){
				cb(err);
			})
			.finally(function(){
				cb();
			});
		return def.promise;
	}
	removeFromThread(thread_id, cb){
		console.log('removing message '+box_name+':'+uid+' from '+thread_id);
    var box_name = this.box_name;
    var uid = this.uid;
    var db = this.db;
		var object_store = db.transaction("threads", "readonly").objectStore("threads");
		var get_request = object_store.get(thread_id);
		get_request.onsuccess = function(){
			var thread_obj = get_request.result;
			var messages = thread_obj.messages;
			var mid = box_name+':'+uid;
			var index = messages.indexOf(mid);
			if(index>-1){
				messages.splice(index,1);
				var put_request = db.transaction("threads", "readwrite").objectStore("threads").put(thread_obj);
				put_request.onsuccess = function(){
					cb();
				};
			}
			else{
				cb();
			}
		};
		get_request.onerror = function(error){
			console.log(error);
			cb(err);
		};
	}
	delete(cb){
    var box_name = this.box_name;
    var uid = this.uid;
		// Removes a message from the local store and removes it from its thread.
		// This does NOT delete the message on the IMAP server. It also does NOT
		// remove the message's PID.

		console.log('deleting local '+box_name+':'+uid);
		// var get_request = db.transaction("box_"+box_name,'readonly').objectStore("box_"+box_name).get(uid);
		this.get()
			.then((mail_obj)=>{
				if(!mail_obj){
					console.log('resolving because no mail object found');
					cb();
				}
				else{
					console.log('message retrieved, ',mail_obj);
					var thread = mail_obj.thread_id;
					var tx = db.transaction("box_"+box_name,'readwrite');
					var object_store = tx.objectStore("box_"+box_name);
					var delete_request = object_store.delete(uid);
					delete_request.onsuccess = function(event){
						console.log('deleted: '+box_name+':'+uid);
						cb();
						// self.removeMessageFromThread(thread, box_name, uid)
						// 	.then(function(){
						// 		def.resolve();
						// 	});
					};
					delete_request.onerror = function(err){
						cb(err);
					};
					tx.onsuccess = function(){
						cb();
					};
					tx.onerror = function(err){
						console.log('transaction error: ',err);
						cb(err);
					};
				}
			})
			.catch(function(err){
				cb(err);
			});
	}
  get(){
    console.time('getMailFromLocalBox '+this.box_name+':'+uid);
    var tx = this.db.transaction("box_"+this.box_name,"readonly");
    var store = tx.objectStore("box_"+mailbox_name);
    var request = store.get(this.uid);
    request.onsuccess = ()=>{
      if(cb) cb(null, request.result || false);
    };
    request.onerror = (err)=>{
      console.log('error getting mail from local box '+this.box_name+':'+this.uid);
      if(cb) cb(err, null);
    };
  }
}
promisifyAll(Message);
module.exports = Message;
