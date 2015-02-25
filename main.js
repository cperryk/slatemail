var fs = require('fs');
var $ = require('jquery');
require('nw.gui').Window.get().showDevTools();

var gui = require('nw.gui');
global.gui = gui;

// SlateMail components
var MailComposer = require('./MailComposer/MailComposer.js');
var MessageList = require('./modules/messageList.js');
var MessageView = require('./modules/messageView.js');
var Overlay = require('./modules/overlay.js');
var ProjectList = require('./modules/projectList.js');
var ProjectView = require('./modules/projectView.js');
var Syncer = require('./modules/syncer.js');
var treeView = require('./modules/treeView.js');
var ProjectSelector = require('./modules/ProjectSelector');
var Scheduler = require('./modules/scheduler.js');
var UserCommand = require('./modules/userCommand.js');
var PreferencesEditor = require('./modules/preferencesEditor.js');

var Q = require('q');
var indexedDB = window.indexedDB;
var keychain = require('keychain');

var my_dbHandler;
require('jquery-ui');

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
			return my_dbHandler.connect();
		})
		.then(function(){
			message_list = new MessageList($('#inbox'), {
				onSelection:function(mailbox, uid){
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
			project_view = new ProjectView($('#project_viewer'), {
				onSelection: function(thread_id){
					message_list.selectMessageByThreadID(thread_id);
					my_dbHandler.getThread(thread_id)
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
	console.log('');
	console.log('');
	console.log('---------------------------- EMAIL SELECTED -------------------------------');
	var my_thread_obj;
	my_dbHandler.connect()
		.then(function(){
			return my_dbHandler.getMailFromLocalBox(mailbox,uid);
		})
		.then(function(mail_obj){
			return my_dbHandler.getThread(mail_obj.thread_id);
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
			return user_command.markSeenSeries(my_thread_obj.messages);
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
				user_command.markComplete(selection.mailbox, selection.uid);
				message_list.removeSelected();
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
						my_dbHandler.putInProject(selected_email.mailbox, selected_email.uid, project_id)
							.then(function(){
								return my_dbHandler.getMailFromLocalBox(selected_email.mailbox, selected_email.uid);
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
				new Scheduler(overlay.container, {
					onSelection:function(selected_date){
						var selected_email = message_list.getSelection();
						user_command.schedule(selected_date, selected_email.mailbox, selected_email.uid)
							.then(function(){
								message_list.removeSelected();
							});
						overlay.close();
					}
				});
				return;
			},
			98: function(){ // b
				var selection = message_list.getSelection();
				my_dbHandler.getMailFromLocalBox(selection.mailbox, selection.uid)
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
			109: function(){ // m
				var selection = message_list.getSelection();
				var my_mail_obj;
				my_dbHandler.getMailFromLocalBox(selection.mailbox, selection.uid)
					.then(function(mail_obj){
						my_mail_obj = mail_obj;
						return my_dbHandler.getThread(mail_obj.thread_id);
					})
					.then(function(thread_obj){
						if(thread_obj.muted === true){
							if(confirm("This thread is muted. Do you want to unmute it?")){
								return my_dbHandler.unmuteThread(my_mail_obj.thread_id);
							}
						}
						else{
							if(confirm("Do you want to mute this thread? It and all messages in it henceforward will be marked complete automatically.")){
								return my_dbHandler.muteThread(my_mail_obj.thread_id)
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
	syncer.start();
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

function markRead(mail_objs){
	console.log(mail_objs);
	mail_objs.forEach(function(mail_obj){
		console.log(mail_obj);
		my_dbHandler.markSeen(mail_obj.mailbox, mail_obj.uid)
			.catch(function(err){
				console.log(err);
			});
	});
}

function getPassword(){
	var def = Q.defer();
	var password;
	keychain.getPassword({account:global.PREFERENCES.internal.user, service:'SlateMail'}, function(err, pass){
		if(!pass){
			password = window.prompt('What is your IMAP password?');
			keychain.setPassword({account:global.PREFERENCES.internal.user, service:'SlateMail', password: password}, function(err){
				if(err){
					console.log(err);
				}
			});
		}
		else{
			password = pass;
		}
		def.resolve(password);
	});
	return def.promise;
}