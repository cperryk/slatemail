global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');
// console.log(React);

function MailboxView(container){
	this.container = container;

	var BoxViewer = React.createClass({displayName: "BoxViewer",
		getInitialState:function(){
			return {data:[]};
		},
		render:function(){
			return (
				React.createElement("div", {class: "message_list"}, 
				React.createElement("h1", null, "Box Viewer"), 
				React.createElement(MessageList, {data: this.state.data})
				)
			);
		}
	});

	var MessageList = React.createClass({displayName: "MessageList",
		render: function(){
			return (
				React.createElement("div", {class: "message_list"})
			);
		}
	});

	React.render(React.createElement(BoxViewer, null), this.container[0]);
}
module.exports = mailboxView;
