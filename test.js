function task(){
  return new Promise(function(resolve, reject){
    setTimeout(function(){
      console.log('go');
      resolve();
    }, 1000);
  });
}

var promises = [task, task, task, task];

runSequential(promises);

function runSequential(promises){
  return promises.reduce(function(prev, curr){
    return prev.then(curr);
  }, promises[0]());
}
