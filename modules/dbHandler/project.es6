// jshint esnext: true
var promisifyAll = require('es6-promisify-all');
class Project{
  constructor(project_name, api){
    this.id = project_name;
    this.api = api;
    this.db = api.db;
    return this;
  }
  get(cb){
    // Resolves with the project object of project name. The project object contains the message IDs.
    var project_name = this.id;
    var db = this.db;
		var tx = this.db.transaction('projects','readonly');
		var store = tx.objectStore('projects');
		var get_request = store.get(this.id);
		get_request.onsuccess = function(){
			var result = get_request.result;
			cb(null, result);
		};
		get_request.onerror = function(err){
			console.log('could not retrieve project: '+this.id);
			cb(err);
		};
  }
  ensure(cb){
    console.log('ensuring ' + this.id);
    this.getAsync()
      .then((project_obj)=>{
        console.log(project_obj);
        if(!project_obj){
          this.updateAsync({
            threads: [],
            name: this.id
          })
          .then(()=>{
            cb();
          })
          .catch((err)=>{
            cb(err);
          });
        }
        console.log('complete');
        cb();
      })
      .catch(function(err){
        console.log(err);
        cb(err);
      });
  }
  update(project_obj, cb){
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
		this.getAsync()
			.then((project_obj)=>{
				var promises = project_obj.threads.map((thread_id)=>{
					return function(){
            return this.api.threads.select(thread_id).clearProjectAsync(thread_id);
          };
				});
				return Promise.all(promises);
			})
			.then(()=>{
				var tx = this.db.transaction('projects','readwrite');
				var store = tx.objectStore('projects');
				var req = store.delete(this.id);
				req.onsuccess = ()=>{
          console.log('PROJECT '+this.id+' DELETED!');
          cb();
        };
				req.onerror = cb;
			})
			.catch((err)=>{
				if(cb) cb(err, null);
			});
  }
}
promisifyAll(Project.prototype);
module.exports = Project;
