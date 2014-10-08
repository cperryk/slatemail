var $ = require('jquery');
var fs = require('fs');
var dbHandler = require('../modules/dbHandler.js');
var Q = require('Q');
var MessageView = require('../modules/messageView.js');

function ProjectView(project_name, initial_thread){
	this.project_name = project_name;
	this.initial_thread = initial_thread;
	this.container = $('#project_viewer')
		.empty();
	$('<h2>')
		.addClass('project_title')
		.html(project_name)
		.appendTo(this.container);
	this.attachments = [];
	this.printThreads();
}
ProjectView.prototype = {
	printThreads:function(){
		var self = this;
		this.thread_container = $('<div>')
			.addClass('thread_container')
			.appendTo(this.container);
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
				if(self.attachments.length > 0){
					self.printAttachments();
				}
			})
			.catch(function(err){
				console.log(err);
			});
	},
	printThread:function(thread_obj){
		var self = this;
		var def = Q.defer();
		var initial_thread = this.initial_thread;
		dbHandler.getThreadMessages(thread_obj)
			.then(function(thread_messages){
				var most_recent_message = thread_messages[0];
				console.log(thread_obj.thread_id);
				var thread_container = $('<div>')
					.addClass('thread')
					.html(most_recent_message.subject)
					.attr('data-thread',thread_obj.thread_id)
					.appendTo(self.thread_container)
					.click(threadClick);
				if(thread_obj.thread_id === initial_thread.thread_id){
					thread_container.addClass('selected');
				}
				def.resolve();
				thread_messages.forEach(function(mail_obj){
					if(mail_obj.attachments){
						self.saveAttachments(mail_obj);
					}
				});
			});
		function threadClick(){
			$('.selected')
				.removeClass('selected');
			$(this)
				.addClass('selected');
			var thread_id = $(this).data('thread');
			dbHandler.getThread(thread_id)
				.then(function(thread_obj){
					return dbHandler.getThreadMessages(thread_obj);
				})
				.then(function(messages){
					new MessageView($('#message_viewer'), messages);
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
			.appendTo(this.container);
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