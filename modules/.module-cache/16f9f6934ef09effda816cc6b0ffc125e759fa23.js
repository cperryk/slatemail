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
		subject:'test3'
	}
];

function MailboxView(container){
	this.container = container;

	var BoxViewer = React.createClass({displayName: "BoxViewer",
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
		},
		componentDidMount:function(){
			this.setState({data:DATA});
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

	var Message = React.createClass({displayName: "Message",
		render: function(){
			return (
				React.createElement("div", {className: "message"})
			);
		}
	});
	React.render(React.createElement(BoxViewer, null), this.container[0]);
}
module.exports = MailboxView;
