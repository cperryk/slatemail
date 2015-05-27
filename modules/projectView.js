// A view into a single project. Allows the user to select threads and attachments from the project. The user may also delete the project.
var $ = require('jquery');
var Q = require('Q');
var MessageView = require('../modules/messageView.js');
var mustache = require('mustache');
var exec = require('child_process').exec;

var EventEmitter = require('events').EventEmitter;
var util = require('util');

function ProjectView(container, conf){
	var self = this;
	this.$c = container;
	this.dbHandler = new window.dbHandler();
	this.conf = conf;
	$('<h2>')
		.addClass('project_title')
		.appendTo(this.$c);
	var button_wrapper = $('<p>')
		.addClass('button_wrapper')
		.appendTo(this.$c);
	$('<button>')
		.addClass('btn_delete_project')
		.html('Delete project')
		.appendTo(button_wrapper)
		.click(function(){
			if(window.confirm("Are you sure you want to delete project "+self.project_name+'? This will not delete its messages.')){
				self.dbHandler.deleteProject(self.project_name)
					.then(function(){
						self.emit('project_deletion', {
							project_name: self.project_name
						});
					});
			}
		});
}

util.inherits(ProjectView, EventEmitter);

ProjectView.prototype.printProject = function(project_id, initial_thread){
	console.log(initial_thread, this.initial_thread_id);
	if(project_id === this.project_name){
		if(initial_thread !== this.initial_thread_id){
			console.log('GO THREAD SWITCH');
			this.$c.find('.selected')
				.removeClass('selected');
			this.$c.find("[data-thread='"+initial_thread+"']").addClass('selected');
			this.initial_thread_id = initial_thread;
		}
		return;
	}
	this.attachments = [];
	this.$c.find('.thread_container').remove();
	this.$c.find('.attachments').remove();
	this.$c.find('h2').html(project_id);
	this.project_name = project_id;
	this.initial_thread_id = initial_thread;
	this.printThreads();
};
ProjectView.prototype.printThreads = function(){
	console.log('---- PRINTING THREADS -----');
	var self = this;
	this.thread_container = $('<div>')
		.addClass('thread_container')
		.appendTo(this.$c);
	$('<h3>')
		.html('Threads')
		.appendTo(this.thread_container);
	self.dbHandler.getProject(this.project_name)
		.then(function(project_obj){
			return self.dbHandler.getThreads(project_obj.threads);
		})
		.then(function(thread_objs){
			console.log('thread_objs',thread_objs);
			var def = Q.defer();
			thread_objs.forEach(function(thread_obj, index){
				if(thread_obj === undefined){
					return;
				}
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
};
ProjectView.prototype.printThread = function(thread_obj){
	console.log('print thread ',thread_obj);
	var self = this;
	var def = Q.defer();
	var ICONS = {
		incomplete:'graphics/icon_37352/icon_37352.png',
		complete:'graphics/icon_45161/icon_45161.png',
		defer:'graphics/icon_1303/icon_1303.png'
	};
	self.dbHandler.getThreadMessages(thread_obj)
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
			if(thread_obj.thread_id === self.initial_thread_id){
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
		self.$c.find('.selected')
			.removeClass('selected');
		$(this)
			.addClass('selected');
		var thread_id = $(this).data('thread');
		self.emit('selection', {
			thread_id: thread_id
		});
	}
	return def.promise;
};
ProjectView.prototype.saveAttachments = function(mail_obj){
	var self = this;
	mail_obj.attachments.forEach(function(attachment){
		self.attachments.push({
			mailbox: mail_obj.mailbox,
			uid: mail_obj.uid,
			attachment: attachment
		});
	});
};
ProjectView.prototype.printAttachments = function(){
	console.log('printing attachments');
	var self = this;
	var def = Q.defer();
	this.attachments_container = $('<div>')
		.addClass('attachments')
		.appendTo(this.$c);
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
};

module.exports = ProjectView;
