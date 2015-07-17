global.document = window.document;
global.navigator = window.navigator;

var $ = require('jquery');
var EventEmitter = require('events').EventEmitter;
var util = require('util');


function Scheduler(container, conf){
	var self = this;
	console.log(container[0]);
	var template = '<div class="scheduler">'+
		'<p>What day would like this email to pop back up in your inbox?</p>'+
		'<input type="text" id="datepicker"/>'+
		'</div>';
	this.container = $(template)
		.appendTo(container);
	var input = this.container
		.find('input')
		.datepicker({
			onSelect:function(date_text, obj){
				var date = input.datepicker('getDate');
				self.emit('selection', {data: date});
			}
		})
		.focus();
	setTimeout(function(){
		input.val('');
	},1);
}

util.inherits(Scheduler, EventEmitter);

module.exports = Scheduler;
