var fs = require('fs');
var $ = require('jquery');

// SlateMail components
var MailComposer = require('./mailComposer/mailComposer.js');
var MessageList = require('./modules/messageList.js');
var MessageView = require('./modules/messageView.js');
var Overlay = require('./modules/overlay.js');
var ProjectList = require('./modules/projectList.js');
var ProjectView = require('./modules/projectView.js');
var Syncer = require('./modules/syncer.js');
var treeView = require('./modules/treeView.js');
var ProjectSelector = require('./modules/ProjectSelector');

var Q = require('q');
var gui = require('nw.gui');
var indexedDB = window.indexedDB;

var dbHandler = new dbHandler();
require('jquery-ui');

// Instances of components
var tree_view;
var message_list;
var message_view;
var project_list;

// Default box
var BOX = 'INBOX';

// Other parameters
var overlay_is_open = false;

$(function init(){
	dbHandler
		.connect()
		.then(function(){
			message_list = new MessageList($('#inbox'), {
				onSelection:function(mailbox, uid){
					console.log('selected');
					emailSelected(mailbox, uid);
				}
			});
			tree_view = new treeView($('#tree_view'), {
				onSelection:function(box_path){
					selectBox(box_path);
				}
			});
			message_view = new MessageView($('#message_viewer'));
			project_list = new ProjectList($('#project_list'), {
				onSelection:function(project_id){
					openProjectView(project_id);
				}
			});
			addEventListeners();
			return true;
		})
		.then(function(){
			return tree_view.printTree();
		})
		.then(function(){
			return message_list.printBox(BOX);
		})
		.fin(function(){
			// regularSync();
		})
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
				console.log('SELECTED THREAD', thread_obj);
				openProjectView(thread_obj.project_id, thread_obj.thread_id);
				// ^ careful where you put this last line. If it runs the same time
				// as you get the thread messages for the selected message,
				// things will break.
			}
			else{
				closeProjectView();
			}
		})
		.then(function(){
			return dbHandler.markSeenSeries(my_thread_obj.messages);
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
						dbHandler.putInProject(selected_email.mailbox, selected_email.uid, project_id)
							.then(function(){
								return dbHandler.getMailFromLocalBox(selected_email.mailbox, selected_email.uid);
							})
							.then(function(mail_obj){
								openProjectView(project_id, mail_obj.thread_id);
							})
							.then(function(){
								project_list.render();
							});
						overlay.close();
					}
				});
			},
			115: function(){ // s

				var overlay = new Overlay();
				var input = $('<input type="text" id="datepicker">')
					.appendTo(overlay.container)
					.datepicker({
						onSelect:function(date_text, obj){
							var date = input.datepicker('getDate');
							var selection = message_list.getSelection();
							dbHandler.schedule(date, selection.mailbox, selection.uid)
								.then(function(){
									removeElement();
								});
								overlay.close();
							// console.log(isValidDate(new Date(date_text)));
						}
					})
					.focus();
				setTimeout(function(){
					input.val('');				
				},1);
				return;


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
			},
			109: function(){ // m
				var selection = message_list.getSelection();
				var my_mail_obj;
				dbHandler.getMailFromLocalBox(selection.mailbox, selection.uid)
					.then(function(mail_obj){
						my_mail_obj = mail_obj;
						return dbHandler.getThread(mail_obj.thread_id);
					})
					.then(function(thread_obj){
						if(thread_obj.muted === true){
							if(confirm("This thread is muted. Do you want to unmute it?")){
								return dbHandler.unmuteThread(my_mail_obj.thread_id);
							}
						}
						else{
							if(confirm("Do you want to mute this thread? It and all messages in it henceforward will be marked complete automatically.")){
								return dbHandler.muteThread(my_mail_obj.thread_id)
									.then(function(){
										removeElement();
										return dbHandler.markComplete(selection.mailbox, selection.uid);
									});
							}
						}
					})
					.catch(function(err){
						console.log(err);
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
	var syncer = new Syncer()
		.start()
		.onSyncComplete(function(){
			message_list.printBox(BOX);
		});
}

function openProjectView(project_id, initial_thread_id){
	console.log('initial_thread_id = '+initial_thread_id);
	$('body').addClass('project_viewer_open');
	$('#project_viewer').show();
	new ProjectView(project_id, initial_thread_id, {
		onSelection: function(thread_id){
			message_list.selectMessageByThreadID(thread_id);
			dbHandler.getThread(thread_id)
				.then(function(thread_obj){
					console.log('thread obj is ');
					console.log(thread_obj);
					message_view.printThread(thread_obj);
				});
			},
		onProjectDeletion: function(){
			project_list.render();
			closeProjectView();
		}
	});
}
function closeProjectView(){
	$('#project_viewer').hide();
	$('body').removeClass('project_viewer_open');
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
