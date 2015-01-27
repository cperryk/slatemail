var $ = require('jquery');
function Overlay(conf){
	var self = this;
	this.conf = conf;
	this.shade = $('<div>')
		.addClass('overlay')
		.appendTo('body')
		.fadeTo(500,1);
	this.container = $('<div>')
		.addClass('inner')
		.appendTo(this.shade);
	$('<div>')
		.addClass('btn_ex')
		.html('X')
		.appendTo(this.container)
		.click(function(){
			self.close();
		});
	$(window).on('keydown.overlay', function(e){
		if(e.keyCode === 27){ // escape key
			self.close();
		}
	});
}
Overlay.prototype = {
	close:function(){
		$(window).unbind('keydown.overlay');
		this.shade.remove();
		if(this.conf && this.conf.onClose){
			this.conf.onClose();
		}
	}
};
module.exports = Overlay;