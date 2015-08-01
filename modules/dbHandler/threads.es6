// jshint esnext: true
var Thread = require('./thread.es6');
module.exports = {
	get(thread_ids, cb){
    if(Array.isArray(thread_ids)){
  		var promises = thread_ids.map((thread_id) => this.threads.getAsync(thread_id));
  		Promise.all(promises)
  			.then((out)=>{
  				cb(null, out);
  			});
    }
    else{
      this.getThreadAsync(thread_ids)
        .then(function(thread){
          cb(null, thread);
        })
        .catch(cb);
    }
	},
	select(thread_id){
		return new Thread(thread_id, this);
	}

};
