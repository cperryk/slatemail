global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');
console.log('testtt');
// console.log(React);

function MailboxView(container){
	this.container = container;

	var BoxViewer = React.createClass({
		getInitialState:function(){
			return {data:[]};
		},
		render:function(){
			return (
				<div class="message_list">
				<h1>Box Viewer</h1>
				<MessageList data={this.state.data} /> 
				</div>
			);
		}
	});

	var MessageList = React.createClass({
		render: function(){
			return (
				<div class="message_list"></div>
			);
		}
	});

	React.render(<BoxViewer/>, this.container[0]);
}
module.exports = mailboxView;
