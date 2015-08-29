// jshint esnext: true
// A view into a single project. Allows the user to select threads and attachments from the project. The user may also delete the project.
var $ = require('jquery');
var MessageView = require('../modules/messageView.es6');
var mustache = require('mustache');
var exec = require('child_process').exec;
var promisifyAll = require('es6-promisify-all');

var EventEmitter = require('events').EventEmitter;

class ProjectView extends EventEmitter{
	constructor($container, conf){
		super();
		this.$c = $container;
		this.dbHandler = window.dbHandler;
		this.conf = conf;
		$('<h2>')
			.addClass('project_title')
			.appendTo(this.$c);
		var $button_wrapper = $('<p class="button_wrapper">')
			.appendTo(this.$c);
		$('<button class="btn_delete_project">')
			.html('Delete project')
			.appendTo($button_wrapper)
			.click(()=>{
				var project_name = this.project_name;
				var confirm = window.confirm(`Are you sure you want to delete project $(project_name)? This will not delete its messages.`);
				if(!confirm){
					return;
				}
				this.dbHandler.projects.select(this.project_name).deleteAsync()
					.then(function(){
						this.emit('project_deletion', {
							project_name: this.project_name
						});
					});
			});
		return this;
	}
	printProject(project_id, initial_thread){
		if(project_id === this.project_name){
			if(initial_thread !== this.initial_thread_id){
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
	}
	printThreads(cb){
		console.log('---- PRINTING THREADS -----');
		this.thread_container = $('<div class="thread_container">')
			.appendTo(this.$c);
		$('<h3>')
			.html('Threads')
			.appendTo(this.thread_container);
		this.dbHandler.projects.select(this.project_name).getAsync()
			.then((project_obj)=>{
				console.log(project_obj);
				return Promise.all(project_obj.threads.map((thread_id)=>{
					return this.dbHandler.threads.select(thread_id).getAsync();
				}));
			})
			.then((thread_objs)=>{
				console.log(thread_objs);
				var promises = thread_objs.map((thread_obj)=>{
					return this.printThreadAsync(thread_obj);
				});
				return Promise.all(promises);
			})
			.then(()=>{
				if(this.attachments.length > 0){
					this.printAttachments();
				}
			})
			.catch((err)=>{
				console.log(err);
			});
	}
	printThread(thread_obj, cb){
		if(thread_obj === undefined){
			return cb();
		}
		console.log('print thread ',thread_obj);
		var self = this;
		var ICONS = {
			incomplete:'graphics/icon_37352/icon_37352.png',
			complete:'graphics/icon_45161/icon_45161.png',
			defer:'graphics/icon_1303/icon_1303.png'
		};
		this.dbHandler.messages.getMessagesAsync(thread_obj.messages)
			.then((thread_messages)=>{
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
				if(thread_obj.thread_id === this.initial_thread_id){
					thread_container.addClass('selected');
				}
				thread_messages.forEach((mail_obj)=>{
					if(mail_obj.attachments){
						this.saveAttachments(mail_obj);
					}
				});
				cb();
			});
		function threadClick(e){
			self.$c.find('.selected')
				.removeClass('selected');
			$(e.target)
				.addClass('selected');
			var thread_id = $(e.target).data('thread');
			self.emit('selection', {
				thread_id: thread_id
			});
		}
	}
	saveAttachments(mail_obj){
		mail_obj.attachments.forEach((attachment)=>{
			this.attachments.push({
				mailbox: mail_obj.mailbox,
				uid: mail_obj.uid,
				attachment: attachment
			});
		});
	}
	printAttachments(){
		this.$attachments_container = $('<div class="attachments">')
			.appendTo(this.$c);
		$('<h3>')
			.html('Attachments')
			.appendTo(this.$attachments_container);
		this.attachments.forEach((a)=>{
			$('<div>')
				.html('<h4>'+a.attachment.fileName+'</h4>')
				.addClass('attachment')
				.appendTo(this.$attachments_container)
				.click(function(){
					var path = ['attachments', a.mailbox, a.uid, a.attachment.fileName].join('/');
					var command = 'open '+path.replace(/ /g,'\\ ');
					exec(command);
				});
		});
	}
}

promisifyAll(ProjectView.prototype);

module.exports = ProjectView;
