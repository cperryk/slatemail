global.document = window.document;
global.navigator = window.navigator;

var $ = require('jquery');
// var dbHandler = require('./dbHandler');
var mustache = require('mustache');
var Typeahead = require('typeahead');

function ProjectSelector(target_container, conf){
	var self = this;
	this.conf = conf;
	this.dbHandler = new window.dbHandler();
	this.container = $('<div>')
		.addClass('project_selector')
		.appendTo(target_container);
	var container = this.container;
	this.dbHandler.connect()
		.then(function(){
			return self.dbHandler.listProjects();
		})
		.then(function(projects){
			var template =
				'<h1>Enter a project</h1>'+
				'<input/>'+
				// '<h2>Recent Projects</h2>'+
				'<ul class="project_list">'+
					'{{#.}}'+
						'<li class="recent_project" data-project-id="{{.}}">{{.}}</li>'+
					'{{/.}}'+
				'</ul>'+
				'<button class="btn_submit">Submit</button>';
			container.html(mustache.render(template, projects));
			var input = container.find('input');
			var typeahead = input
					.typeahead({
						hint: true,
						highlight: true,
						minLength: 1
					}, {
						name: 'states',
		  				displayKey: 'value',
						source: substringMatcher(projects)
					});
			container
				.on('click', '.recent_project', function(){
					self.selectProject($(this).data('project-id'));
				})
				.find('.btn_submit')
					.click(function(){
						self.selectProject(input.typeahead('val'));
					});
			input.focus();
			$(window).on('keydown.projectSelector', function(e){
				if(e.keyCode === 13){
					self.selectProject(input.typeahead('val'));
				}
			});
		})
		.catch(function(err){
			console.log(err);
		});
}
ProjectSelector.prototype = {
	selectProject: function(project_id){
		if(!(typeof project_id === 'string' && project_id !== '')){
			return;
		}
		console.log(project_id+' selected');
		$(window).unbind('keydown.projectSelector');
		if(this.conf && this.conf.onSelection){
			this.conf.onSelection(project_id);
		}
	}
};

var substringMatcher = function(strs) {
  return function findMatches(q, cb) {
    var matches, substrRegex;
 
    // an array that will be populated with substring matches
    matches = [];
 
    // regex used to determine if a string contains the substring `q`
    substrRegex = new RegExp(q, 'i');
 
    // iterate through the pool of strings and for any string that
    // contains the substring `q`, add it to the `matches` array
    $.each(strs, function(i, str) {
      if (substrRegex.test(str)) {
        // the typeahead jQuery plugin expects suggestions to a
        // JavaScript object, refer to typeahead docs for more info
        matches.push({ value: str });
      }
    });
 
    cb(matches);
  };
};

module.exports = ProjectSelector;