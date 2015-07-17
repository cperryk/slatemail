var fs = require('fs');
var $ = require('jquery');
require('nw.gui').Window.get().showDevTools();

var gui = require('nw.gui');
global.gui = gui;

// var Q = require('q');
var Promise = require('bluebird');
var indexedDB = window.indexedDB;


// SlateMail component classes
var MailComposer = require('./MailComposer/MailComposer.js');
var MessageList = require('./modules/messageList.js');
var MessageView = require('./modules/messageView.js');
var Overlay = require('./modules/overlay.js');
var PreferencesEditor = require('./modules/preferencesEditor.js');
var ProjectList = require('./modules/projectList.js');
var ProjectSelector = require('./modules/ProjectSelector');
var ProjectView = require('./modules/projectView.js');
var Scheduler = require('./modules/scheduler.js');
var Syncer = require('./modules/syncer.js');
var TreeView = require('./modules/treeView.js');
var UserCommand = require('./modules/userCommand.js');

// utility functions
var getPassword = require('./modules/getPassword.js');

// injections
require('jquery-ui');

// global vars
var my_dbHandler;


// Instances of components
var tree_view;
var message_list;
var message_view;
var project_list;
var project_view;
var user_command;

// Default box
var BOX = 'INBOX';
global.PREFERENCES = JSON.parse(fs.readFileSync('preferences/preferences.json'));

// Other parameters
var overlay_is_open = false;

(function init(){
	// reset
	// getPassword()
	// 	.then(function(){
	// 		my_dbHandler = new dbHandler();
	// 		my_dbHandler.deleteDB();
	// 		return;
	// 	});
	// return;;
	$(function(){
		$('.btn_preferences').click(function(){
			new PreferencesEditor();
		});
	});

	getPassword()
		.then(function(password){
			console.log('PASSWORD IS '+password);
			global.PREFERENCES.internal.password = password;
			my_dbHandler = new dbHandler();
			console.log('my dbhandler!');
			console.log(my_dbHandler);
			return my_dbHandler.connectAsync();
		})
		.then(function(){
			message_list = new MessageList($('#inbox'))
				.on('selection', function(e){
					emailSelected(e.mailbox, e.uid);
				});
			tree_view = new TreeView($('#tree_view'))
				.on('selection', function(e){
					selectBox(e.box_path);
				});
			message_view = new MessageView($('#message_viewer'))
				.on('messages', function(e){
					user_command.markSeen(e.messages);
				});
			project_list = new ProjectList($('#project_list'))
				.on('selection', function(e){
					openProjectView(e.project_id);
				});
			project_view = new ProjectView($('#project_viewer'))
				.on('selection', function(e){
					var thread_id = e.thread_id;
					message_list.selectMessageByThreadID(thread_id);
					my_dbHandler.getThreadAsync(thread_id)
						.then(function(thread_obj){
							message_view.printThread(thread_obj);
						});
				})
				.on('project_deletion', function(e){
					project_list.render();
					closeProjectView();
				});
			user_command = new UserCommand();
			selectBox('INBOX');
			addEventListeners();
			return true;
		})
		.then(function(){
			return tree_view.printTree();
		})
		.fin(function(){
			regularSync();
		})
		.catch(function(err){
			console.log(err);
		});
}());

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
	$('#box_selector').html(box_name);
	tree_view.reflectActiveMailbox(box_name);
	message_list.printBox(BOX);
}
function emailSelected(mailbox, uid){
	console.log('---------------------------- EMAIL SELECTED -------------------------------');
	var my_thread_obj;
	my_dbHandler.connectAsync()
		.then(function(){
			return my_dbHandler.getMailFromLocalBoxAsync(mailbox,uid);
		})
		.then(function(mail_obj){
			return my_dbHandler.getThreadAsync(mail_obj.thread_id);
		})
		.then(function(thread_obj){
			my_thread_obj = thread_obj;
			return message_view.printThread(thread_obj);
		})
		.then(function(){
			var thread_obj = my_thread_obj;
			if(thread_obj.project_id !== undefined){
				openProjectView(thread_obj.project_id, thread_obj.thread_id);
			}
			else{
				closeProjectView();
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
			100: function(){ // d - marks an email as done
				var selection = message_list.getSelection();
				user_command.markComplete(selection.mailbox, selection.uid);
				message_list.removeSelected();
			},
			112: function(){ // p - opens project selector to group thread into project
				$(window).unbind('keypress.selected_email');
				var overlay = new Overlay()
					.on('close', addSelectedEmailListeners);
				var project_selector = new ProjectSelector(overlay.getContainer())
					.on('selection', function(e){
						var project_id = e.project_id;
						var selected_email = message_list.getSelection();
						my_dbHandler.putInProjectAsync(selected_email.mailbox, selected_email.uid, project_id)
							.then(function(){
								return my_dbHandler.getMailFromLocalBoxAsync(selected_email.mailbox, selected_email.uid);
							})
							.then(function(mail_obj){
								openProjectView(project_id, mail_obj.thread_id);
							})
							.then(function(){
								project_list.render();
						});
						overlay.close();
				});
			},
			115: function(){ // s - opens scheduler to bounce email back to inbox at date

				var overlay = new Overlay();
				new Scheduler(overlay.container)
					.on('selection', function(e){
						var selected_date = e.selected_date;
						var selected_email = message_list.getSelection();
						user_command.schedule(selected_date, selected_email.mailbox, selected_email.uid)
							.then(function(){
								message_list.removeSelected();
							});
						overlay.close();
					});
				return;
			},
			98: function(){ // b - blocks the sender
				var selection = message_list.getSelection();
				my_dbHandler.getMailFromLocalBoxAsync(selection.mailbox, selection.uid)
					.then(function(mail_obj){
						var sender = mail_obj.from[0].address;
						var block_sender = confirm("Do you want to block emails from "+sender+" and delete this thread?");
						if(block_sender){
							my_dbHandler.blockSender(sender);
							alert("Emails from " + sender + " will automatically be deleted");
							var selection = message_list.getSelection();
							user_command.markComplete(selection.mailbox, selection.uid);
							message_list.removeSelected();
						}
					});
			},
			109: function(){ // m - mutes the thread
				var selection = message_list.getSelection();
				var my_mail_obj;
				my_dbHandler.getMailFromLocalBoxAsync(selection.mailbox, selection.uid)
					.then(function(mail_obj){
						my_mail_obj = mail_obj;
						return my_dbHandler.getThreadAsync(mail_obj.thread_id);
					})
					.then(function(thread_obj){
						if(thread_obj.muted === true){
							if(confirm("This thread is muted. Do you want to unmute it?")){
								return my_dbHandler.unmuteThreadAsync(my_mail_obj.thread_id);
							}
						}
						else{
							if(confirm("Do you want to mute this thread? It and all messages in it henceforward will be marked complete automatically.")){
								return my_dbHandler.muteThreadAsync(my_mail_obj.thread_id)
									.then(function(){
										message_list.removeSelected();
										return user_command.markComplete(selection.mailbox, selection.uid);
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
	});
}

function regularSync(){
	console.log('**** REGULAR SYNC ******');
	var syncer = new Syncer({
		onSyncComplete: function(){
			message_list.printBox(BOX);
			tree_view.printTree();
		}
	});
	// syncer.start();
}

function openProjectView(project_id, initial_thread_id){
	console.log('initial_thread_id = '+initial_thread_id);
	$('body').addClass('project_viewer_open');
	$('#project_viewer').show();
	project_view.printProject(project_id, initial_thread_id);
}
function closeProjectView(){
	$('#project_viewer').hide();
	$('body').removeClass('project_viewer_open');
}
