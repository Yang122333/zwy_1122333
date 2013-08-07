var nssh = require('./nssh.js');

$(document).ready(function() {
    nssh.open(
	function(outstr) {
	    var rows = outstr.split('\n');
	    for( var ri = 0; ri < rows.length; ri++ ) {
		var li = document.createElement('li');
		$(li).text(rows[ri]).css('color', '#0f0f0f');
		$('ul').append(li);
	    }
	},
	function(infun) {
	    $('input').keypress(function(event) {
		if( event.keyCode == 13 ) {
		    var cmd = $('input').val();
		    $('input').val('');
		    var li = document.createElement('li');
		    $(li).text('$ ' + cmd).css('color', '#54f75d');
		    $('ul').append(li);
		    infun(cmd);
		}
	    });
	});
});
