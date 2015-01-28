var $ = require('jquery');
var dbHandler = window.dbHandler;
// var dbHandler = require('../modules/dbHandler.js');

function TreeView(container, conf){
	var self = this;
	this.container = container
		.addClass('tree_view')
		.on('click','li', function(e){
			e.stopPropagation();
			var box_path = self.getBoxPath($(this));
			if(conf.onSelection){
				conf.onSelection(box_path);
				// self.reflectActiveMailbox(box_path);
			}
		});
	dbHandler.getMailboxTree()
		.then(function(tree){
			self.printTree(tree);
			self.reflectActiveMailbox('INBOX');
		});
}
TreeView.prototype = {
	printTree: function(tree){
		var s = '';
		var self = this;
		printSubTree(tree);
		function printSubTree(subtree){
			s += '<ul>';
			for(var i in subtree){
				if(subtree.hasOwnProperty(i)){
					s += '<li class="tree_view_item" data-box="'+i+'">'+
					'<img class="folder_icon" src="graphics/folder_icon.png"/>'+
					'<span>'+i+'</span>';
					printSubTree(subtree[i]);
					s += '</li>';
				}
			}
			s += '</ul>';
		}
		this.container.html(s);
		this.container.find('.tree_view_item').each(function(){
			var box_path = self.getBoxPath($(this));
			$(this).attr('data-box-path', box_path);
		});
	},
	getBoxPath: function(tree_view_item){
		var box_path = tree_view_item.data('box');
		var pars = tree_view_item.parents('li');
		for(var i=0;i<pars.length;i++){
			var par = $(pars[i]);
			if(!par.hasClass('tree_view_item')){
				break;
			}
			box_path = par.data('box') + '/' + box_path;
		}
		return box_path;
	},
	reflectActiveMailbox: function(box_path){
		this.container.find('.selected')
			.removeClass('selected');
		var items = this.container.find('.tree_view_item');
		for(var i=0;i<items.length;i++){
			var item = $(items[i]);
			if(item.data('box-path') === box_path){
				item.addClass('selected');
				break;
			}
		}
	}
};
module.exports = TreeView;