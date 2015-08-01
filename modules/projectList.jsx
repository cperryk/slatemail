global.document= window.document;
global.navigator = window.navigator;
var $ = require('jquery');
var Q = require('Q');
var MessageView = require('./messageView.es6');
var DbHandler = window.dbHandler;
var React = require('react');

var EventEmitter = require('events').EventEmitter;

var ProjectListReact = React.createClass({
	getInitialState: function(){
		return {data:[]};
	},
	render: function(){
		console.log(this.props);
		var project_item_nodes = this.props.data.map(function(project_name){
				return (
					<ProjectItem key={project_name} data={project_name}/>
				);
			});
		console.log(project_item_nodes);
		return (
			<div className="project_list">
				{project_item_nodes}
			</div>
			);
	}
});
var ProjectItem = React.createClass({
	render: function(){
		var project_data = this.props.data;
		return (
			<div className="project_item" data-project-id={project_data}>{project_data}</div>
		);
	}
});

class ProjectList extends EventEmitter{
	constructor(container, conf){
		super();
		this.container = container;
		this.conf = conf;
		this.dbHandler = window.dbHandler;
		this.render();
		this.addEventListeners();
	}
	render(){
		var self = this;
		this.dbHandler.projects.listAsync()
			.then(function(project_names){
				console.log(project_names);
				console.log("GO PROJECT LIST REACT");
				React.render(<ProjectListReact data={project_names}/>, self.container[0]);
			});
	}
	addEventListeners(){
		var self = this;
		this.container.on('click','.project_item', function(){
			var project_id = $(this).data('project-id');
			self.emit('selection', {
				project_id: project_id
			});
		});
	}
}

module.exports = ProjectList;
