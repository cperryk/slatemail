var $ = require('jquery');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var stubTransport = require('nodemailer-stub-transport');
var fs = require('fs-extra');
var imapHandler = require('../modules/imapHandler');
var CKEDITOR;

function MailComposer(container, conf){
	this.conf = conf || {};
	if(!container){
		var gui = window.gui;
		this.Win = gui.Window.open('mailComposer/mailComposer.html', {
			'new-instance':true,
			focus: true
		});
	}
	else{
		console.log('has container');
		this.container = container;
		this.conf = JSON.parse(fs.readFileSync('mailComposer/cached.json', 'utf8'));
		this.CKEDITOR = window.CKEDITOR;
		console.log(this.conf);
		this.preload();
		this.addEventListeners();
	}
	fs.writeFileSync('mailComposer/cached.json', JSON.stringify(this.conf));
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
	preload:function(){
		var self = this;
		var conf = this.conf;
		console.log('preloading');
		console.log(conf);
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
		if(conf && conf.to){
			console.log('focusing on message body');
			this.container.find('#message_body').focus();
		}
		else{
			this.container.find('.input_to').focus();
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
			var transporter2 = nodemailer.createTransport(stubTransport());
			transporter2.sendMail(mail_options, function(error, info){	
		   	imapHandler.addMessageToBox('Sent Items', info.response.toString())
		   		.then(function(){
						window.close();
		   		});
			});
		});
	}
};

module.exports = MailComposer;
