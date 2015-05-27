var Q = require('Q');
var keychain = require('keychain');
function getPassword(){
	var def = Q.defer();
	var password;
	keychain.getPassword({account:global.PREFERENCES.internal.user, service:'SlateMail'}, function(err, pass){
		if(!pass){
			password = window.prompt('What is your IMAP password?');
			keychain.setPassword({account:global.PREFERENCES.internal.user, service:'SlateMail', password: password}, function(err){
				if(err){
					console.log(err);
				}
			});
		}
		else{
			password = pass;
		}
		def.resolve(password);
	});
	return def.promise;
}

module.exports = getPassword;
