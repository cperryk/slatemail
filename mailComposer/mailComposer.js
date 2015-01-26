var $ = require('jquery');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var fs = require('fs-extra');
var CKEDITOR;
function MailComposer(conf){
	console.log('new mail composer...');
	this.conf = conf;
	var self = this;
	if(!conf || !conf.container){
		var gui = window.gui;
		var win = window.open('mailComposer/mailComposer.html');
		this.Win = gui.Window.get(win);
		this.Win.once('document-end',function(){
			self.Win.focus();
			$(function(){
				var doc = $(win.document);
				var text_area = doc.find('textarea').get(0);
				self.CKEDITOR = win.CKEDITOR;
				self.container = doc;
				self.preload(conf);
				self.addEventListeners();
				if(!(conf && conf.in_reply_to)){
					doc.find('.input_to').focus();
				}
				else{
					doc.find('#message_body').focus();
				}
			});
		});
	}
}
MailComposer.prototype = {
	addEventListeners:function(){
		console.log('adding event listeners');
		var self = this;
		console.log(this.container.find('.btn_send')[0]);
		this.container.find('.btn_send')
			.click(function(){
				$(this).unbind('click');
				self.send();
			});
	},
	preload:function(conf){
		var self = this;
		console.log('preloading');
		console.log(conf);
		if(!conf){
			return;
		}
		if(conf.to){
			this.container.find('.input_to')
				.html(conf.to);
		}
		if(conf.subject){
			this.container.find('.input_subject')
				.html(conf.subject);
		}
		if(conf.cc){
			this.container.find('.input_cc')
				.html(conf.cc);
		}

		if(conf.body){
			this.CKEDITOR.instances.message_body.setData(conf.body, {
				callback:function(){
					// Set the type of blockquotes to cite.
					// If you don't do this, CKEDITOR will automatically get rid of the type attributes because it's probably invalid HTML.
					// However, these are essential so Apple Mail will collapse the quoted emails.
					var blockquote = self.container.find('blockquote');
					console.log(blockquote);
					blockquote
						.attr('type','cite');
				}
			});
		}
	},
	send:function(){
		console.log('sending');
		var self = this;
		var to = this.container.find('.input_to').html();
		var subject = this.container.find('.input_subject').html();
		var body = this.CKEDITOR.instances.message_body.getData();
		var credentials = fs.readJsonSync('credentials/credentials2.json').external;
		var mail_options = {
			from: credentials.auth.user,
			to: to,
			subject: subject,
			html: body
		};
		console.log(mail_options.html);
		if(this.conf && this.conf.in_reply_to){
			mail_options.inReplyTo = this.conf.in_reply_to;
		}
		console.log(mail_options);
		var transporter = nodemailer.createTransport(smtpTransport(credentials));
		console.log(transporter);

		transporter.sendMail(mail_options, function(error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log('Message sent: ' + info.response);
			}
			self.Win.close();
		});
	}
};

module.exports = MailComposer;
