var step = require('step');

step(
	function(){
		console.log('function 1');
		return 'a';
	},
	function(err, val){
		console.log('function 2');
		console.log(val);
	}
);