var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var MessageView = require('./modules/messageView.js');
var ProjectView = require('./modules/projectView.js');
var imapHandler = require('./modules/imapHandler.js');
var syncer = require('./modules/syncer.js');
var dbHandler = require('./modules/dbHandler.js');
var MailComposer = require('./MailComposer/MailComposer.js');
var treeView = require('./modules/treeView.js');
var Q = require('q');
var gui = require('nw.gui');
var BOX;
var tree_view;


$(function(){

	(function init(){
		tree_view = new treeView($('#tree_view .inner'), {
			onSelection:function(box_path){
				selectBox(box_path);
			}
		});
		selectBox('INBOX');
		addEventListeners();
		regularSync();
	}());

	function addEventListeners(){
		$('#box_selector').click(function(){
			// var box_name = window.prompt('What box do you want?');
			// if(!box_name){
			// 	return;
			// }
			// dbHandler.connect()
			// 	.then(function(){
			// 		selectBox(box_name);
			// 	});
		});
		$(window).keydown(function(e){
			if(e.keyCode===78 && e.metaKey){
				new MailComposer();
			}
		});
		mailboxView.onSelect(emailSelected);
		mailboxView.onDeselect(function(){
			// var win = gui.Window.get();
			// win.resizeTo(250,win.height);
			$('#project_viewer').hide();
			$('#message_viewer').empty();
		});
	}

	function selectBox(box_name){
		BOX = box_name;
		$('#message_viewer').empty();
		$('#box_selector').html('&#171; '+box_name);
		update();
		console.log(tree_view);
		tree_view.reflectActiveMailbox(box_name);
	}
	function emailSelected(mailbox, uid){
		// var win = gui.Window.get();
		// win.resizeTo(800,win.height);
		dbHandler.connect()
			.then(function(){
				return dbHandler.getMailFromLocalBox(mailbox,uid);
			})
			.then(function(mail_obj){
				return dbHandler.getThread(mail_obj.thread_id);
			})
			.then(function(thread_obj){
				if(thread_obj.project_id){
					$('body').addClass('project_viewer_open');
					$('#project_viewer').show();
					new ProjectView(thread_obj.project_id, thread_obj);
				}
				else{
					$('#project_viewer').hide();
					$('body').removeClass('project_viewer_open');
				}
				return dbHandler.getThreadMessages(thread_obj);
			})
			.then(function(messages){
				console.log(messages);
				markRead(messages);
				var messages_to_print = [];
				messages.forEach(function(message){
					if(message.mailbox!=='Drafts'){
						messages_to_print.push(message);
					}
				});
				new MessageView($('#message_viewer'), messages_to_print);
			})
			.catch(function(error){
				console.log(error);
			});
		$(window).unbind('keypress').on('keypress',function(e){
			console.log('key press: '+e.keyCode);
			var key_code = e.keyCode;
			var key_functions = {
				100: function(){ // d
					var selected_uid = mailboxView.selected_email.data('uid');
					var box = mailboxView.selected_email.data('mailbox');
					dbHandler.markComplete(box, selected_uid);
					removeElement();
				},
				112: function(){ // p
					var project_name = prompt('What project would you like to put this in?');
					var selected_uid = mailboxView.selected_email.data('uid');
					var selected_box = mailboxView.selected_email.data('mailbox');
					dbHandler.putInProject(selected_box, selected_uid, project_name);
				},
				115: function(){ // s
					var user_input = prompt('What date would you like to schedule this for?');
					console.log(user_input);
					if(!user_input){
						return;
					}
					var date = new Date(user_input);
					if(!isValidDate(date)){
						return;
					}
					var selected_uid = mailboxView.selected_email.data('uid');
					var selected_box = mailboxView.selected_email.data('mailbox');
					dbHandler.schedule(date, selected_box, selected_uid)
						.then(function(){
							removeElement();
						});
					function isValidDate(d){
						if ( Object.prototype.toString.call(date) === "[object Date]" ) {
							if ( isNaN( d.getTime() ) ) {  // d.valueOf() could also work
								return false;
						  	}
						  	else {
								return true;
						  	}
						}
						else {
							return false;
						}
					}
				},
				98: function(){ // b
					var selected_uid = mailboxView.selected_email.data('uid');
					var selected_box = mailboxView.selected_email.data('mailbox');
					dbHandler.getMailFromLocalBox(selected_box, selected_uid)
						.then(function(mail_obj){
							var sender = mail_obj.from[0].address;
							var block_sender = confirm("Do you want to block emails from "+sender+" and delete this thread?");
							if(block_sender){
								dbHandler.blockSender(sender);
								alert("Emails from " + sender + " will automatically be deleted");
							}
						});
				}
			};
			if(key_functions[key_code]){
				key_functions[key_code]();
			}
			function removeElement(){
				var ele = mailboxView.selected_email;
				var par = ele.parent();
				ele.slideUp(function(){
					ele.remove();
					if(par.find('.inbox_email').length === 0){
						par.slideUp();
					}
				});
			}
		});
	}

	function update(){
		dbHandler.connect()
			.then(function(){
				printMail();
				// regularSync();
			})
			.catch(function(err){
				console.log(err);
			});
	}

	function regularSync(){
		console.log('**** REGULAR SYNC ******');
		syncer.syncAll()
			.then(function(){
				printMail();
			})
			.fin(function(){
				console.log('queing next');
				setTimeout(regularSync,60000);
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
		var def = Q.defer();
		console.log('printing mail');
		mailboxView.clear();
		var printed_threads = [];
		var messages_to_print = [];
		dbHandler.getMessagesFromMailbox(BOX, function(mail_obj){
			if(printed_threads.indexOf(mail_obj.thread_id)>-1){
				return;
			}
			messages_to_print.push(mail_obj);
			printed_threads.push(mail_obj.thread_id);
		})
		.then(function(){

			return dbHandler.getDueMail();
		})
		.then(function(due_mail){
			due_mail.forEach(function(mail_obj){
				if(printed_threads.indexOf(mail_obj.thread_id)>-1){
					return;
				}
				messages_to_print.push(mail_obj);
				printed_threads.push(mail_obj.thread_id);
			});
			messages_to_print.sort(function(a,b){
				return a.date > b.date ? -1 : 1;
			});
			messages_to_print.forEach(function(mail_obj, index){
				mailboxView.printMessage(mail_obj);
			});
		})
		.fin(function(){
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
		return def.promise;
	}

});
