global.document = window.document;
global.navigator = window.navigator;
var $ = require('jquery');
var promisifyAll = require('es6-promisify-all');

var favicon = require('favicon');
var React = require('react');
var DbHandler = window.dbHandler;
var favicons = {};

var EventEmitter = require('events').EventEmitter;

// REACT CLASSES
var BoxViewer = React.createClass({
	getInitialState:function(){
		return {data:[]};
	},
	render:function(){
		return (
			<div className="message_list">
				<List data={this.props.data} />
				<div className="btn_print_more">
					Print more messages
				</div>
			</div>
		);
	}
});

var List = React.createClass({
	render: function(){
		var message_group_nodes = this.props.data.map(function(group_data){
			return (
				<MessageGroup key={group_data.id} data={group_data}/>
			);
		});
		return (
			<div className="message_groups">
			{message_group_nodes}
			</div>
		);
	}
});

var MessageGroup = React.createClass({
	render: function(){
		var message_nodes = this.props.data.messages.map(function(message_data){
			return (
				<Message key={message_data.mailbox+':'+message_data.uid} data={message_data}/>
			);
		});
		return (
			<div className="message_group">
				<div className="message_group_title">
					<span className="triangle">&#9660;</span>&#160;
					<span className="date_string">{this.props.data.id}</span>
				</div>
				{message_nodes}
			</div>
		);
	}
});

var Message = React.createClass({
	componentDidMount: function () {
		var node = this.getDOMNode();
		var from_domain = $(node).data('from').replace(/.*@/, "");
		getFaviconURL(from_domain, function(url){
			$(node).children('.favicon')
				.append('<img src="'+url+'"/>');
		});
		function getFaviconURL(from_domain, cb){
			if(favicons[from_domain]){
				cb(favicons[from_domain]);
			}
			else{
				favicon("http://" + from_domain, function(err, favicon_url) {
					if(!favicon_url){
						favicon_url = 'graphics/mail.png';
					}
					favicons[from_domain] = favicon_url;
					cb(favicon_url);
				});
			}
		}
	},
	render: function(){
		var mail_obj = this.props.data;
		if(!mail_obj.from){
			return (
				<div className="message"></div>
			);
		}
		var from = parseName(mail_obj.from);
		var subject = mail_obj.headers.subject;
		var preview_text = getPreviewText(mail_obj);
		var mailbox = mail_obj.mailbox;
		var unread = mail_obj.flags.indexOf('\\Seen')===-1;
		var class_name = "message"+(unread?' unread':'');
		var from_address = mail_obj.from ? mail_obj.from[0].address : false;
		var id = mail_obj.thread_id;
		return (
			<div className={class_name} data-from={from_address} data-mailbox={mail_obj.mailbox} data-uid={mail_obj.uid} id={id}>
				<div className="favicon"></div>
				<div className="from">{from}</div>
				<div className="subject">{subject}</div>
				<div className="text_preview">{preview_text}</div>
			</div>
		);
	}
});

