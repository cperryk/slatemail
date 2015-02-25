var $ = require('jquery');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var stubTransport = require('nodemailer-stub-transport');
var fs = require('fs-extra');
var Imaper = require('../modules/imaper');
var CKEDITOR;
var Q = require('Q');
var keychain = require('keychain');
var password;
var notifier = require('node-notifier');

var PREFERENCES = JSON.parse(fs.readFileSync('preferences/preferences.json'));
global.PREFERENCES = PREFERENCES;
console.log(global.PREFERENCES);

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
		this.container = container;
		this.conf = JSON.parse(fs.readFileSync('mailComposer/cached.json', 'utf8'));
		this.CKEDITOR = window.CKEDITOR;
		console.log('NEW MAIL COMPOSER', this.conf);
		this.preload();
		this.addEventListeners();
	}
	fs.writeFileSync('mailComposer/cached.json', JSON.stringify(this.conf));
}
MailComposer.prototype = {
	addEventListeners:function(){
		var self = this;
		this.container.find('.btn_send')
			.click(function(){
				$(this).unbind('click');
				self.send();
			});
	},
	preload:function(){
		var self = this;
		var conf = this.conf;
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
			// filter to prevent user from CCing his/her own email address
			var filtered = conf.cc
				.match(/(?:"[^"]*"|[^,])+/g) // splits by comma that is not inside quotes
				.filter(function(item){
					// console.log('-- check item --');
					// console.log(item);
					// console.log(global.PREFERENCES.internal.user);
					// console.log(item.toLowerCase().indexOf(global.PREFERENCES.internal.user.toLowerCase()));
					return (item.toLowerCase().indexOf(global.PREFERENCES.internal.user.toLowerCase()) === -1) &&
						(item.trim().length>0);
				})
				.join(',');
			this.container.find('.input_cc')
				.html(filtered);
		}
		if(conf.to){
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
					blockquote
						.attr('type','cite');
				}
			});
		}
	},
	send:function(){
		console.log('sending');
		this.container.find('.btn_send').html('Sending...');
		var self = this;
		var credentials = PREFERENCES.external;
		var mail_options = (function(){
			var out = {
				from: credentials.auth.user,
				to: self.container.find('.input_to').text(),
				subject: self.container.find('.input_subject').html(),
				html: self.CKEDITOR.instances.message_body.getData()
			};
			if(self.conf && self.conf.in_reply_to){
				out.inReplyTo = self.conf.in_reply_to;
			}
			if(self.container.find('.input_cc').text()!==''){
				out.cc = self.container.find('.input_cc').text();
			}
			return out;
		}());
		getPassword()
			.then(function(password){
				credentials.auth.pass = password;
				console.log('SMTP creds', credentials);
				var transporter = nodemailer.createTransport(smtpTransport(credentials));
				console.log('SMTP opts', mail_options);
				transporter.sendMail(mail_options, function(error, info) {
					if(error){
						console.log(error, info);
						window.alert(error);
						return;
					}
					else{
						notifier.notify({
		   				title:"Message Sent!",
		   				message:"SlateMail successfully sent your email."
		   			});
						console.log('Message sent: ' + info.response);
						self.container.find('.btn_send').html('Sent! Adding to your sent items...');
						// Simulates a mail send so you can get the email and add it to your IMAP sent folder
						var transporter2 = nodemailer.createTransport(stubTransport());
						transporter2.sendMail(mail_options, function(error, info){
							global.PREFERENCES.internal.password = password;
							var imaper = new Imaper();
							imaper.addMessageToBox('Sent Items', info.response.toString())
					   		.then(function(){
					   			self.container.find('.btn_send').html('Added!');
					   			setTimeout(function(){
										window.close();
					   			},500);
					   		});
						});
					}
				});
			});
	}
};

function getPassword(){
	var def = Q.defer();
	if(password){
		def.resolve(password);
	}
	else{
		keychain.getPassword({account:global.PREFERENCES.internal.user, service:'SlateMail'}, function(err, password){
			if(!password){
				password = window.prompt('What is your IMAP password?');
				keychain.setPassword({account:global.PREFERENCES.internal.user, service:'SlateMail', password: password}, function(err){
					if(err){
						console.log(err);
					}
				});
			}
			def.resolve(password);
		});
	}
	return def.promise;
}

module.exports = MailComposer;
