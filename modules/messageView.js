var $ = require('jquery');
var fs = require('fs');
var message_css = fs.readFileSync('css/message.css','utf8');
var MailComposer = require('../mailComposer/mailComposer.js');
var exec = require('child_process').exec;
var dbHandler = require('../modules/dbHandler.js');

function MessageView(container, messages){
	console.log(messages);
	this.container = container
		.empty()
		.addClass('message_view');
	this.top_wrapper = $('<div>')
		.addClass('top')
		.appendTo(container);
	this.messages_wrapper = $('<div>')
		.addClass('messages')
		.appendTo(container);
	this.messages = messages;
	this.printTop(messages)
		.printMessages(messages)
		.addEventListeners();
}

MessageView.prototype = {
	clear:function(){
		this.container
			.removeClass('with_top');
		this.messages_wrapper.empty();
		this.top_wrapper
			.hide();
		return this;
	},
	printMessages: function(mail_objs){
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
			var message = new Message(mail_obj, self);
			// if(index===0){
			//   message.select();
			// }
		});
		return this;
	},
	printTop: function(mail_objs){
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
			.appendTo(this.top_wrapper);

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
		wrapper.appendTo(this.top_wrapper);
		// var wrapper = $('<div>')
		//   .appendTo(this.top_wrapper);
		// this.btn_reply = $('<span>')
		//   .addClass('btn_reply')
		//   .html('reply all')
		//   .appendTo(wrapper);
		// this.btn_forward = $('<span>')
		//   .addClass('btn_forward')
		//   .html('forward')
		//   .appendTo(wrapper);
		this.top_wrapper
			.show();
		this.container.addClass('with_top');
		return this;
	},
	addEventListeners:function(){
		var self = this;
		$(window).keypress(function(e){
			if(e.keyCode === 114 && e.metaKey){
				self.reply();
			}
		});
		return this;  
	}
};