class MessageList extends EventEmitter{
	constructor(container, conf){
		super();
		var self = this;
		this.conf = conf;
		this.dbHandler = window.dbHandler;
		this.$c = container;
		this.$c
			.on('click', '.message', function(){
				self.selectMessage($(this));
			})
			.on('click', '.message_group_title', function(){
				if($(this).hasClass('collapsed')){
					$(this)
						.removeClass('collapsed')
						.siblings()
							.show()
							.end()
						.find('.triangle')
							.html('&#9660;')
							.end();
				}
				else{
					$(this)
						.addClass('collapsed')
						.siblings()
							.hide()
							.end()
						.find('.triangle')
							.html('&#9654;')
							.end();
					}
			})
			.on('click','.btn_print_more', function(){
				self.printMore();
			});
	}
	render(groups){
		React.render(<BoxViewer data={groups}/>, this.$c[0]);
	}
	printBox(box, cb){
		console.log('-------------- printing mail --------------');
		var self = this;
		this.limitx = 0;
		this.printed_threads = [];
		this.offset = 0;
		this.messages_to_print = [];
		this.box = box;
		this.addMessagesAsync(0)
			.then(()=>{
				if(box === 'INBOX'){
					return self.dbHandler.mailboxes.getDueMailAsync()
						.then(function(due_mail){
							console.log('GOT DUE MAIL: ', due_mail);
							due_mail.forEach((mail_obj)=>{
								if(self.printed_threads.indexOf(mail_obj.thread_id)===-1){
									self.messages_to_print.push(mail_obj);
									self.printed_threads.push(mail_obj.thread_id);
								}
							});
						});
				}
				else{
					return true;
				}
			})
			.then(function(){
				console.log('reflecting messages');
				return self.reflectMessages();
			})
			.fin(function(){
				cb();
			})
			.catch(function(err){
				cb(err);
			});
	}
	printMore(){
		var self = this;
		this.offset += 150;
		this.addMessagesAsync(this.offset)
			.then(function(){
				self.reflectMessages();
			});
	}
	addMessages(offset, cb){
		var self = this;
		var d1 = new Date().getTime();
		this.dbHandler.mailboxes.select(this.box).getMessagesAsync((mail_obj)=>{
			if(mail_obj.thread_id === undefined){
				return;
			}
			if(self.printed_threads.indexOf(mail_obj.thread_id)===-1){
				self.messages_to_print.push(mail_obj);
				self.printed_threads.push(mail_obj.thread_id);
			}
			return true;
		}, 150, offset)
		.then(function(){
			var d2 = new Date().getTime();
			console.log('fetch time: '+(d2-d1));
			cb();
		})
		.catch(function(err){
			console.log(err);
		})
	};
	reflectMessages(){
			console.log('reflecting messages');
			var self = this;
			var messages = this.messages_to_print;
			var groups = (function(){
				var out = [];
				var groups_added = {};
				var group_index = -1;
				messages.forEach(function(mail_obj){
					var group_id = (function(){
						if(mail_obj.mailbox.substring(0, 'SlateMail/scheduled/'.length) === 'SlateMail/scheduled/'){
							return 'Past Due';
						}
						return self.getDateString(mail_obj.date);
					}());
					if(!(group_id in groups_added)){
						out.push({
							id: group_id,
							messages: []
						});
						groups_added[group_id] = true;
						group_index++;
					}
					out[group_index].messages.push(mail_obj);
				});
				// Puts Past Due group in front
				out.sort(function(a,b){
					if(a.id === b.id){
						return 0;
					}
					if(a.id === 'Past Due'){
						return -1;
					}
					if(b.id === 'Past Due'){
						return 1;
					}
					return 0;
					// return a.id === 'Past Due' ? -1 : 1;
				});
				return out;
			}());
			var d1 = new Date().getTime();
			console.log('MESSAGE GROUPS: ',groups);
			this.render(groups);
			var d2 = new Date().getTime();
	}
	getSelection(){
		return {mailbox: this.selected_email.data('mailbox'), uid: this.selected_email.data('uid')};
	}
	getDateString(date){
		var today = new Date();
		var days_diff = Math.abs(Math.round(daysDiff(today, date)));
		var days_of_week = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
		if(days_diff===0){
			return 'today';
		}
		if(days_diff===1){
			return 'yestersday';
		}
		if(days_diff>=2 && days_diff < 7){
			return days_of_week[date.getDay()];
		}
		if(days_diff >= 7 && days_diff < 14){
			return 'One week ago';
		}
		if(days_diff >= 14){
			return 'Two weeks ago +';
		}
		if(days_diff >= 30){
			return 'One month ago';
		}
		if(days_diff >= 60){
			return 'Two months ago';
		}
		if(days_diff >= 90){
			return 'Three months ago';
		}
		if(days_diff >= 360){
			return 'One year ago';
		}
		return false;

		function daysDiff(first, second) {
			return (second-first)/(1000*60*60*24);
		}
		return false;
	}
	selectMessageByThreadID(thread_id){
		this.selectMessage(this.$c.find('#'+thread_id));
	}
	selectMessage(ele){
		ele = $(ele);
		ele.removeClass('unread');
		this.$c.find('.selected').removeClass('selected');
		ele.addClass('selected');
		this.selected_email = ele;
		this.emit('selection', {mailbox: ele.data('mailbox'), uid: ele.data('uid')});
	}
	removeSelected(){
		var ele = this.selected_email;
		var par = ele.parent();
		ele.slideUp(function(){
			ele.remove();
			if(par.find('.message').length === 0){
				par.slideUp();
			}
		});
	}
}


function getPreviewText(mail_object){
	/**
	 * Return the preview text of a mail object. The preview text is a slice of
	 * the email's message text.
	 * @param {object} mail_object
	 */
	if(mail_object.text){
		return mail_object.text.replace(/[\n\r]/g, ' ').slice(0,125);
	}
	if(mail_object.html){
		return $(mail_object.html.replace(/<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g, '')).text().replace(/[\n\r]/g, '').trim().slice(0,125);
	}
	return false;
}

function parseName(from_header){
	var s = '';
	if(!from_header || from_header.length === 0){
		return '';
	}
	if(from_header[0].name){
		s = from_header[0].name;
		s = s.replace(/"/g,"");
		s = s.split(',');
		if(s.length>1){
			s.reverse();
			return s.join(' ');
		}
		else{
			return s;
		}
	}
	else{
		return from_header[0].address;
	}
	return '';
}

promisifyAll(MessageList.prototype);

module.exports = MessageList;
