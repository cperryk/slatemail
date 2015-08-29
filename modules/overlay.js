// jshint esnext: true

var $ = require('jquery');
var EventEmitter = require('events').EventEmitter;

class Overlay extends EventEmitter{
	constructor(conf){
		super();
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
			.click(()=>{
				this.close();
			});
		$(window).on('keydown.overlay', (e)=>{
			if(e.keyCode === 27){ // escape key
				this.close();
			}
		});
	}
	close(){
		$(window).unbind('keydown.overlay');
		this.$shade.remove();
		this.emit('close');
	}
	getContainer(){
		return this.$c;
	}
}

module.exports = Overlay;
