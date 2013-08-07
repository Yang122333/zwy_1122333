var session = require('./session.js');

function updateStatus(err) {
    if( err )
	alert('Error: ' + err);
    session.getUserName(function(err, name) {
	if( name ) {
	    $('#status').text('Logged in as ' + name);
	    $('#controls').empty();
	    $('#controls').append('<button>Log out</button>');
	    $('#controls button').click(function() {
		session.logout(updateStatus);
	    });
	} else {
	    $('#status').text('Logged out');	    
	    $('#controls').empty();
	    $('#controls').append(
		'<p>Log in as:<input id="username" placeholder="Name"></p>' + 
	        '<p>Password:<input id="password" placeholder="Password"></p>' + 
		'<button>Log in</button>');
	    $('#controls button').click(function() {
		session.login($('#username').val(),
			      $('#password').val(), updateStatus);
	    });
	}
    });
}

$(document).ready(function() { updateStatus(); });
