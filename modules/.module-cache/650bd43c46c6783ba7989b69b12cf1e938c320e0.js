global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');
// console.log(React);

var DATA = [
	{
		subject:'test'
	},
	{
		subject:'test2'
	},
	{
		subject:'test4'
	}
];

var BoxViewer = React.createClass({displayName: "BoxViewer",
	getInitialState:function(){
		return {data:[]};
	},
	render:function(){
		return (
			React.createElement("div", {className: "message_list"}, 
			React.createElement("h1", null, "Box Viewer"), 
			React.createElement(MessageList, {data: this.props.data})
			)
		);
	}
});

var MessageList = React.createClass({displayName: "MessageList",
	render: function(){
		var message_nodes = this.props.data.map(function(message_data){
			return (
				React.createElement(Message, {data: message_data})
			);
		});
		return (
			React.createElement("div", {className: "message_list"}, 
			message_nodes
			)
		);
	}
});

/*
var template = '<div id="'+mid+'" data-mailbox="'+mail_object.mailbox+'" data-uid="'+mail_object.uid+'" class="inbox_email">'+
			'<div class="from">'+mailboxView.parseName(mail_object.from)+'</div>'+
			'<div class="subject">'+mail_object.headers.subject+'</div>'+
			'<div class="text_preview">'+mailboxView.getPreviewText(mail_object)+'</div>'+
		'</div>';
 */

var Message = React.createClass({displayName: "Message",
	render: function(){
		var mail_obj = this.props.data;
		var from = mail_obj.from;
		var subject = mail_object.headers.subject;
		var preview_text = mailboxView.getPreviewText(mail_object);
		return (
			React.createElement("div", {className: "message", "data-mailbox": "{mail_obj.mailbox}", "data-uid": "{mail_obj.uid}"}, 
				React.createElement("div", {className: "from"}, from), 
				React.createElement("div", {className: "subject"}, subject), 
				React.createElement("div", {className: "text_preview"}, preview_text)
			)
		);
	}
});

function MailboxView(container){
	this.container = container;
	this.render(DATA);
}
MailboxView.prototype = {
	render:function(data){
		React.render(React.createElement(BoxViewer, {data: data}), this.container[0]);
	},
	reflectMessages: function(messages){
		console.log(messages);
		this.render(messages);
	}
};
module.exports = MailboxView;
