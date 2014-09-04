var $ = require('jquery');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var fs = require('fs-extra');
var CKEDITOR;
function MailComposer(conf){

	var self = this;
	if(!conf || !conf.container){
		console.log('creating new window');
		var gui = window.gui;
		var win = window.open('mailComposer/mailComposer.html');
		var Win = gui.Window.get(win);
		Win.focus();
		console.log('wtf');
		console.log(Win);
		Win.once('document-end',function(){
			$(function(){
				var doc = $(win.document);
				var text_area = doc.find('textarea').get(0);
				doc.find('.input_to').focus();
				CKEDITOR = win.CKEDITOR;
				CKEDITOR.replace(text_area, {autoGrow_onStartup:true});
				self.container = doc;
				self.preload(conf);
				self.addEventListeners();
			});
		});
	}
}
MailComposer.prototype = {
	addEventListeners:function(){
		var self = this;
		this.container.find('.btn_send')
			.click(function(){
				self.send();
			});
	},
	preload:function(conf){
		if(!conf){
			return;
		}
		// if(conf.from){
		// 	this.container.find('.input_from')
		// 		.html(conf.from);
		// }
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
	},
	send:function(){
		var self = this;
		var from = this.container.find('.input_from').html();
		var to = this.container.find('.input_to').html();
		var subject = this.container.find('.input_subject').html();
		var body = CKEDITOR.instances.editor1.getData();
    var credentials = fs.readJsonSync('credentials/credentials2.json').external;
   	var mail_options = {
			from: credentials.auth.user,
			to: to,
			subject: subject,
			html: body
		};
		console.log(mail_options);
		var transporter = nodemailer.createTransport(smtpTransport(credentials));
		console.log(transporter);

		transporter.sendMail(mail_options, function(error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log('Message sent: ' + info.response);
			}
			self.win.close();
		});
	}
};

module.exports = MailComposer;

/*
$(function() {

	function send() {
		var from = $('#input_from');
		var to = $('#input_to');
		var subject = $('#input_subject');
		var body = CKEDITOR.instances.editor1.getData();
		var mail_options = {
			from: from,
			to: to,
			subject: subject,
			html: body
		};
		console.log(mail_options);
    var credentials = fs.readJsonSync('credentials/credentials2.json').external;
		var transporter = nodemailer.createTransport(credentials);

		// transporter.sendMail(mail_options, function(error, info) {
		// 	if (error) {
		// 		console.log(error);
		// 	} else {
		// 		console.log('Message sent: ' + info.response);
		// 	}
		// });
	}


	var $ = require('jquery');
var nodemailer = require('nodemailer');
var fs = require('fs-extra');

$(function() {
	CKEDITOR.replace('editor1', {
		autoGrow_onStartup: true
		// uiColor:'#AADC6E'
	});
	$('.headers p')
		.click(function() {
			console.log('yay');
			$(this).find('.field').focus();
		});

});


});
*/