var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var MessageView = require('./modules/messageView.js');
var ProjectView = require('./modules/projectView.js');
var imapHandler = require('./modules/imapHandler.js');
var syncer = require('./modules/syncer.js');
var dbHandler = require('./modules/dbHandler.js');
var MailComposer = require('./MailComposer/MailComposer.js');
var Q = require('q');
var gui = require('nw.gui');
var BOX;


$(function(){

	initialize();

	function initialize(){
		selectBox('INBOX');
		addEventListeners();
	}

	function addEventListeners(){
		$('#box_selector').click(function(){
			var box_name = window.prompt('What box do you want?');
			if(!box_name){
				return;
			}
			dbHandler.connect()
				.then(function(){
					selectBox(box_name);
				});
		});
		$(window).keydown(function(e){
			if(e.keyCode===78 && e.metaKey){
				new MailComposer();
			}
		});
		mailboxView.onSelect(emailSelected);
	}

	function selectBox(box_name){
		BOX = box_name;
		$('#message_viewer').empty();
		$('#box_selector').html(box_name);
		update();
	}
	function emailSelected(uid){
		dbHandler.connect()
			.then(function(){
				return dbHandler.getMailFromLocalBox(BOX,uid);
			})
			.then(function(mail_obj){
				return dbHandler.getThread(mail_obj.thread_id);
			})
			.then(function(thread_obj){
				console.log(thread_obj);
				if(thread_obj.project_id){
					$('#project_viewer').show();
					$('#message_viewer').css('width','60%');
					new ProjectView(thread_obj.project_id, thread_obj);
				}
				else{
					$('#project_viewer').hide();
					$('#message_viewer').css('width','80%');
				}
				console.log(thread_obj);
				return dbHandler.getThreadMessages(thread_obj);
			})
			.then(function(messages){
				console.log('thread messages received');
				console.log(messages);
				markRead(messages);
				var messages_to_print = [];
				messages.forEach(function(message){
					if(message.mailbox!=='Drafts'){
						messages_to_print.push(message);
					}
				});
				new MessageView($('#message_viewer'), messages_to_print, BOX);
			})
			.catch(function(error){
				console.log(error);
			});
		$(window).unbind('keypress').on('keypress',function(e){
			console.log('key press: '+e.keyCode);
			if(e.keyCode === 100 ){ // d
				(function(){
					var selected_uid = mailboxView.selected_email.data('uid');
					dbHandler.markComplete(BOX, selected_uid);
					mailboxView.selected_email.slideUp();
				}());
			}
			else if(e.keyCode === 112){ // p
				(function(){
					var project_name = prompt('What project would you like to put this in?');
					var selected_uid = mailboxView.selected_email.data('uid');
					dbHandler.putInProject(BOX, selected_uid, project_name);
				}());
			}
			else if(e.keyCode === 115){ //s
				(function(){
					var date = new Date(prompt('What date would you like to schedule this for?'));
					var selected_uid = mailboxView.selected_email.data('uid');
					dbHandler.schedule(date, BOX, selected_uid)
						.then(function(){
							mailboxView.selected_email.slideUp();
						});
				}());
			}
		});
	}

	function update(){
		dbHandler.connect()
			.then(function(){
				printMail();
				regularSync();
			});
	}

	function regularSync(){
		console.log('regular sync');
		syncer.syncBox('INBOX')
			.then(function(){
				printMail();
			})
			.fin(function(){
				console.log('queing next');
				setTimeout(regularSync,30000);
			})
			.catch(function(err){
				console.log(err);
			});
	}

	function markRead(mail_objs){
		console.log(mail_objs);
		mail_objs.forEach(function(mail_obj){
			console.log(mail_obj);
			dbHandler.markSeen(mail_obj.mailbox, mail_obj.uid)
				.catch(function(err){
					console.log(err);
				});
		});
	}

	function printMail(){
		mailboxView.clear();
		var printed_threads = [];
		dbHandler.getMessagesFromMailbox(BOX,function(mail_object){
			if(printed_threads.indexOf(mail_object.thread_id)>-1){
				return;
			}
			mailboxView.printMessage(mail_object);
			printed_threads.push(mail_object.thread_id);
		});
	}

	function MessageList(container){
		this.container = $(container);
	}

});
