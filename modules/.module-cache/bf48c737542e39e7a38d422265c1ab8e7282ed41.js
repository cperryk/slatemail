global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');

function MailboxView(container){
	this.container = container;
	console.log(this.container);

	var BoxViewer = React.createClass({
		displayName: "BoxViewer",
		getInitialState:function(){
			return {data:[]};
		},
		render:function(){
			return (
				React.createElement("div", {className: "message_list"}, 
				React.createElement("h1", null, "Box Viewer"), 
				React.createElement(MessageList, {data: this.state.data})
				)
			);
		}
	});

	var MessageList = React.createClass({
		displayName: "MessageList",
		render: function(){
			return (
				React.createElement("div", {className: "message_list"})
			);
		}
	});

	React.render(React.createElement(BoxViewer, null), this.container[0]);
}
module.exports = MailboxView;
