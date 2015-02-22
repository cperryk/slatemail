global.document= window.document;
global.navigator = window.navigator;
var $ = require('jquery');
var Q = require('Q');
var MessageView = require('../modules/messageView.js');
var dbHandler = new window.dbHandler();
var React = require('react');

var ProjectListReact = React.createClass({displayName: "ProjectListReact",
	getInitialState: function(){
		return {data:[]};
	},
	render: function(){
		return (
			React.createElement("div", {class: "project_list"}, 
			React.createElement(List, {data: this.props.data})
			)
			);
	}
});

function ProjectList(container){
	this.container = container;
}