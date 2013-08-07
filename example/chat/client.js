var chat = require('./chat.js');
var async = require('async');

var username = null;

function receiveChat(username, message) {
    $('table').append('<tr><td>' + username + ':</td><td>' + message + '</td>');
}

function sendChat() {
    var msg = $('input').val();
    $('input').val('');
    chat.send(msg);
}

$(document).ready(function() {
    $('input').keypress(function(event) {
	if( event.keyCode == 13 )
	    sendChat();
    });

    username = prompt('User name:');
    var password = prompt('Password (make up one if you are logging ' + 
			  'in for the first time):');
    chat.login(username, password, receiveChat, function(err) {
	if( err )
	    alert('Invalid username or password. Please refresh the ' + 
		  'page to try againlogin again.');
	else
	    $('h1').text('Nox Chat - Logged in as ' + username);
    });
});
