var domain = require('domain');

var users = {};
var activeusers = {};

exports.send = function(message) {
    if( !domain.active.socketSession.username )
	return;
    for( var ai in activeusers )
	activeusers[ai](domain.active.socketSession.username, message);
}

exports.login = function(name, password, recvfun, callback) {
    if( users[name] == null )
	users[name] = password;

    if( users[name] == password && password ) {
	domain.active.socketSession.username = name;
	var sessionid = (Math.random() + '').substring(2);
	activeusers[sessionid] = recvfun;
	domain.active.socket.on('disconnect', function() {
	    delete activeusers[sessionid];
	});
	callback();
    }  else
	callback('error logging in');
}

