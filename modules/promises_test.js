var Q = require('Q');

var promises = [];
for(var i=0;i<10;i++){
	promises.push(myProcess(i));
}

Q.all(promises)
	.then(function(){
		console.log('over');
	});

function myProcess(i){
	var def = Q.defer();
	setTimeout(function(){
		console.log(i);
		def.resolve();
	}, Math.random()*1000);
	return def.promise;
}