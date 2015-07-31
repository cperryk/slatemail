// jshint esnext: true

class Project{
  constructor(project_name, api){
    this.id = project_name;
    this.api = api;
    this.db = api.db;
  }
  get(cb){
    // Resolves with the project object of project name. The project object contains the message IDs.
    var project_name = this.project_name;
    var db = this.db;
		var tx = this.db.transaction('projects','readonly');
		var store = tx.objectStore('projects');
		var get_request = store.get(project_name);
		get_request.onsuccess = function(){
			var result = get_request.result;
			cb(null, result);
		};
		get_request.onerror = function(err){
			console.log('could not retrieve project: '+project_name);
			cb(err);
		};
  }
  update(project_obj){
		var tx = this.db.transaction('projects',"readwrite");
		var store = tx.objectStore('projects');
		var put_request = store.put(project_obj);
		put_request.onsuccess = function(){
			console.log('success');
			if(cb) cb(null, true);
		};
		put_request.onerror = function(err){
			console.log(err);
			if(cb) cb(null, false);
		};
  }
  delete(cb){
		console.log('deleting project: '+project_name);
		this.getAsync()
			.then((project_obj)=>{
				var thread_ids = project_obj.threads;
				var promises = thread_ids.map((thread_id)=>{
					return this.api.threads.select(thread_id).clearProjectAsync(thread_id);
				});
				return Promise.all(promises);
			})
			.then(()=>{
				return new Promise((resolve, reject)=>{
					var tx = this.db.transaction('projects','readwrite');
					var store = tx.objectStore('projects');
					var req = store.delete(project_name);
					req.onsuccess = resolve;
					req.onerror = reject;
				});
			})
			.fin(function(){
				if(cb) cb();
			})
			.catch(function(err){
				if(cb) cb(err, null);
			});
  }
}
