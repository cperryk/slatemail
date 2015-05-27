/* toDo: Probably would make sense to redo this whole thing in React so it updates as new threads come in*/

var $ = require('jquery');
var fs = require('fs');
var message_css = fs.readFileSync('css/message.css','utf8');
var MailComposer = require('../mailComposer/mailComposer.js');
var exec = require('child_process').exec;
// var dbHandler = require('../modules/dbHandler.js');
var DbHandler = window.dbHandler;
var mustache = require('mustache');
var Q = require('Q');

var EventEmitter = require('events').EventEmitter;
var util = require('util');

require('datejs');

function MessageView(container, conf){
	this.dbHandler = new DbHandler();
	this.conf = conf;
	this.$c = container
		.empty()
		.addClass('message_view');
	this.$top_wrapper = $('<div>')
		.addClass('top')
		.appendTo(container);
	this.$messages_wrapper = $('<div>')
		.addClass('messages')
		.appendTo(container);
}

util.inherits(MessageView, EventEmitter);

MessageView.prototype.clear = function(){
	console.log('clearing');
	this.$c
		.removeClass('with_top');
	this.$messages_wrapper.empty();
	this.$top_wrapper
		.empty()
		.hide();
	return this;
};
MessageView.prototype.printThread = function(thread_obj){
	console.log('printing thread');
	// Prints thread therad_id. Resolves with the thread object
	this.clear();
	var self = this;
	var def = Q.defer();
	this.dbHandler.getThreadMessages(thread_obj)
		.then(function(thread_messages){
			console.log('got thread_messages', self.conf);
			self.emit('thread_messages', {
				messages: thread_messages
			});
			self.messages = thread_messages;
			self.printTop(thread_messages);
			self.printMessages(thread_messages);
		})
		.catch(function(err){
			console.log(err);
		})
		.fin(function(){
			def.resolve(thread_obj);
		});
	return def.promise;
};
MessageView.prototype.printMessages = function(mail_objs){
	console.log('printing messages');
	console.log(mail_objs);
	var self = this;
	mail_objs.sort(function(a,b){
		if(a.date > b.date){
			return -1;
		}
		else{
			return 1;
		}
	});
	mail_objs.forEach(function(mail_obj, index){
		var my_message = new Message(mail_obj, self);
		if(index===0){
			my_message.printFull();
		}
	});
	return this;
};
MessageView.prototype.printTop = function(mail_objs){
		var subject = mail_objs[0].subject;
		if(subject==='<no subject>'){
			subject = '(no subject)';
		}
		var message_count = mail_objs.length;
		var attachments_count = (function(){
			var c = 0;
			mail_objs.forEach(function(mail_obj){
				if(mail_obj.attachments){
					c += mail_obj.attachments.length;
				}
			});
			return c;
		}());

		$('<div>')
			.addClass('thread_subject')
			.html(subject)
			.appendTo(this.$top_wrapper);

		var wrapper = $('<div>')
			.addClass('thread_info');
		var message_count_wrapper = $('<span>')
			.html(message_count+' Message'+(message_count>1?'s':''))
			.appendTo(wrapper);
		if(attachments_count > 0){
			wrapper.append(', ');
			var attachment_count_wrapper = $('<span>')
				.html(attachments_count+' Attachment'+(attachments_count>1?'s':''))
				.appendTo(wrapper);
		}
		wrapper.appendTo(this.$top_wrapper);
		this.$top_wrapper
			.show();
		this.$c.addClass('with_top');
		return this;
};
MessageView.prototype.addEventListeners = function(){
	var self = this;
	$(window).keypress(function(e){
		if(e.keyCode === 114 && e.metaKey){
			self.reply();
		}
	});
	return this;
};

