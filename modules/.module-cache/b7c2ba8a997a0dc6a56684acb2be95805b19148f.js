global.document= window.document;
global.navigator = window.navigator;
var $ = require('jquery');
var Q = require('Q');
// var dbHandler = require('./dbHandler');
var React = require('react');
var dbHandler = window.dbHandler;
// REACT CLASSES
var BoxViewer = React.createClass({displayName: "BoxViewer",
	getInitialState:function(){
		return {data:[]};
	},
	render:function(){
		return (
			React.createElement("div", {className: "message_list"}, 
			React.createElement(List, {data: this.props.data})
			)
		);
	}
});

var List = React.createClass({displayName: "List",
	render: function(){
		console.log(this.props.data);
		var message_group_nodes = this.props.data.map(function(group_data){
			return (
				React.createElement(MessageGroup, {key: group_data.id, data: group_data})
			);
		});
		return (
			React.createElement("div", {className: "message_groups"}, 
			message_group_nodes
			)
		);
	}
});

var MessageGroup = React.createClass({displayName: "MessageGroup",
	render: function(){
		var message_nodes = this.props.data.messages.map(function(message_data){
			return (
				React.createElement(Message, {key: message_data.mailbox+':'+message_data.uid, data: message_data})
			);
		});
		return (
			React.createElement("div", {className: "message_group"}, 
				React.createElement("div", {className: "message_group_title"}, 
					React.createElement("span", {className: "triangle"}, "▼"), " ", 
					React.createElement("span", {className: "date_string"}, this.props.data.id)
				), 
				message_nodes
			)
		);
	}
});

var Message = React.createClass({displayName: "Message",
	render: function(){
		var mail_obj = this.props.data;
		if(!mail_obj.from){
			return (
				React.createElement("div", {className: "message"})
			);
		}
		var from = parseName(mail_obj.from);
		var subject = mail_obj.headers.subject;
		var preview_text = getPreviewText(mail_obj);
		var mailbox = mail_obj.mailbox;
		var unread = mail_obj.flags.indexOf('\\Seen')===-1;
		var class_name = "message"+(unread?' unread':'');
		return (
			React.createElement("div", {className: class_name, "data-mailbox": mail_obj.mailbox, "data-uid": mail_obj.uid}, 
				React.createElement("div", {className: "from"}, from), 
				React.createElement("div", {className: "subject"}, subject), 
				React.createElement("div", {dangerouslySetInnerHTML: {__html: preview_text}, className: "text_preview"})
			)
		);
	}
});

function MessageList(container, conf){
	console.log(dbHandler);
	var self = this;
	this.container = container;
	this.container
		.on('click', '.message', function(){
			if(conf.onSelection){
				conf.onSelection($(this).data('mailbox'), $(this).data('uid'));
				container.find('.selected').removeClass('selected');
				$(this).addClass('selected');
				self.selected_email = $(this);
			}
		})
		.on('click', '.message_group_title', function(){
			if($(this).hasClass('collapsed')){
				$(this)
					.removeClass('collapsed')
					.siblings()
						.show()
						.end()
					.find('.triangle')
						.html('&#9660;')
						.end();
			}
			else{
				$(this)
					.addClass('collapsed')
					.siblings()
						.hide()
						.end()
					.find('.triangle')
						.html('&#9654;')
						.end();
				}
		});
}
MessageList.prototype = {
	render:function(groups){
		console.log('RENDERING');
		React.render(React.createElement(BoxViewer, {data: groups}), this.container[0]);
	},
	printBox:function(box){
		console.log('-------------- printing mail --------------');
		var self = this;
		var def = Q.defer();
		var printed_threads = [];
		var messages_to_print = [];
		console.log(dbHandler);
		dbHandler.getMessagesFromMailbox(box, function(mail_obj){
			// console.log('retrieved message: '+mail_obj.uid);
			if(printed_threads.indexOf(mail_obj.thread_id)===-1){
				messages_to_print.push(mail_obj);
				printed_threads.push(mail_obj.thread_id);
			}
			return true;
		})
		.then(function(){
			if(box === 'INBOX'){
				return function(){
					var def = Q.defer();
					dbHandler.getDueMail()
						.then(function(due_mail){
							due_mail.forEach(function(mail_obj){
								if(printed_threads.indexOf(mail_obj.thread_id)===-1){
									messages_to_print.push(mail_obj);
									printed_threads.push(mail_obj.thread_id);
								}
							});
							def.resolve();
						});
					return def.promise;
				};
			}
			else{
				return true;
			}
		})
		.then(function(){
			console.log('messages to print...');
			console.log(messages_to_print);
			return self.reflectMessages(messages_to_print);
		})
		.fin(function(){
			def.resolve();
		})
		.catch(function(err){
			console.log(err);
		});
		return def.promise;
	},
	reflectMessages: function(messages){
		var self = this;
		var groups = (function(){
			var out = [];
			var groups_added = {};
			var group_index = -1;
			messages.forEach(function(mail_obj){
				var group_id = (function(){
					if(mail_obj.mailbox.substring(0, 'SlateMail/scheduled/'.length) === 'SlateMail/scheduled/'){
						return 'Past Due';
					}
					return self.getDateString(mail_obj.date);
				}());
				if(!(group_id in groups_added)){
					out.push({
						id: group_id,
						messages: []
					});
					groups_added[group_id] = true;
					group_index++;
				}
				out[group_index].messages.push(mail_obj);
			});
			return out;
		}());
		this.render(groups);
	},
	getSelection: function(){
		return {mailbox: this.selected_email.data('mailbox'), uid: this.selected_email.data('uid')};
	},
	getDateString:function(date){
		var today = new Date();
		var days_diff = Math.abs(Math.round(daysDiff(today, date)));
		var days_of_week = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
		if(days_diff===0){
			return 'today';
		}
		if(days_diff===1){
			return 'yestersday';
		}
		if(days_diff>=2 && days_diff < 7){
			return days_of_week[date.getDay()];
		}
		if(days_diff >= 7 && days_diff < 14){
			return 'One week ago';
		}
		if(days_diff >= 14){
			return 'Two weeks ago +';
		}
		if(days_diff >= 30){
			return 'One month ago';
		}
		if(days_diff >= 60){
			return 'Two months ago';
		}
		if(days_diff >= 90){
			return 'Three months ago';
		}
		if(days_diff >= 360){
			return 'One year ago';
		}
		return false;

		function daysDiff(first, second) {
			return (second-first)/(1000*60*60*24);
		}
		return false;
	}
};

function getPreviewText(mail_object){
	/**
	 * Return the preview text of a mail object. The preview text is a slice of
	 * the email's message text.
	 * @param {object} mail_object
	 */
	if(mail_object.text){
		console.log('text');
		return mail_object.text.replace(/[\n\r]/g, ' ').slice(0,125);
	}
	if(mail_object.html){
		// return mail_object.html.replace(/<[^>]*>/g, '').replace(/[\n\r]/g, '').trim().slice(0,125);
		var html = $(mail_object.html).text().slice(0,125);
		console.log(html);
		return html;
	}
	return false;
}

function parseName(from_header){
	if(!from_header || from_header.length === 0){
		return '';
	}
	if(from_header[0].name){
		s = from_header[0].name;
		s = s.replace(/"/g,"");
		s = s.split(',');
		if(s.length>1){
			s.reverse();
			return s.join(' ');
		}
		else{
			return s;
		}
	}
	else{
		return from_header[0].address;
	}
	return '';
}

module.exports = MessageList;
