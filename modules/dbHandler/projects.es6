// jshint esnext: true
var Project = require('./project.es6');
module.exports = {
  ensure(project_name, cb){
		if(this.db.objectStoreNames.contains('projects')){
			cb();
		}
		var version =  parseInt(this.db.version);
		this.db.close();
		var open_request = indexedDB.open('slatemail',version+1);
		open_request.onupgradeneeded = ()=>{
      this.db = open_request.result;
      this.db.createObjectStore('projects', {keyPath:'name'});
		};
		open_request.onsuccess = function(){
			cb();
		};
  },
  list(cb){
    // Resolves with a complete list of project names
		var tx = this.db.transaction("projects");
		var objectStore = tx.objectStore("projects");
		var arr = [];
		objectStore.openCursor(null, 'prev').onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				arr.push(cursor.value.name);
				cursor.continue();
			}
			else {
				cb(null, arr);
			}
		};
  },
  select(project_name){
    return new Project(project_name, this);
  }
};