function Message(message_data, par){
	console.log('new message');
	var self = this;
	this.message_data = message_data;
	this.par = par;
	this.$c = $('<div>')
		.addClass('envelope')
		.appendTo(par.$messages_wrapper);

	this.printHeaders()
		.printAttachmentIcons()
		.printBody()
		.addEventListeners();
}
Message.prototype = {
	printHeaders:function(){
		var message_data = this.message_data;
		var container = this.$c;

		var d1 = new Date().getTime();

		// MUSTACHE METHOD
		var template = '<div class="headers">'+
				'<div class="from">{{from}}</div>'+
				'<div class="to">To: {{to}}</div>'+
				'<div class="date">{{date}}</div>'+
			'</div>';
		var wrapper = $(mustache.render(template, {
			from: this.getFromString(message_data),
			to: this.getToString(message_data) + (message_data.cc?' | cc: ' + this.getToString(message_data,true):''),
			date: this.parseDate(message_data.date)
		})).appendTo(container);

		this.headers_wrapper = wrapper;
		return this;
	},
	printBody:function(){
		var message_data = this.message_data;
		this.iframe_wrapper = $('<div>')
			.addClass('iframe_wrapper')
			.appendTo(this.$c);
		this.iframe = $('<iframe>')
			.attr('frameborder',0)
			.attr('scrolling','no')
			.css('height','100%')
			.appendTo(this.iframe_wrapper)
			.contents()
				.find('head')
					.html('<style>'+message_css+'</style>')
					.end();
		this.injected_wrapper = $('<div>')
			.appendTo(this.iframe.contents().find('body'));
		this.printShort();
		return this;
	},
	printAttachmentIcons:function(){
		var self = this;
		var message_data = this.message_data;
		if(!message_data.attachments || message_data.attachments.length === 0){
			return this;
		}
		var wrapper = $('<div class="message_attachments">');
		message_data.attachments.forEach(function(attachment){
			$('<div class="message_attachment">')
				.html(attachment.fileName)
				.appendTo(wrapper)
				.click(function(){
					var path = ['attachments', self.message_data.mailbox, self.message_data.uid, attachment.fileName].join('/');
					var command = 'open '+path.replace(/ /g,'\\ ');
					exec(command);
				});
		});
		wrapper.appendTo(this.$c);
		return this;
	},
	getToString: function(message_data, cc){
		var self = this;
		var to = message_data.to;
		if(cc){
			to = message_data.cc;
		}
		var arr = [];
		for(var i=0;i<to.length;i++){
			var rec = to[i];
			if(rec.name){
				arr.push(this.parseName(rec.name));
			}
			else{
				arr.push(rec.address);
			}
			if(i===5 && to.length > 6){
				arr.push('and '+(to.length-i-1)+' others');
				break;
			}
		}
		return arr.join(', ');
	},
	resizeFrame:function(){
		var height = this.injected_wrapper.outerHeight();
		this.iframe_wrapper.css('height',height);
		return this;
	},
	getFromString:function(message_data){
		if (message_data.from) {
			return this.parseName(message_data.from[0].name || message_data.from[0].address);
		}
		if (message_data.headers.sender){
			return message_data.headers.sender;
		}
		return false;
	},
	parseName:function(s){
		s = s.replace(/"/g,"");
		s = s.split(',');
		if(s.length>1){
			s.reverse();
			return s.join(' ');
		}
		return s[0];
	},
	parseDate:function(date){
		var d = new Date(date);
		return d.toDateString();
	},
	select:function(){
		if(this.par.selected_message){
			this.par.selected_message.deselect();
		}
		this.$c.addClass('selected');
		this.par.selected_message = this;
	},
	deselect:function(){
		if(this.par.selected_message){
			delete this.par.selected_message;
		}
		this.$c.removeClass('selected');
	},
	printActionBtns:function(){
		var self = this;

		var btns = $('<p>')
			.addClass('action_btns')
			.hide()
			.appendTo(this.headers_wrapper)
			.fadeIn(100);

		var inner_wrapper = $('<div>')
			.addClass('action_btns_wrapper')
			.appendTo(btns);

		$('<div class="action_btn btn_reply">Reply</div>')
			.appendTo(inner_wrapper)
			.click(function(){
				self.reply();
			});

		$('<div class="action_btn btn_reply_all">Reply All</div>')
			.appendTo(inner_wrapper)
			.click(function(){
				self.replyAll();
			});

		$('<div class="action_btn btn_forward">Forward</div>')
			.appendTo(inner_wrapper)
			.click(function(){
				self.forward();
			});

		this.action_btns = btns;
	},
	removeActionBtns:function(){
		if(this.action_btns){
			this.action_btns.remove();
		}
	},
	addEventListeners:function(){
		var self = this;
		this.$c.find('.headers')
			.click(function(e){
				if($(e.target).hasClass('action_btn')===false){
					self.togglePrintState();
				}
			});
		this.$c.hover(function(){
			self.printActionBtns();
		}, function(){
			self.removeActionBtns();
		});
		this.injected_wrapper.on('click','a',function(e){
			e.preventDefault();
			var url = $(this).attr('href');
			var command = 'open "' + url + '"';
			console.log(command);
			exec(command);
		});
	},
	getReplyConf:function(){
		var self = this;
		var message_data = this.message_data;
		var body = (function(){
			var wrapper = $('<div><br/>');
			var date_string = (function(){
				var date = new Date(message_data.date);
				var months = ['Jan.','Feb.','March','April','May','June','July','Aug.','Oct.','Nov.','Dec.'];
				var s = date.toString('MMM. dd')+', at '+date.toString('hh:mm tt');
				return s;
			}());
			var from_string =  self.getFromString(message_data);
			var block_quote = $('<blockquote type="cite">')
				.html('<div>On '+date_string+', '+from_string+' wrote:</div>'+
					(message_data.html || message_data.text.replace(/\n/g, '<br/>')))
				.appendTo(wrapper);
			return wrapper.html();
		}());
		var conf = {
			to: message_data.from[0].address,
			subject: message_data.subject,
			in_reply_to: message_data.messageId,
			body:body
		};
		return conf;
	},
	reply:function(){
		var conf = this.getReplyConf();
		console.log('making new mail composer', conf);
		new MailComposer(null, conf);
	},
	replyAll:function(){
		var self = this;
		var conf = this.getReplyConf();
		console.log('replied all', conf);
		conf.cc = (function(){
			var message_data = self.message_data;
			var s = '';
			if(message_data.to){
				s += self.getPeopleString(message_data.to);
			}
			if(message_data.cc){
				s += ', '+self.getPeopleString(message_data.cc);
			}
			return s;
		}());
		new MailComposer(null, conf);
	},
	getPeopleList:function(arr){
		var self = this;
		var out = [];
		arr.forEach(function(ent){
			out.push(self.getPersonString(ent));
		});
		return out;
	},
	getPeopleString:function(arr){
		var out = this.getPeopleList(arr);
		return out.join(', ');
	},
	getPersonString:function(user){
		console.log('getting person string');
		var s = '';
		if(user.name){
			s += '"'+user.name+'"';
			if(user.address){
				s += '&lt;'+user.address+'&gt;';
			}
		}
		else{
			s += user.address;
		}
		console.log('returning '+s);
		return s;
	},
	forward:function(){
		var out;
		var message_data = this.message_data;
		var stage = $('<div>');
		if(message_data.html){
			var html = message_data.html;
			stage.html(html);
			$('<p>')
				.html('From: '+this.getPeopleString(message_data.from))
				.appendTo(stage);
			$('<p>')
				.html('To: '+this.getPeopleString(message_data.to))
				.appendTo(stage);
			if (message_data.cc) {
				$('<p>')
					.html('CC: ' + this.getPeopleString(message_data.cc))
					.appendTo(stage);
			}
		}
		else{
			var text = message_data.text;
			out = text;
		}
		var conf = {
			body:stage.html(),
			subject:'FW: '+message_data.subject
		};
		new MailComposer(null, conf);
	},
	togglePrintState:function(){
		if(this.printed_full === true){
			this.printShort();
		}
		else{
			this.printFull();
		}
	},
	printFull:function(){
		var html = this.message_data.html || this.message_data.text;
		html = html.replace(/<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g, '');
		this.injected_wrapper.html(html);
		this.resizeFrame();
		this.printed_full = true;
	},
	printShort: function(){
		var self = this;
		var html = (function(){
			var message_data = self.message_data;
			var html = message_data.html ?
				message_data.html.replace(/<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g, '') :
				message_data.text.replace(/(?:\r\n|\r|\n)/g, ' ');
			var stage = $('<div>')
				.html(html)
				.find('div')
					.each(function(){
						if($(this).css('border-top-style') === 'solid'){
							$(this)
								.nextAll()
									.remove()
									.end()
								.remove();
						}
					})
					.end()
				.find('style')
					.remove()
					.end();
			var text = stage.text().replace(/\s+/g," ");
			var trimmed = text.substring(0, Math.min(200, text.length));
			if(text.length > 200){
				trimmed += '...';
			}
			return trimmed;
		}());
		this.injected_wrapper.html(html);
		this.resizeFrame();
		this.printed_full = false;
	},
};

module.exports = MessageView;
