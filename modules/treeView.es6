// jshint esnext: true

var $ = require('jquery');
var EventEmitter = require('events').EventEmitter;
var promisifyAll = require('es6-promisify-all');

class TreeView extends EventEmitter{
	constructor(container, conf){
		super();
		var self = this;
		this.dbHandler = window.dbHandler;
		this.container = container
			.addClass('tree_view')
			.on('click','.folder_label', function(e){
				e.stopPropagation();
				var box_path = self.getBoxPath($(this).parent());
				self.emit('selection', {box_path: box_path});
			})
			.on('click','.folder_icon', function(e){
				$(this).parent().toggleClass('collapsed');
			});
		return this;
	}
	printTree(tree, cb){
		console.log('PRINTING TREE');
		this.dbHandler.mailboxes.getTreeAsync()
			.then((tree)=>{
				console.log('TREE', tree);
				var html = this.getTreeHTML(tree);
				this.container
					.html(html)
					.find('.tree_view_item').each(function(){
						var box_path = this.getBoxPath($(this));
						$(this).attr('data-box-path', box_path);
						if($(this).children('ul').children('.tree_view_item').length > 0){
							$(this).addClass('has_children');
						}
					});
				this.reflectActiveMailbox('INBOX');
			})
			.then(function(){
				cb();
			})
			.catch(function(err){
				cb(err);
			});
	}
	getTreeHTML(tree){
		var s = '';
		printSubTree(tree);
		return s;
		function printSubTree(subtree){
			s += '<ul>';
			for(var i in subtree){
				if(subtree.hasOwnProperty(i)){
					s += '<li class="tree_view_item" data-box="'+i+'">'+
					'<div class="folder_icon"></div>'+
					'<span class="folder_label">'+i+'</span>';
					printSubTree(subtree[i]);
					s += '</li>';
				}
			}
			s += '</ul>';
		}
	}
	getBoxPath(tree_view_item){
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
	}
	reflectActiveMailbox(box_path){
		console.log('Tree View - Reflect active mailbox: '+box_path);
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
}

promisifyAll(TreeView.prototype);

module.exports = TreeView;
