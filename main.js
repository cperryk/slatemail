var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var MessageView = require('./modules/messageView.js');
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
			dbHandler.connect().then(function(){
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
		console.log('----------------------------------------------');
		dbHandler.connect()
			.then(function(){
				return dbHandler.getMailFromLocalBox(BOX,uid);
			})
			.then(function(mail_obj){
				console.log(mail_obj);
				return dbHandler.getThreadMessages(mail_obj.thread_id);
			})
			.then(function(mail_objs){
				markRead(mail_objs);
				new MessageView($('#message_viewer'), mail_objs, BOX);
			});
	}

	function update(){
		dbHandler
			.connect()
			.then(function(){
				mailboxView.clear();
				printMail();
				// dbHandler.syncBox('Sent Items')
				// 	.then(function(){
				// 		dbHandler.syncBox(BOX);
				// 	})
				// 	.then(function(){
				// 		printMail();
				// 	});
				// dbHandler.syncAll();
			});
	}

	function markRead(mail_objs){
		console.log('marking read');
		mail_objs.forEach(function(mail_obj){
			if(mail_obj.flags.indexOf('\\Seen')===-1){
				imapHandler.markSeen(BOX, mail_obj.uid);
			}
		});
	}
	function printMail(){
		console.log('printing mail');
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
