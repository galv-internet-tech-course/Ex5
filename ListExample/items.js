var items = {
	a:{description:'a'},
	b:{description:'b'}
};

module.exports = {
	get: function(){
		return items;
	},
	add:function(key,object){
		items[key] = object;
		return items;
	},
	remove:function(keyToRemove){
		delete items[keyToRemove];
		return items;
	}
};