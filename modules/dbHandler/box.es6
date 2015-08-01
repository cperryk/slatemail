// jshint esnext: true
var promisifyAll = require('es6-promisify-all');
var Message = require('./message.es6');

class Box{
  constructor(boxname, api){
    this.db = api.db;
    this.api = api;
    this.name = boxname;
    return this;
  }
	getMailWithProperty(mailbox_name, property, value, cb){
		// console.log('getting mail from box '+mailbox_name + ' with property '+property+' set to '+value);
		var store_name = 'box_'+mailbox_name;
		if(!this.db.objectStoreNames.contains(store_name)){
			cb(null, false);
		}
		else{
			var tx = this.db.transaction(store_name,"readonly");
			var store = tx.objectStore(store_name);
			var index = store.index(property);
			var get_request = index.get(value);
			get_request.onsuccess = function(){
				var matching = get_request.result;
				if(matching!==undefined){
					cb(null, get_request.result);
				}
				else{
					cb(null, false);
				}
			};
			get_request.onerror = function(err){
				cb(err);
			};
		}
	}
  getMessages(onMessage, limit, offset, cb){
    var box_name = this.name;
    console.log('get messages from '+box_name+', limit is '+limit+', offset is '+offset);
    if(!this.db.objectStoreNames.contains("box_"+box_name)){
      console.log(box_name+' does not exist');
      if(cb) cb();
    }
    else{
      var count = 0;
      var tx = this.db.transaction("box_"+box_name, 'readonly');
      // do not split this next line! it causes the transaction to time out for some reason.
      var req =  tx.objectStore("box_"+box_name).index('date').openCursor(null, 'prev').onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          if(offset !== undefined && offset > 0 && count === 0){
            cursor.advance(offset);
            offset = undefined;
          }
          else{
            var mail_object = cursor.value;
            if(onMessage){
              onMessage(mail_object);
            }
            count ++;
            if(limit === undefined || (count < limit)){
              cursor.continue();
            }
            else{
              console.log('resolving because limit is undefined or count is less than limit, offset is '+offset+' and limit is '+limit);
              if(cb) cb();
            }
          }
        }
        else {
          console.log('resolving because no cursor anymore');
          if(cb) cb();
        }
      };
    }
  }
	getAllMessages(cb){
		var arr = [];
		this.getMessagesAsync(function(mail_obj){
			arr.push(mail_obj);
		}, 150, 0, function(){
			cb(null, arr);
		})
    .catch(function(err){
      console.log(err);
    });
	}
	getUIDs(onKey, onEnd){
    var box_name = this.name;
		if(!this.db.objectStoreNames.contains("box_"+box_name)){
			//console.log('local box does not exist');
			return;
		}
		var objectStore = this.db.transaction("box_"+box_name).objectStore("box_"+box_name);
		objectStore.index('uid').openKeyCursor().onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				if(onKey){
					onKey(cursor.key);
				}
				cursor.continue();
			}
			else {
				if(onEnd){
					onEnd();
				}
			}
		};
	}
  select(uid){
    return new Message(this.name, uid, this.api);
  }
  deleteDescriptors(cb){

		var store = this.db.transaction('descriptors',"readwrite").objectStore('descriptors');
		var delete_request = store.delete(box_name);
		delete_request.onsuccess = function(){
			cb();
		};
		delete_request.onerror = function(err){
			cb(err);
		};
  }
  deleteObjectStore(cb){
    var version =  parseInt(this.db.version);
    this.db.close();
    var open_request = indexedDB.open('slatemail', version+1);
    open_request.onupgradeneeded = (event)=>{
      var db = event.target.result;
      if(db.objectStoreNames.contains('box_'+box_path)){
        console.log('DELETE '+box_path);
        db.deleteObjectStore('box_'+box_path);
      }
    };
    open_request.onsuccess = function(){
      cb();
    };
    open_request.onerror = function(){
      cb();
    };
  }
  delete(cb){
    this.deleteDescriptorsAsync()
    .then(()=>this.deleteObjectStoreAsync())
    .then(()=>cb())
    .catch((err)=>{
      cb(err);
    });
  }

}

promisifyAll(Box.prototype);
module.exports = Box;
