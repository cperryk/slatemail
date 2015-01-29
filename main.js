var fs = require('fs');
var $ = require('jquery');
var MessageList = require('./modules/messageList.js');
var MessageView = require('./modules/messageView.js');
var ProjectView = require('./modules/projectView.js');
var imapHandler = require('./modules/imapHandler.js');
var syncer = require('./modules/syncer.js');
// var dbHandler = require('./modules/dbHandler.js');
var MailComposer = require('./MailComposer/MailComposer.js');
var treeView = require('./modules/treeView.js');
var Q = require('q');
var gui = require('nw.gui');
var Overlay = require('./modules/overlay.js');
var ProjectSelector = require('./modules/ProjectSelector');
var indexedDB = window.indexedDB;
var test = require('./modules/testModule.js');
// var test = require('./modules/test.js');

var tree_view;
var message_list;
var message_view;
var BOX = 'INBOX';
var overlay_is_open = false;

$(function init(){
	dbHandler.connect()
		// .then(function(){
		// 	return imapHandler.getMessageWithUID('Deleted Items', 29949);
		// })
		// .then(function(mail_obj){
		// 	console.log(mail_obj);
		// 	return dbHandler.saveMailToLocalBox('Deleted Items', mail_obj);
		// })
		.then(function(){
			return syncer.syncBox('Deleted Items');
		})
		// .then(function(){
		// 	message_list = new MessageList($('#inbox'), {
		// 		onSelection:function(mailbox, uid){
		// 			console.log('selected');
		// 			emailSelected(mailbox, uid);
		// 		}
		// 	});
		// 	tree_view = new treeView($('#tree_view .inner'), {
		// 		onSelection:function(box_path){
		// 			selectBox(box_path);
		// 		}
		// 	});
		// 	message_view = new MessageView($('#message_viewer'));
		// 	addEventListeners();
		// 	return true;
		// })
		// .then(function(){
		// 	return tree_view.printTree();
		// })
		// .then(function(){
		// 	return message_list.printBox(BOX);
		// })
		// .then(function(){
		// 	regularSync();
		// })
		.catch(function(err){
			console.log(err);
		});
});

function addEventListeners(){
	$(window).keydown(function(e){
		if(e.keyCode===78 && e.metaKey){
			// this.Win = gui.Window.open('mailComposer/mailComposer.html');
			new MailComposer();
		}
	});
}
function selectBox(box_name){
	BOX = box_name;
	message_view.clear();
	$('#box_selector').html('&#171; '+box_name);
	tree_view.reflectActiveMailbox(box_name);
	message_list.printBox(BOX);
}
function emailSelected(mailbox, uid){
	console.log('');
	console.log('');
	console.log('---------------------------- EMAIL SELECTED -------------------------------');
	var my_thread_obj;
	dbHandler.connect()
		.then(function(){
			return dbHandler.getMailFromLocalBox(mailbox,uid);
		})
		.then(function(mail_obj){
			return dbHandler.getThread(mail_obj.thread_id);
		})
		.then(function(thread_obj){
			my_thread_obj = thread_obj;
			return message_view.printThread(thread_obj);
		})
		.then(function(){
			var thread_obj = my_thread_obj;
			if(thread_obj.project_id !== undefined){
				$('body').addClass('project_viewer_open');
				$('#project_viewer').show();
				new ProjectView(thread_obj.project_id, thread_obj, {
					onSelection: function(thread_id){
						dbHandler.getThread(thread_id)
							.then(function(thread_obj){
								console.log('thread obj is ');
								console.log(thread_obj);
								message_view.printThread(thread_obj);
							});
					}
				});
				// ^ careful where you put this last line. If it runs the same time
				// as you get the thread messages for the selected message,
				// things will break.
			}
			else{
				$('#project_viewer').hide();
				$('body').removeClass('project_viewer_open');
			}
		})
		.catch(function(error){
			console.log(error);
		});
	addSelectedEmailListeners();
}
function addSelectedEmailListeners(){
	$(window).unbind('keypress.selected_email').on('keypress.selected_email',function(e){
		var key_code = e.keyCode;
		var key_functions = {
			100: function(){ // d
				var selection = message_list.getSelection();
				dbHandler.markComplete(selection.mailbox, selection.uid);
				removeElement();
			},
			112: function(){ // p
				$(window).unbind('keypress.selected_email');
				var overlay = new Overlay({
					onClose:function(){
						addSelectedEmailListeners();
					}
				});
				var project_selector = new ProjectSelector(overlay.container, {
					onSelection:function(project_id){
						var selected_email = message_list.getSelection();
						dbHandler.putInProject(selected_email.mailbox, selected_email.uid, project_id);
						overlay.close();
					}
				});
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
				var selection = message_list.getSelection();
				dbHandler.schedule(date, selection.mailbox, selection.uid)
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
				var selection = message_list.getSelection();
				dbHandler.getMailFromLocalBox(selection.mailbox, selection.uid)
					.then(function(mail_obj){
						var sender = mail_obj.from[0].address;
						var block_sender = confirm("Do you want to block emails from "+sender+" and delete this thread?");
						if(block_sender){
							dbHandler.blockSender(sender);
							alert("Emails from " + sender + " will automatically be deleted");
							var selection = message_list.getSelection();
							dbHandler.markComplete(selection.mailbox, selection.uid);
							removeElement();
						}
					});
			}
		};
		if(key_functions[key_code]){
			key_functions[key_code]();
		}
		function removeElement(){
			var ele = message_list.selected_email;
			var par = ele.parent();
			ele.slideUp(function(){
				ele.remove();
				if(par.find('.message').length === 0){
					par.slideUp();
				}
			});
		}
	});
}

function regularSync(){
	console.log('**** REGULAR SYNC ******');
	syncer.syncAll()
		.then(function(){
			return message_list.printBox(BOX);
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
