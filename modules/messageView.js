// jshint esnext: true
/* toDo: Probably would make sense to redo this whole thing in React so it updates as new threads come in*/

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var $ = require('jquery');
var fs = require('fs');
var message_css = fs.readFileSync('css/message.css', 'utf8');
var MailComposer = require('../mailComposer/mailComposer.js');
var exec = require('child_process').exec;
// var dbHandler = require('../modules/dbHandler.js');
var DbHandler = window.dbHandler;
var mustache = require('mustache');
var promisifyAll = require('es6-promisify-all');

var EventEmitter = require('events').EventEmitter;

require('datejs');

var MessageView = (function (_EventEmitter) {
	_inherits(MessageView, _EventEmitter);

	function MessageView(container, conf) {
		_classCallCheck(this, MessageView);

		_get(Object.getPrototypeOf(MessageView.prototype), 'constructor', this).call(this);
		this.dbHandler = new DbHandler();
		this.conf = conf;
		this.$c = container.empty().addClass('message_view');
		this.$top_wrapper = $('<div>').addClass('top').appendTo(container);
		this.$messages_wrapper = $('<div>').addClass('messages').appendTo(container);
	}

	_createClass(MessageView, [{
		key: 'clear',
		value: function clear() {
			console.log('clearing');
			this.$c.removeClass('with_top');
			this.$messages_wrapper.empty();
			this.$top_wrapper.empty().hide();
			return this;
		}
	}, {
		key: 'printThread',
		value: function printThread(thread_obj, cb) {
			var _this = this;

			console.log('printing thread ', thread_obj);
			// Prints thread therad_id. Resolves with the thread object
			this.clear();
			this.dbHandler.getThreadMessagesAsync(thread_obj).then(function (thread_messages) {
				console.log('got thread_messages', self.conf);
				_this.emit('thread_messages', {
					messages: thread_messages
				});
				_this.messages = thread_messages;
				_this.printTop(thread_messages);
				_this.printMessages(thread_messages);
			})['catch'](function (err) {
				console.log(err);
			})['finally'](function () {
				cb(null, thread_obj);
			});
		}
	}, {
		key: 'printMessages',
		value: function printMessages(mail_objs) {
			console.log('printing messages');
			console.log(mail_objs);
			var self = this;
			mail_objs.sort(function (a, b) {
				if (a.date > b.date) {
					return -1;
				} else {
					return 1;
				}
			});
			mail_objs.forEach(function (mail_obj, index) {
				var my_message = new Message(mail_obj, self);
				if (index === 0) {
					my_message.printFull();
				}
			});
			return this;
		}
	}, {
		key: 'printTop',
		value: function printTop(mail_objs) {
			var subject = mail_objs[0].subject;
			if (subject === '<no subject>') {
				subject = '(no subject)';
			}
			var message_count = mail_objs.length;
			var attachments_count = (function () {
				var c = 0;
				mail_objs.forEach(function (mail_obj) {
					if (mail_obj.attachments) {
						c += mail_obj.attachments.length;
					}
				});
				return c;
			})();

			$('<div>').addClass('thread_subject').html(subject).appendTo(this.$top_wrapper);

			var wrapper = $('<div>').addClass('thread_info');
			var message_count_wrapper = $('<span>').html(message_count + ' Message' + (message_count > 1 ? 's' : '')).appendTo(wrapper);
			if (attachments_count > 0) {
				wrapper.append(', ');
				var attachment_count_wrapper = $('<span>').html(attachments_count + ' Attachment' + (attachments_count > 1 ? 's' : '')).appendTo(wrapper);
			}
			wrapper.appendTo(this.$top_wrapper);
			this.$top_wrapper.show();
			this.$c.addClass('with_top');
			return this;
		}
	}, {
		key: 'addEventListeners',
		value: function addEventListeners() {
			var _this2 = this;

			$(window).keypress(function (e) {
				if (e.keyCode === 114 && e.metaKey) {
					_this2.reply();
				}
			});
			return this;
		}
	}]);

	return MessageView;
})(EventEmitter);

