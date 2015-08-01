// jshint esnext: true
// jshint ignore: start
"use strict";
// jshint ignore: end

var fs = require('fs');
var fsx = require('fs-extra'); // for some reason, setting fs to fs-extra isn't recognized later in the execution...?
var promisifyAll = require('es6-promisify-all');
var indexedDB = window.indexedDB;
// Warning: console.log(mail_obj) may crash node-webkit with no errors. Perhaps because mail_objs may be huge.

promisifyAll(fsx);

class DbHandler{
	constructor(){
		// this.connectAsync()
		// 	.then(()=>{
		// 		this.projects = new Projects(this.db);
		// 		this.threads = new Threads(this.db);
		// 		this.mailboxes = new Mailboxes(this.db);
		// 	});
		return this;
	}
	addObjectStore(store_name, store_conf, cb){
		// Convenience function for creating an object store manually
		if(db.objectStoreNames.contains(store_name)){
			if(cb) cb(null, null);
		}
		var version =  parseInt(db.version);
		db.close();
		var open_request = indexedDB.open('slatemail',version+1);
		open_request.onupgradeneeded = ()=>{
			db = open_request.result;
			db.createObjectStore(store_name, store_conf);
		};
		open_request.onsuccess = ()=> {
			if(cb) cb(null, null);
		};
	}
	deleteDB(cb){
		console.log('delete request');
		var req = indexedDB.deleteDatabase('slatemail');
		req.onsuccess = ()=>{
			console.log("Deleted database successfully");
			if(cb) cb();
		};
		req.onerror = ()=>{
			if(cb) cb(req.error);
		};
		req.onblocked = ()=>{
			if(cb) cb("Couldn't delete database due to operation being blocked", null);
		};
	}
	deleteEverything(cb){
		console.log('deleting everything');
		Promise.all([this.deleteDBAsync(), this.deleteAllAttachmentsAsync()])
			.then(cb)
			.catch(cb);
	}
	deleteAllAttachments(cb){
		fsx.remove('attachments')
			.then(cb)
			.catch(cb);
	}
	connect(cb){
		console.log('connecting local database!!!');
		var request = indexedDB.open("slatemail");
		request.onupgradeneeded = ()=>{
			this.db = request.result;

			// Maps thread IDs to arrays that contain the message IDs of their emails.
			this.db.createObjectStore('threads', {keyPath:'thread_id', autoIncrement: true});

			// Maps contact names to email addresses (unused right now).
			this.db.createObjectStore('contacts', {keyPath:'address'});

			// Maps project IDs to arrays containing the thread IDs of the threads in the project.
			this.db.createObjectStore('projects', {keyPath: 'name'});

			// Maps PIDs to thread IDs. This is to ensure that a message that is moved to a different
			// box is organized into the same thread.
			this.db.createObjectStore('pids', {keyPath:'pid'});

			// Stores email addresses that the user has blocked. Messages from these addresses are
			// downloaded but are never stored in a local box. An IMAP request is sent to delete them.
			this.db.createObjectStore('blocked', {keyPath:'address'});

			// Caches user actons, like marking an email as complete
			this.db.createObjectStore('actions', {keyPath:'action_id', autoIncrement:true});

			// Caches descriptors for each mailbox. Descriptors are a snapshot of the UIDs and flags
			// in each mailbox according to the LAST sync.
			this.db.createObjectStore('descriptors', {keyPath:'mailbox'});

		};
		request.onsuccess = ()=>{
			this.db = request.result;
			this.db.onversionchange = function(event){
				console.log('db version chagned');
			};
			this.db.onclose = function(event){
				console.log('db closed');
			};
			this.db.onerorr = (event)=> cb(event, null);
			console.log('CONNECTION COMPLETE');
			cb();
		};
		request.onerror = function(){
			cb(request.error, null);
		};
		request.onblocked = function(){
			cb('blocked', null);
		};
	}
	saveContact(mail_obj){
		var sender = mail_obj.from[0];
		var sender_name = sender.name;
		var sender_address = sender.address;
		var data_to_store = {
			address:sender_address,
			name:sender_name
		};
		var tx = db.transaction("contacts","readonly");
		var store = tx.objectStore("contacts");
		var request = store.put(data_to_store);
		request.onsuccess = function(){
			//console.log('contact stored: '+sender_address);
		};
	}
	blockSender(sender_address, cb){
		var tx = db.transaction('blocked', 'readwrite');
		var store = tx.objectStore('blocked');
		var update_request = store.put({address: sender_address});
		update_request.onsuccess = function(){
			console.log(sender_address+' added to blocked store');
			if(cb) cb();
		};
		update_request.onerror = function(err){
			console.log('error adding '+sender_address+' to blocked store');
			if(cb) cb(err);
		};
		return def.promise;
	}
	isSenderBlocked(sender_address, cb){
		var tx = db.transaction('blocked', 'readonly');
		var store = tx.objectStore('blocked');
		var get_request = store.get(sender_address);
		get_request.onsuccess = function(){
			if(get_request.result){
				if(cb) cb(null, true);
			}
			else{
				if(cb) cb(null, false);
			}
		};
		get_request.onerror = function(err){
			if(cb) cb(err);
		};
		return def.promise;
	}
}

// EXTEND dbHandler to include namespaced prototype levels
var namespaces = {
	projects: './projects.es6',
	threads: './threads.es6',
	mailboxes: './mailboxes.es6',
	messages: './messages.es6'
};
for(var i in namespaces){
	nameSpacePrototype(DbHandler, i, promisifyAll(require(namespaces[i])));
}

promisifyAll(DbHandler.prototype);

// assigns fnc to the protoype of classFnc under namespace.
function nameSpacePrototype(classFnc, namespace, fncs){
  Object.defineProperty(classFnc.prototype, namespace, {
     get: function(){
        var out = {};
				for(var i in fncs){
					out[i] = fncs[i].bind(this);
				}
				return out;
     },
     enumerable: false,
     configurable: true
  });
}

module.exports = DbHandler;
