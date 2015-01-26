function arrToTree(paths){
	// Takes an array of paths and turns it into a tree.
	// ['a','a/b','a/c'] becomes {a:{b:{},c:{}}
	// So does ['a/b/c'];
	var tree = {};
	paths.forEach(function(path){
		var segs = path.split('/');
		var last = tree;
		for(var i=0; i<segs.length; i++){
			if(!last[segs[i]]){
				last[segs[i]] = {};
			}
			last = last[segs[i]];
		}
	});
	return tree;
}