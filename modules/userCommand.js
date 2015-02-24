var Imaper = require("./modules/imaper.js");
var fs = require('fs-extra');
var Q = require('q');

function UserCommand(){
	this.dbHandler = new dbHandler();
	this.imaper = new Imaper();
}
UserCommand.prototype = {
	moveToComplete:function(box_name, uid){
		console.log('Moving to complete: '+box_name+':'+uid);
		var def = Q.defer();
		var self = this;
		if(box_name!=='complete'){
			self.imaper.move(box_name, 'SlateMail/complete', uid)
				.then(function(){
					return self.dbHandler.removeLocalMessage(box_name, uid);
				})
				.fin(function(){
					console.log('move complete successful');
					def.resolve();
				})
				.catch(function(err){
					console.log(err);
				});
		}
		else{
			def.resolve();
		}
		return def.promise;
	}
};