function Message(message_data, par){
	console.log('new message');
	var self = this;
	this.message_data = message_data;
	this.par = par;
	this.container = $('<div>')
		.addClass('envelope')
		.appendTo(par.messages_wrapper);


	$('<div>')
		.addClass('btn_reveal')
		.appendTo(this.container)
		.html('reveal')
		.click(function(){
			$(this).remove();
			self.reveal();
		});

	this.printHeaders();
	this.printAttachmentIcons();
	this.printBody();
	this.resizeFrame();
	this.addEventListeners();
}
Message.prototype = {
	printHeaders:function(){
		var message_data = this.message_data;
		var container = this.container;

		var wrapper = $('<div>')
			.addClass('headers')
			.appendTo(container);

		$('<p>')
			.addClass('from')
			.html(this.getFromString(message_data))
			.appendTo(wrapper);

		$('<p>')
			.addClass('to')
			.html('To: '+this.getToString(message_data) + 
				(message_data.cc?' | cc: ' + this.getToString(message_data,true):''))
			.appendTo(wrapper);

		$('<div>')
			.addClass('date')
			.html(this.parseDate(message_data.date))
			.appendTo(container);

		this.headers_wrapper = wrapper;

		return this;
	},
	printBody:function(){
		var message_data = this.message_data;
		this.iframe_wrapper = $('<div>')
			.addClass('iframe_wrapper')
			.appendTo(this.container);
		var iframe = $('<iframe>')
			.attr('frameborder',0)
			.attr('scrolling','no')
			.css('height','100%')
			.appendTo(this.iframe_wrapper)
			.contents()
				.find('head')
					.html('<style>'+message_css+'</style>')
					.end();

		this.injected_wrapper = $('<div>')
			.html(this.prepHTML(message_data))
			.appendTo(iframe.contents().find('body'));
		return this;
	},
	printAttachmentIcons:function(){
		var self = this;
		var message_data = this.message_data;
		if(!message_data.attachments || message_data.attachments.length === 0){
			return;
		}
		var wrapper = $('<div>')
			.addClass('message_attachments');
		message_data.attachments.forEach(function(attachment){
			console.log(message_data);
			$('<div>')
				.addClass('message_attachment')
				.html(attachment.fileName)
				.appendTo(wrapper)
				.click(function(){
					var path = ['attachments', self.message_data.mailbox, self.message_data.uid, attachment.fileName].join('/');
					var command = 'open '+path.replace(/ /g,'\\ ');
					exec(command);
				});
		});
		wrapper.appendTo(this.container);
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
	prepHTML: function(message_data){
		var btn_show = $('<span>')
			.addClass('btn_show')
			.html('...');
		var html = message_data.html || message_data.text.replace(/(?:\r\n|\r|\n)/g, '<br/>');
		var stage = $('<div>')
			.hide()
			.html(html)
			//.find('.gmail_quote,#OLK_SRC_BODY_SECTION,#signature,blockquote,#message-coda,#Signature')
			.find('#signature,#message-coda,#Signature,blockquote,#OLK_SRC_BODY_SECTION')
				.parent()
					.append(btn_show)
					.end()
				.remove()
				.end();

		stage.find('a')
			.click(function(e){
				e.preventDefault();
				var url = $(this).attr('href');
				var command = 'open ' + url;
				console.log(command);
				exec(command);
			});
		stage
			.find('.WordSection1')
				.find('div')
					.nextAll()
						.remove()
						.end()
					.empty()
					.append(btn_show);
		// Quoted messages are sometimes indicated with a tag of the sender's name, e.g. <chris.kirk@slate.com>
		stage.find('*').each(function(){
			if($(this).prop('tagName').indexOf('@')>-1){
				$(this).html(btn_show);
			}
		});

		// Often quoted messages are separated from the new message by horizontal rules
		stage
			.find('hr')
				.nextAll()
					.remove()
					.end()
				.parent()
					.append(btn_show)
					.end()
				.remove()
				.end();

		stage
			.find('img')
				.each(function(){
					// parse inline images
					if(!message_data.attachments){
						return;
					}
					var src = $(this).attr('src');
					if(src.indexOf('cid:')!==0){
						return;
					}
					var content_id = src.replace('cid:','');
					var attachments = message_data.attachments;
					for(var i=0; i<attachments.length; i++){
						var attachment = attachments[i];
						if(attachment.contentId === content_id){
							var file_name = attachment.fileName;
							var file_path = ['attachments', message_data.mailbox, message_data.uid,file_name].join('/');
							$(this).attr('src',file_path);
							break;
						}
					}
				});
		return stage.html();
	},
	select:function(){
		if(this.par.selected_message){
			this.par.selected_message.deselect();
		}
		this.container.addClass('selected');
		this.par.selected_message = this;
	},
	deselect:function(){
		if(this.par.selected_message){
			delete this.par.selected_message;
		}
		this.container.removeClass('selected');
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

		$('<div>')
			.addClass('action_btn btn_reply')
			.html('Reply')
			.appendTo(inner_wrapper)
			.click(function(){
				self.reply();
			});

		$('<div>')
			.addClass('action_btn btn_reply_all')
			.html('Reply All')
			.appendTo(inner_wrapper)
			.click(function(){
				self.replyAll();
			});

		$('<div>')
			.addClass('action_btn btn_forward')
			.html('Forward')
			.appendTo(inner_wrapper)
			.click(function(){
				self.forward();
			});

		// $('<div>')
		//   .addClass('action_btn btn_tag')
		//   .html('Tag')
		//   .appendTo(inner_wrapper)
		//   .click(function(){
		//     self.tag();
		//   });

		this.action_btns = btns;
	},
	removeActionBtns:function(){
		if(this.action_btns){
			this.action_btns.remove();
		}
	},
	addEventListeners:function(){
		var self = this;
		this.container.hover(function(){
			self.printActionBtns();
		}, function(){
			self.removeActionBtns();
		});
	},
	getReplyConf:function(){
		var self = this;
		var message_data = this.message_data;
		var body = (function(){
			var container = $('<div>')
				.html(message_data.html);
			var headers = $('<div>')
				.append([
					$('<br/>'),
					
					$('<hr>'),
					$('<p>').html('<b>From:</b> '+message_data.from[0].name),
					$('<p>').html('<b>Sent:</b> '+message_data.date),
					$('<p>').html('<b>To:</b> '+self.getToString(message_data)),
					$('<p>').html('<b>Subject:</b> '+message_data.subject),
					$('<p>').html(message_data.html || message_data.text)
					// $('<p>').html('On Mon, Oct 6, 2014 at 9:01 AM, Jaeah Lee <jaeah.j.lee@gmail.com> wrote:')
				]);
			container.prepend(headers.html());
			return container.html();
		}());
		var conf = {
			to: message_data.from[0].address,
			subject: message_data.subject,
			in_reply_to: message_data.messageId,
			body:body
		};
		console.log(conf);
		return conf;
	},
	reply:function(){
		var conf = this.getReplyConf();
		new MailComposer(conf);
	},
	replyAll:function(){
		var self = this;
		var conf = this.getReplyConf();
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
		new MailComposer(conf);
	},
	getPeopleList:function(arr){
		console.log('getting people list');
		console.log(arr);
		var self = this;
		var out = [];
		arr.forEach(function(ent){
			out.push(self.getPersonString(ent));
		});
		console.log('returning people list');
		console.log(out);
		return out;
	},
	getPeopleString:function(arr){
		console.log('get people string');
		console.log(arr);
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
		new MailComposer(conf);
	},
	tag:function(){
		var tag = window.prompt('tag');
	},
	reveal:function(){
		this.injected_wrapper.html(this.message_data.html || this.message_data.text);
		this.resizeFrame();
	}
};

module.exports = MessageView;
