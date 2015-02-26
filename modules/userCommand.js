var fs = require('fs-extra');
var Q = require('q');
console.log('IMPORTING USER COMMAND');
var Imaper = require("../modules/imaper.js");
console.log(Imaper);

function UserCommand(){
	this.dbHandler = new window.dbHandler();
	this.imaper = new Imaper();
}
UserCommand.prototype = {
	markComplete:function(box_name, uid){
		// Mark an email and all of the emails in its thread as complete
		console.log('marking complete: '+box_name+':'+uid);
		var def = Q.defer();
		var self = this;
		this.dbHandler.getMailFromLocalBox(box_name, uid)
			.then(function(mail_obj){
				return self.dbHandler.getThread(mail_obj.thread_id);
			})
			.then(function(thread){
				var promises = thread.messages.map(function(message_id){
					return function(){
						var box_name = message_id.split(':')[0];
						var uid = parseInt(message_id.split(':')[1],10);
						return self.moveToComplete(box_name, uid);
					};
				});
				promises.reduce(Q.when, Q())
					.then(function(){
						console.log('markComplete resolved');
						def.resolve();			
					})
					.catch(function(err){
						console.log(err);
					});
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
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
	},
	schedule:function(date, box_name, uid){
		console.log(box_name);
		var def = Q.defer();
		var self = this;
		var date_box = 'SlateMail/scheduled/'+[date.getFullYear(), date.getMonth()+1, date.getDate()].join('-');
		self.imaper.ensureBox(date_box)
			.then(function(){
				return self.dbHandler.getMailFromLocalBox(box_name, uid);
			})
			.then(function(mail_obj){
				return self.dbHandler.getThread(mail_obj.thread_id);
			})
			.then(function(thread){
				thread.messages.forEach(function(message_id){
					var box_name = message_id.split(':')[0];
					var uid = message_id.split(':')[1];
					self.imaper.move(box_name, date_box, uid);
				});
			})
			.then(function(){
				def.resolve();
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	markSeen:function(mail_objs){
		var def = Q.defer();
		var self = this;
		var unseen = mail_objs.filter(function(mail_obj){
			return mail_obj.flags.indexOf('\\Seen')===-1;
		});
		console.log('unseen: ',unseen);
		var promises = unseen.map(function(mail_obj){
			return self.dbHandler.markSeen(mail_obj)
				.then(function(){
					console.log('imaper marking seen', mail_obj);
					self.imaper.markSeen(mail_obj.mailbox, mail_obj.uid);
				})
				.catch(function(err){
					console.log(err);
				});
		});
		Q.all(promises)
			.then(function(){
				def.resolve();
			});
		return def.promise;
	},
};
module.exports = UserCommand;