var indexedDB = window.indexedDB;
var Q = require('Q');
deleteDB();

function deleteDB(){
	var def = Q.defer();
	var req = indexedDB.deleteDatabase('slatemail');
	console.log(req);
	req.onsuccess = function () {
		console.log("Deleted database successfully");
		def.resolve();
	};
	req.onerror = function () {
		console.log("Couldn't delete database");
		def.resolve();
	};
	req.onblocked = function () {
		console.log("Couldn't delete database due to the operation being blocked");
		def.resolve();
	};
	return def.promise;
}