var Q = require('Q');

// test1()
// 	.then()
// 	.then(test3);

function test1(){
	var def = Q.defer();
	setTimeout(function(){
		console.log('test1 resolving');
		def.resolve();
	},1000);
	return def.promise;
}
// function test2(){
// 	var def = Q.defer();
// 	setTimeout(function(){
// 		console.log('test2 resolving');
// 		def.resolve();
// 	},1000);
// 	return def.promise;
// }
// function test3(){
// 	var def = Q.defer();
// 	setTimeout(function(){
// 		console.log('test3 resolving');
// 		def.resolve();
// 	},1000);
// 	return def.promise;
// }

	test1()
		.then(function(){ 
			return true;
		})
		.fin(function(){
			console.log('threading complete');
			def.resolve();
		});