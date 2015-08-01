// jshint esnext: true

var Box = require('./box.es6');

module.exports = {
	findFirstMailWithProperty(property, values, current_index, cb){
		// Searches all mailboxes for a message in which $property matches one of $values.
		// Stops when a message is found. Callback includes the FIRST message that is found.
		if(typeof current_index === 'function'){
			callback = current_index;
			current_index = 0;
		}
		var value = values[current_index];
		return this.mailboxes.findMailWithPropertyAsync(property, value)
			.then((mail_object)=>{
				if(mail_object === false || !mail_object.thread_id){
					if(current_index < values.length - 1){
						this.mailboxes.findFirstMailWithProperty(property, values, current_index+1, callback);
					}
					else{
						cb(null, false);
					}
				}
				else{
					//console.log('message trace found thread_id: '+mail_object.thread_id);
					cb(null, mail_object);
				}
			})
			.catch(function(err){
				cb(err);
			});
	},
	findMailWithProperty(property, value, cb){
		// Searches all of the mailboxes for a message with a $property set to $value.
		// For example, property can be 'message_id'. Only works with properties that are
		// indexed.
		// console.log('searching for: '+property+', '+value);
		var boxes = this.mailboxes.list();
		var self = this;
		iteration(boxes, 0, function(mail_obj){
			cb.resolve(null, mail_obj);
		});
		function iteration(boxes, index, cb){
			self.getMailFromBoxWithPropertyAsync(boxes[index], property, value)
				.then(function(mail_obj){
					// console.log(mail_obj);
					if(!mail_obj){
						if(index < boxes.length-1){
							iteration(boxes, index+1, cb);
						}
						else{
							cb(false);
						}
					}
					else{
						cb(mail_obj);
					}
				})
				.catch(function(err){
					console.log(err);
				});
		}
	},
	list(){
		var stores = this.db.objectStoreNames;
		var out = [];
		var l = stores.length;
		for(var i=0; i<l; i++){
			var store = stores[i];
			if(store.indexOf('box_')>-1){
				out.push(store.replace('box_',''));
			}
		}
		return out;
	},
  getTree(cb){
		// Gets all of the local mailboxes, and resolves with a tree-like structure describing the hierarchy
		// e.g. {INBOX:{},FolderA:{FolderB:{}}} etc.
		var boxes = this.mailboxes.list();
    var tree = arrToTree(boxes);
		cb(null, tree);

		function arrToTree(paths){
			// Takes an array of paths and turns it into a tree.
			// ['a','a/b','a/c'] becomes {a:{b:{},c:{}}
			// So does ['a/b/c'];
			var tree = {};
			paths.forEach(function(path){
				var segs = path.split('/');
				var last = tree;
				for(var i=0; i<segs.length; i++){
					if(!last[segs[i]]){
						last[segs[i]] = {};
					}
					last = last[segs[i]];
				}
			});
			return tree;
		}
	},
  delete(box_paths, cb){
		console.log('delete boxes: '+box_paths);
		var promises = box_paths.map((box_path)=>{
			return this.select(box_path).deleteAsync();
		});
		Promise.all(promises)
			.then(function(){
				if(cb) cb();
			});
	},
  getDueMail(cb){
    console.log('GET DUE MAIL');
    // Collects all mail that is past due from the scheduled local boxes.
    // Resolves with an array of mail objects sorted descended by date.
    var self = this;
    var boxes = this.mailboxes.list();
    var filtered = boxes.filter((box) => box.indexOf('SlateMail/scheduled/') === 0);
		var promises = filtered.map(function(box){
			return self.mailboxes.select(box).getAllMessagesAsync();
		});

    Promise.all(promises)
      .then(function(results){
        var msgs = [];
        msgs = msgs.concat.apply(msgs, results); // flattens results
        msgs.sort(function(a,b){
          return a.date > b.date ? -1 : 1;
        });
        cb(null, msgs);
      })
      .catch(function(err){
				console.log(err);
				cb(err);
			});
  },
  getScheduledBoxes(cb){
    var stores = this.db.objectStoreNames;
    var arr = [];
    for(var i=0;i<stores.length;i++){
      var store = stores[i];
      var prefix = 'box_SlateMail/scheduled/';
      if(store.length >= prefix.length){
        if(store.substring(0, prefix.length) === 'box_SlateMail/scheduled/'){
          var store_date = new Date(store);
          var current_date = new Date();
          if(store_date < current_date){
            arr.push(store);
          }
        }
      }
    }
    cb(null, arr);
  },
	ensure(boxes, cb){
    var db = this.db;
		if(typeof boxes === 'string'){
			boxes = [boxes];
		}
		// If local store for $mailbox_name does not exist, create it.
		var boxes_to_make = boxes.filter((box)=> db.objectStoreNames.contains('box_'+box) === false);
		console.log('boxes to make: ',boxes_to_make);
		if(boxes_to_make.length === 0){
			if(cb) cb();
			return;
		}
		var version = parseInt(db.version, 10);
		db.close();
		var open_request = indexedDB.open('slatemail', version+1);
		open_request.onupgradeneeded = function () {
			db = open_request.result;
			boxes_to_make.forEach(function(box){
				var object_store = db.createObjectStore('box_'+box, {
					keyPath: 'uid'
				});
				object_store.createIndex("message_id", "messageId", { unique: false });
				object_store.createIndex("short_subject", "short_subject", { unique: false });
				object_store.createIndex("uid","uid", {unique:true});
				object_store.createIndex("date","date",{unique: false});
			});
		};
		open_request.onsuccess = function (e) {
			console.log('local mailboxes created: ',boxes_to_make);
			if(cb) cb();
		};
		open_request.onerror = function(event){
			if(cb) cb(event.error);
		};
		open_request.onblocked = function(event){
			if(cb) cb('blocked!');
		};
	},
  select(boxname){
		console.log('selecting');
    return new Box(boxname, this);
  }
};
