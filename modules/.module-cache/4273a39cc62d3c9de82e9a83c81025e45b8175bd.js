global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');

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
			React.createElement(List, {data: this.props.data})
			)
		);
	}
});

var List = React.createClass({displayName: "List",
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
				if(!groups_added[group_id]){
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
		console.log(groups);
		this.render(messages);
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
		return mail_object.text.replace(/[\n\r]/g, ' ').slice(0,125);
	}
	if(mail_object.html){
		return mail_object.html.replace(/<[^>]*>/g, '').replace(/[\n\r]/g, '').trim().slice(0,125);
	}
	return false;
}

function parseName(from_header){
	console.log('parsing name');
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

module.exports = MailboxView;
