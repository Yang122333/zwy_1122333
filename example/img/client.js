var img = require('./img.js');

$(document).ready(function() {
    $('input').keypress(function(event) {
	if( event.keyCode == 13 ) {
	    var name = $('input').val();
	    $('input').val('');
	    img.getThumbnail(name, 128, function(err, imgurl) {
		if( err )
		    alert(err);
		else
		    $('div').append('<img style="float: left;" src="' + imgurl + '" />');
	    });
	}
    });
});
