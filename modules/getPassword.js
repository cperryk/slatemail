// var Q = require('Q');
var keychain = require('keychain');
function getPassword(){
	return new Promise(function(resolve, reject){
		resolve('@z919XLWslUo');
	});
	// var def = Q.defer();
	// var password;
	// // console.log(global.PREFERENCES.internal.user);
	// // keychain.getPassword({account:global.PREFERENCES.internal.user, service:'SlateMail'}, function(err, pass){
	// def.resolve('@z919XLWslUo');
	// return def;
	// keychain.getPassword({account:'Chris.Kirk@slate.com', service:'SlateMail'}, function(err, pass){
	// 	console.log(err);
	// 	console.log(pass);
	// 	if(!pass){
	// 		password = window.prompt('What is your IMAP password?');
	// 		keychain.setPassword({account:global.PREFERENCES.internal.user, service:'SlateMail', password: password}, function(err){
	// 			if(err){
	// 				console.log(err);
	// 			}
	// 		});
	// 	}
	// 	else{
	// 		password = pass;
	// 	}
	// 	def.resolve(password);
	// });
	// return def.promise;
}

module.exports = getPassword;