function Message(message_data, par) {
	console.log('new message');
	var self = this;
	this.message_data = message_data;
	this.par = par;
	this.$c = $('<div>').addClass('envelope').appendTo(par.$messages_wrapper);

	this.printHeaders().printAttachmentIcons().printBody().addEventListeners();
}
Message.prototype = {
	printHeaders: function printHeaders() {
		var message_data = this.message_data;
		var container = this.$c;

		var d1 = new Date().getTime();

		// MUSTACHE METHOD
		var template = '<div class="headers">' + '<div class="from">{{from}}</div>' + '<div class="to">To: {{to}}</div>' + '<div class="date">{{date}}</div>' + '</div>';
		var wrapper = $(mustache.render(template, {
			from: this.getFromString(message_data),
			to: this.getToString(message_data) + (message_data.cc ? ' | cc: ' + this.getToString(message_data, true) : ''),
			date: this.parseDate(message_data.date)
		})).appendTo(container);

		this.headers_wrapper = wrapper;
		return this;
	},
	printBody: function printBody() {
		var message_data = this.message_data;
		this.iframe_wrapper = $('<div>').addClass('iframe_wrapper').appendTo(this.$c);
		this.iframe = $('<iframe>').attr('frameborder', 0).attr('scrolling', 'no').css('height', '100%').appendTo(this.iframe_wrapper).contents().find('head').html('<style>' + message_css + '</style>').end();
		this.injected_wrapper = $('<div>').appendTo(this.iframe.contents().find('body'));
		this.printShort();
		return this;
	},
	printAttachmentIcons: function printAttachmentIcons() {
		var self = this;
		var message_data = this.message_data;
		if (!message_data.attachments || message_data.attachments.length === 0) {
			return this;
		}
		var wrapper = $('<div class="message_attachments">');
		message_data.attachments.forEach(function (attachment) {
			$('<div class="message_attachment">').html(attachment.fileName).appendTo(wrapper).click(function () {
				var path = ['attachments', self.message_data.mailbox, self.message_data.uid, attachment.fileName].join('/');
				var command = 'open ' + path.replace(/ /g, '\\ ');
				exec(command);
			});
		});
		wrapper.appendTo(this.$c);
		return this;
	},
	getToString: function getToString(message_data, cc) {
		var self = this;
		var to = message_data.to;
		if (cc) {
			to = message_data.cc;
		}
		var arr = [];
		for (var i = 0; i < to.length; i++) {
			var rec = to[i];
			if (rec.name) {
				arr.push(this.parseName(rec.name));
			} else {
				arr.push(rec.address);
			}
			if (i === 5 && to.length > 6) {
				arr.push('and ' + (to.length - i - 1) + ' others');
				break;
			}
		}
		return arr.join(', ');
	},
	resizeFrame: function resizeFrame() {
		var height = this.injected_wrapper.outerHeight();
		this.iframe_wrapper.css('height', height);
		return this;
	},
	getFromString: function getFromString(message_data) {
		if (message_data.from) {
			return this.parseName(message_data.from[0].name || message_data.from[0].address);
		}
		if (message_data.headers.sender) {
			return message_data.headers.sender;
		}
		return false;
	},
	parseName: function parseName(s) {
		s = s.replace(/"/g, '');
		s = s.split(',');
		if (s.length > 1) {
			s.reverse();
			return s.join(' ');
		}
		return s[0];
	},
	parseDate: function parseDate(date) {
		var d = new Date(date);
		return d.toDateString();
	},
	select: function select() {
		if (this.par.selected_message) {
			this.par.selected_message.deselect();
		}
		this.$c.addClass('selected');
		this.par.selected_message = this;
	},
	deselect: function deselect() {
		if (this.par.selected_message) {
			delete this.par.selected_message;
		}
		this.$c.removeClass('selected');
	},
	printActionBtns: function printActionBtns() {
		var self = this;

		var btns = $('<p>').addClass('action_btns').hide().appendTo(this.headers_wrapper).fadeIn(100);

		var inner_wrapper = $('<div>').addClass('action_btns_wrapper').appendTo(btns);

		$('<div class="action_btn btn_reply">Reply</div>').appendTo(inner_wrapper).click(function () {
			self.reply();
		});

		$('<div class="action_btn btn_reply_all">Reply All</div>').appendTo(inner_wrapper).click(function () {
			self.replyAll();
		});

		$('<div class="action_btn btn_forward">Forward</div>').appendTo(inner_wrapper).click(function () {
			self.forward();
		});

		this.action_btns = btns;
	},
	removeActionBtns: function removeActionBtns() {
		if (this.action_btns) {
			this.action_btns.remove();
		}
	},
	addEventListeners: function addEventListeners() {
		var self = this;
		this.$c.find('.headers').click(function (e) {
			if ($(e.target).hasClass('action_btn') === false) {
				self.togglePrintState();
			}
		});
		this.$c.hover(function () {
			self.printActionBtns();
		}, function () {
			self.removeActionBtns();
		});
		this.injected_wrapper.on('click', 'a', function (e) {
			e.preventDefault();
			var url = $(this).attr('href');
			var command = 'open "' + url + '"';
			console.log(command);
			exec(command);
		});
	},
	getReplyConf: function getReplyConf() {
		var self = this;
		var message_data = this.message_data;
		var body = (function () {
			var wrapper = $('<div><br/>');
			var date_string = (function () {
				var date = new Date(message_data.date);
				var months = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Oct.', 'Nov.', 'Dec.'];
				var s = date.toString('MMM. dd') + ', at ' + date.toString('hh:mm tt');
				return s;
			})();
			var from_string = self.getFromString(message_data);
			var block_quote = $('<blockquote type="cite">').html('<div>On ' + date_string + ', ' + from_string + ' wrote:</div>' + (message_data.html || message_data.text.replace(/\n/g, '<br/>'))).appendTo(wrapper);
			return wrapper.html();
		})();
		var conf = {
			to: message_data.from[0].address,
			subject: message_data.subject,
			in_reply_to: message_data.messageId,
			body: body
		};
		return conf;
	},
	reply: function reply() {
		var conf = this.getReplyConf();
		console.log('making new mail composer', conf);
		new MailComposer(null, conf);
	},
	replyAll: function replyAll() {
		var self = this;
		var conf = this.getReplyConf();
		console.log('replied all', conf);
		conf.cc = (function () {
			var message_data = self.message_data;
			var s = '';
			if (message_data.to) {
				s += self.getPeopleString(message_data.to);
			}
			if (message_data.cc) {
				s += ', ' + self.getPeopleString(message_data.cc);
			}
			return s;
		})();
		new MailComposer(null, conf);
	},
	getPeopleList: function getPeopleList(arr) {
		var self = this;
		var out = [];
		arr.forEach(function (ent) {
			out.push(self.getPersonString(ent));
		});
		return out;
	},
	getPeopleString: function getPeopleString(arr) {
		var out = this.getPeopleList(arr);
		return out.join(', ');
	},
	getPersonString: function getPersonString(user) {
		console.log('getting person string');
		var s = '';
		if (user.name) {
			s += '"' + user.name + '"';
			if (user.address) {
				s += '&lt;' + user.address + '&gt;';
			}
		} else {
			s += user.address;
		}
		console.log('returning ' + s);
		return s;
	},
	forward: function forward() {
		var out;
		var message_data = this.message_data;
		var stage = $('<div>');
		if (message_data.html) {
			var html = message_data.html;
			stage.html(html);
			$('<p>').html('From: ' + this.getPeopleString(message_data.from)).appendTo(stage);
			$('<p>').html('To: ' + this.getPeopleString(message_data.to)).appendTo(stage);
			if (message_data.cc) {
				$('<p>').html('CC: ' + this.getPeopleString(message_data.cc)).appendTo(stage);
			}
		} else {
			var text = message_data.text;
			out = text;
		}
		var conf = {
			body: stage.html(),
			subject: 'FW: ' + message_data.subject
		};
		new MailComposer(null, conf);
	},
	togglePrintState: function togglePrintState() {
		if (this.printed_full === true) {
			this.printShort();
		} else {
			this.printFull();
		}
	},
	printFull: function printFull() {
		var html = this.message_data.html || this.message_data.text;
		html = html.replace(/<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g, '');
		this.injected_wrapper.html(html);
		this.resizeFrame();
		this.printed_full = true;
	},
	printShort: function printShort() {
		var self = this;
		var html = (function () {
			var message_data = self.message_data;
			var html = message_data.html ? message_data.html.replace(/<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g, '') : message_data.text.replace(/(?:\r\n|\r|\n)/g, ' ');
			var stage = $('<div>').html(html).find('div').each(function () {
				if ($(this).css('border-top-style') === 'solid') {
					$(this).nextAll().remove().end().remove();
				}
			}).end().find('style').remove().end();
			var text = stage.text().replace(/\s+/g, ' ');
			var trimmed = text.substring(0, Math.min(200, text.length));
			if (text.length > 200) {
				trimmed += '...';
			}
			return trimmed;
		})();
		this.injected_wrapper.html(html);
		this.resizeFrame();
		this.printed_full = false;
	}
};

promisifyAll(MessageView);

module.exports = MessageView;