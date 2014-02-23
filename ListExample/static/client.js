console.log('hi client');

var model = (function(){
	var items = [];

	return {
		set:function(newModel,domElement){
			items = newModel;
			if(domElement){
				this.draw(domElement);
			}
		},

		draw:function(domElement){
			//clean
			domElement.html("")
			//draw
			var index,currentItem,domItem;
			for(index in items){
				currentItem = items[index];
				console.log(currentItem);

				domElement.append("<span>"+currentItem.description+"</span>"); 
				var delButton = $('<button>delete</button>');
				delButton.click((function(itemId){
					return function(){
						console.log(itemId);
						$.ajax({
						    url: '/items/'+itemId,
						    type: 'DELETE',
						    dataType:'json',
						    success: function(items){
					    		model.set(items,domElement);
					    	}
						});
					}
				})(index));
				domElement.append(delButton);
				domElement.append("<br/>");
			}
		},


	};
 
})();


$(document).ready(function(){	
	var domElement = $('#list');

	//get inital list
	$.ajax({
	    url: '/items',
	    type: 'GET',
	    dataType:'json',
	    success: function(items){
    		model.set(items,domElement);
    	}
	});

	//handle new items
	var newItemInputId = $("#newItemId");
	var newItemInputDesc = $("#newItemDesc");
	$("#addButton").click(function(){
		$.ajax({
		    url: '/items/'+newItemInputId.val(),
		    data:{description:newItemInputDesc.val()},
		    type: 'PUT',
		    dataType:'json',
		    success: function(items){
	    		model.set(items,domElement);
	    	}
		});		
	});
});