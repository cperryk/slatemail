var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var MessageView = require('./modules/messageView.js');
var ProjectView = require('./modules/projectView.js');
var imapHandler = require('./modules/imapHandler.js');
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
	function openProjectView(){
		$('#project_viewer').show();
		$('#message_viewer').css('width','60%');
	}
	function closeProjectView(){
		$('#project_viewer').hide();
		$('#message_viewer').css('width','80%');
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
				if(thread_obj.project_id){
					openProjectView();
					new ProjectView(thread_obj.project_id);
				}
				else{
					closeProjectView();
				}
				return dbHandler.getThreadMessages(thread_obj);
			})
			.then(function(messages){
				markRead(messages);
				new MessageView($('#message_viewer'), messages, BOX);
			})
			.catch(function(error){
				console.log(error);
			});
		$(window).unbind('keypress').on('keypress',function(e){
			console.log('key press');
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
		});
	}

	function update(){
		dbHandler
			.connect()
			.then(function(){
				printMail();
				regularSync();
			});
	}

	function regularSync(){
		return;
		// dbHandler.syncBox('INBOX')
		// 	.then(function(){
		// 		printMail();
		// 		setTimeout(function(){
		// 			regularSync();
		// 		},60000);
		// 	});
	}

	function markRead(mail_objs){
		console.log('marking read');
		console.log(mail_objs);
		mail_objs.forEach(function(mail_obj){
			if(mail_obj.flags.indexOf('\\Seen')===-1){
				imapHandler.markSeen(BOX, mail_obj.uid);
			}
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

});
