var $ = require('jquery');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Overlay(conf){
	var self = this;
	this.conf = conf;
	this.$shade = $('<div>')
		.addClass('overlay')
		.appendTo('body')
		.fadeTo(100,1);
	this.$c = $('<div>')
		.addClass('inner')
		.appendTo(this.$shade);
	$('<div>')
		.addClass('btn_ex')
		.html('X')
		.appendTo(this.$c)
		.click(function(){
			self.close();
		});
	$(window).on('keydown.overlay', function(e){
		if(e.keyCode === 27){ // escape key
			self.close();
		}
	});
}

util.inherits(Overlay, EventEmitter);

Overlay.prototype.close = function(){
	$(window).unbind('keydown.overlay');
	this.$shade.remove();
	this.emit('close');
};
Overlay.prototype.getContainer = function(){
	return this.$c;
};
module.exports = Overlay;
