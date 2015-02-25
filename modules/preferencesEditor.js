var gui = global.gui;
var $ = require('jquery');
var fs = require('fs');
var exec = require('child_process').exec;
var dbHandler = window.dbHandler;

function PreferencesEditor(conf){
	var self = this;
	this.conf = conf;
	this.win = gui.Window.open('./modules/preferencesEditor.html');
	this.win.on('document-end', function() {
		var doc = $(self.win.window.document);
		self.doc = doc;
		console.log(doc);
		// preload vals
		var prefs = global.PREFERENCES;
		console.log(prefs);
		var inputs_to_vals = {
			demo: prefs.demo,
			internal_username: prefs.internal.user,
			internal_host: prefs.internal.host,
			internal_port: prefs.internal.port,
			internal_tls: prefs.internal.tls,
			external_host: prefs.external.host,
			external_port: prefs.external.port,
			external_username: prefs.external.auth.user,
			external_secure: prefs.secure
		};
		doc.find('input').each(function(){
			var name = $(this).attr('name');
			if(inputs_to_vals[name]){
				$(this).val(inputs_to_vals[name]);	
			}
		});

		// add listeners
		doc
			.find('.btn_save')
				.click(function(){
					self.saveVals();
				})
				.end()
			.find('.btn_edit')
				.click(function(){
					exec('open preferences/preferences.json');
				})
				.end()
			.find('.btn_delete_database')
				.click(function(){
					if(window.confirm('This will delete all of your email, threads, and projects. Are you sure you want to do this?')){
						var my_dbHandler = new dbHandler();
						my_dbHandler.deleteEverything();
					}
				});
	});
}
PreferencesEditor.prototype = {
	saveVals:function(){
		var doc = this.doc;
		var self = this;
		var arr = doc.find('form').serializeArray();
		var prefs = {internal:{}, external:{auth:{}}};
		arr.forEach(function(input){
			switch(input.name){
				case 'demo':
					prefs.demo = Boolean(input.value);
					break;
				case 'internal_username':
					prefs.internal.user = input.value;
					break;
				case 'internal_host':
					prefs.internal.host = input.value;
					break;
				case 'internal_port':
					prefs.internal.port = input.value;
					break;
				case 'internal_tls':
					prefs.internal.tls = Boolean(input.value);
					break;
				case 'external_host':
					prefs.external.host = input.value;
					break;
				case 'external_port':
					prefs.external.port = input.value;
					break;
				case 'external_username':
					prefs.external.auth.user = input.value;
					break;
				case 'external_secure':
					prefs.external.secure = Boolean(input.value);
					break;
			}
		});
		fs.writeFile('preferences/preferences.json', JSON.stringify(prefs), function(err){
			if(!err){
				window.alert('Preferences saved!');
				self.win.close();
			}
		});
		console.log('OUT PREFS', prefs);
	}
};

module.exports = PreferencesEditor;