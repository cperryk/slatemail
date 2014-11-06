var $ = require('jquery');
var fs = require('fs');
var dbHandler = require('../modules/dbHandler.js');
var Q = require('Q');
var MessageView = require('../modules/messageView.js');
var mustache = require('mustache');
var exec = require('child_process').exec;

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
		var ICONS = {
			incomplete:'graphics/icon_37352/icon_37352.png',
			complete:'graphics/icon_45161/icon_45161.png',
			defer:'graphics/icon_1303/icon_1303.png'
		};
		var initial_thread = this.initial_thread;
		dbHandler.getThreadMessages(thread_obj)
			.then(function(thread_messages){
				var thread_action_status = (function(){
					for(var i=0;i<thread_messages.length;i++){
						var box = thread_messages[i].mailbox;
						if(box === 'complete'){
							return 'complete';
						}
						if(box === 'inbox'){
							return 'incomplete';
						}
					}
					return 'incomplete';
				}());
				var thread_icon = ICONS[thread_action_status];
				var template = '<div class="thread" data-thread="{{{thread_id}}}">'+
					'<table><tr><td><img src="{{{icon}}}"/></td><td><h4>{{{subject}}}</h4></td></tr></table>'+
				'</div>';
				var view = {
					thread_id: thread_obj.thread_id,
					icon: ICONS[thread_action_status],
					subject: thread_messages[0].subject
				};
				var html = mustache.render(template, view);
				var thread_container = $(mustache.render(html))
					.appendTo('.thread_container')
					.click(threadClick);
				if(thread_obj.thread_id === initial_thread.thread_id){
					thread_container.addClass('selected');
				}
				thread_messages.forEach(function(mail_obj){
					if(mail_obj.attachments){
						self.saveAttachments(mail_obj);
					}
				});
				def.resolve();
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
			self.attachments.push({
				mailbox: mail_obj.mailbox,
				uid: mail_obj.uid,
				attachment: attachment
			});
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
		this.attachments.forEach(function(a){
			$('<div>')
				.html('<h4>'+a.attachment.fileName+'</h4>')
				.addClass('attachment')
				.appendTo(self.attachments_container)
				.click(function(){
					var path = ['attachments', a.mailbox, a.uid, a.attachment.fileName].join('/');
					var command = 'open '+path.replace(/ /g,'\\ ');
					exec(command);
				});
		});
	}
};

module.exports = ProjectView;