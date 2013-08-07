var crud = require('./crud.js');

function updatelist(err) {
    crud.list(function(err, people) {
	$('ul').empty();
	for( var pi = 0; pi < people.length; pi++ ) {
	    var fun = function(id, name) {
		var li = document.createElement('li');
		$(li).append('<span>' + name + ' (' + id +
			     ')</span>' + 
			     '<button class="update">Update</button>' +
			     '<button class="remove">Remove</button>');
		$(li).children('button.update').click(function() {
		    var newname = prompt('New name', name);
		    if( newname )
			crud.update(id, newname, updatelist);
		});
		$(li).children('button.remove').click(function() {
		    crud.remove(id, updatelist);
		});
		$('ul').append(li);
	    };
	    fun(people[pi]._id, people[pi].name);
	}
    });
}

$(document).ready(function() {
    updatelist();
    $('input').keypress(function(event) {
	if( event.keyCode == 13 ) {
	    var name = $('input').val();
	    $('input').val('');
	    crud.create(name, updatelist);
	}
    });
});
