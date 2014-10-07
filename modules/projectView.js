var $ = require('jquery');
var fs = require('fs');
var dbHandler = require('../modules/dbHandler.js');
var Q = require('Q');
var MessageView = require('../modules/messageView.js');

function ProjectView(project_name){
	this.project_name = project_name;
	this.container = $('#project_viewer')
		.empty();
	this.inner = $('<div>')
		.addClass('inner')
		.appendTo(this.container);
	$('<h2>')
		.addClass('project_title')
		.html(project_name)
		.appendTo(this.inner);
	this.attachments = [];
	this.printThreads();
}
ProjectView.prototype = {
	printThreads:function(){
		var self = this;
		this.thread_container = $('<div>')
			.addClass('thread_container')
			.appendTo(this.inner);
		$('<h3>')
			.html('Threads')
			.appendTo(this.thread_container);
		dbHandler.getProject(this.project_name)
			.then(function(project_obj){
				return dbHandler.getThreads(project_obj.threads);
			})
			.then(function(thread_objs){
				var def = Q.defer();
				thread_objs.forEach(function(thread_obj, index){
					self.printThread(thread_obj)
						.then(function(){
							if(index === thread_objs.length-1){
								def.resolve();
							}
						});
				});
				return def.promise;
			})
			.fin(function(){
				self.printAttachments();
			})
			.catch(function(err){
				console.log(err);
			});
	},
	printThread:function(thread_obj){
		var self = this;
		var def = Q.defer();
		dbHandler.getThreadMessages(thread_obj)
			.then(function(thread_messages){
				var most_recent_message = thread_messages[0];
				console.log(thread_obj.thread_id);
				$('<div>')
					.addClass('thread')
					.html(most_recent_message.subject)
					.attr('data-thread',thread_obj.thread_id)
					.appendTo(self.thread_container)
					.click(threadClick);
				def.resolve();
				thread_messages.forEach(function(mail_obj){
					if(mail_obj.attachments){
						self.saveAttachments(mail_obj);
					}
				});
			});
		function threadClick(){
			var thread_id = $(this).data('thread');
			dbHandler.getThread(thread_id)
				.then(function(thread_obj){

				});
		}
		return def.promise;
	},
	saveAttachments:function(mail_obj){
		var self = this;
		mail_obj.attachments.forEach(function(attachment){
			self.attachments.push(attachment);
		});
	},
	printAttachments:function(){
		console.log('printing attachments');
		var self = this;
		var def = Q.defer();
		this.attachments_container = $('<div>')
			.addClass('attachments')
			.appendTo(this.inner);
		$('<h3>')
			.html('Attachments')
			.appendTo(this.attachments_container);
		this.attachments.forEach(function(attachment){
			console.log(attachment);
			$('<div>')
				.html(attachment.fileName)
				.addClass('attachment')
				.appendTo(self.attachments_container);
		});
	}
};

module.exports = ProjectView;