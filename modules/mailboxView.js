var $ = require('jquery');
var favicon = require('favicon');
var favicon_urls = {};
var mustache = require('mustache');

var onSelectEmail;
var onDeselectEmail;

var last_printed_date;
var message_groups = {};

mailboxView = {
	clear:function(){
		$('#inbox').empty();
		message_groups = {};
	},
	addEventListeners:function(){
		var self = this;
		$(function(){
			$('#inbox').on('click','.inbox_email',function(){
				mailboxView.select($(this));
				$(this).removeClass('unseen');
			});
		});
	},
	reflectMessages:function(mail_objs){
		mail_objs.sort(function(a,b){
			return a.date > b.date ? -1 : 1;
		});
		var mids = {};
		mail_objs.forEach(function(mail_obj, index){
			var mid = mail_obj.mailbox + ':' + mail_obj.uid;
			if($('#'+mid).length === 0){
				mailboxView.printMessage(mail_obj);				
			}
		});
	},
	printMessage:function(mail_object){
		// console.log('print message: '+mail_object.short_subject);
		var mid = mail_object.mailbox+':'+mail_object.uid;
		// console.log('MID: '+mid);
		// if($('#'+mid).length > 0){
		// 	return;
		// }
		var template = '<div id="'+mid+'" data-mailbox="'+mail_object.mailbox+'" data-uid="'+mail_object.uid+'" class="inbox_email">'+
			'<div class="from">'+mailboxView.parseName(mail_object.from)+'</div>'+
			'<div class="subject">'+mail_object.headers.subject+'</div>'+
			'<div class="text_preview">'+mailboxView.getPreviewText(mail_object)+'</div>'+
		'</div>';
		var message_wrapper = $(template);
		if(mail_object.flags.indexOf('\\Seen')===-1){
			message_wrapper.addClass('unseen');
		}
		mailboxView.insertFavicon(message_wrapper, mail_object);
		(function(){
			var group_id = (function(){
				if(mail_object.mailbox.substring(0, 'SlateMail/scheduled/'.length) === 'SlateMail/scheduled/'){
					return 'Past Due';
				}
				return mailboxView.getDateString(mail_object.date);
			}());
			var element = message_groups[group_id];
			if(!element){
				element = $('<div class="date_group">');
				if(group_id==='Past Due'){
					element.prependTo('#inbox');
				}
				else{
					element.appendTo('#inbox');
				}
				mailboxView.printDateSeparator(group_id, element);
				message_groups[group_id] = element;
			}
			message_wrapper.appendTo(element);
		}());
	},
	insertDateSeparator:function(mail_object){
		var date_string = mailboxView.getDateString(mail_object.date);
		if(date_string && date_string !== last_printed_date){
			mailboxView.printDateSeparator(date_string);
			last_printed_date = date_string;
		}
	},
	getDateString:function(date){
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
	},
	printDateSeparator:function(s, target){
		$('<div>')
			.addClass('date_separator')
			.html('<span class="triangle">&#9660;</span> <span class="date_string">'+s+'</span>')
			.appendTo(target)
			.click(function(){
				if($(this).hasClass('collapsed')){
					$(this)
						.find('.triangle')
							.html('&#9660;')
							.end()
						.closest('.message_group')
							.removeClass('collapsed');
				}
				else{
					$(this)
						.find('.triangle')
							.html('&#9654;')
							.end()
						.closest('.message_group')
							.addClass('collapsed');
				}
			});
	},
	insertFavicon:function(message_wrapper, mail_object){
		var url = getFaviconUrl(mail_object, function(url){
			if(!url){
				return;
			}
			var img = $('<img>')
				.attr('src', url)
				.addClass('icon')
				.load(function(){
					$(this).prependTo(message_wrapper);
				});

		});
		function getFaviconUrl(mail_object, callback){
			if(!mail_object.from){
				callback(false);
				return;
			}
			var from = mail_object.from[0].address;
			var domain = from.replace(/.*@/, "");
			if(favicon_urls[domain]){
				callback(favicon_urls[domain]);
			}
			else{
				favicon("http://"+domain, function(err, favicon_url) {
					callback(favicon_url);
				});
			}
		}
	},
	select:function(inbox_email){
		if(console){console.log('--------- selection -----------');}
		var self = this;
		if(mailboxView.selected_email && (mailboxView.selected_email.data('uid') === inbox_email.data('uid'))){
			inbox_email.removeClass('selected');
			delete mailboxView.selected_email;
			if(onDeselectEmail){
				onDeselectEmail(inbox_email.data('uid'));
			}
		}
		else{
			if(mailboxView.selected_email){
				mailboxView.selected_email.removeClass('selected');
			}
			inbox_email.addClass('selected');
			if(onSelectEmail){
				onSelectEmail(inbox_email.data('mailbox'), inbox_email.data('uid'));
			}
			mailboxView.selected_email = inbox_email;
		}
	},
	getPreviewText:function(mail_object){
		/**
		 * Return the preview text of a mail object. The preview text is a slice of
		 * the email's message text.
		 * @param {object} mail_object
		 */
		if(mail_object.text){
			return mail_object.text.replace(/[\n\r]/g, ' ').slice(0,125);
		}
		if(mail_object.html){
			return mail_object.html.replace(/<[^>]*>/g, '').replace(/[\n\r]/g, '').trim().slice(0,125);
		}
		return false;
	},
	parseName:function(from_header){
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
	},
	onSelect:function(fnc){
		onSelectEmail = fnc;
	},
	onDeselect:function(fnc){
		onDeselectEmail = fnc;
	}
};
mailboxView.addEventListeners();

module.exports = mailboxView;
