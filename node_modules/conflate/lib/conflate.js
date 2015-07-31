/**
 * Conflate
 */
module.exports = function(){
  // Filter conversion method from arguments
  var objects = [];
  var conversions = [];
  for(var i = 0; i < arguments.length; i++){
      if(typeof arguments[i] === 'function'){
        conversions.push(arguments[i]);
        continue;
      } 
      objects.push(arguments[i]);
  }

  if(objects.length < 2){
    throw new Error('Need two objects to conflate.');
  }
  
  for(i = 1; i < objects.length; i++){
    merge(objects[0], objects[i], conversions);
  }

  return objects[0];
};

function merge(obj1, obj2, conversion) {

  if(typeof obj2 !== 'object' || !obj2){
    return;
  }

  var keys = Object.keys(obj2);
  for(var i = 0; i < keys.length; i++){
    var k = keys[i];
    if(typeof obj2[k] === 'object' && obj2[k] !== null){
      if(!obj1[k] || typeof obj1[k] !== 'object'){
        obj1[k] = applyConversion(k, obj2[k], conversion);
      } else {
        merge(obj1[k], obj2[k]);
      }
    } else {
      obj1[k] = applyConversion(k, obj2[k], conversion);
    }
  }
}

function applyConversion(key, value, conversion){
  if(!conversion) return value;
  for(var i = 0; i < conversion.length; i++){
    value = conversion[i](key, value);
  }
  return value;    
}