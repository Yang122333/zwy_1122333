var domain = require('domain');

exports.login = function(name, password, callback) {
    if( domain.active.httpSession.username )
	callback('already logged in');
    else {
	if( name + 'pass' == password ) {
	    // domain.active.httpSession is just a copy, so we have to
	    // modify the original in the session store
	    domain.active.httpSessionStore.modify(function(sess, cb) {
		sess.username = name;
		cb();
	    }, callback);
	} else
	    callback('invalid password');
    }
}

exports.logout = function(callback) {
    domain.active.httpSessionStore.modify(function(sess, cb) {
	delete sess.username;
	cb();
    }, callback);
}

exports.getUserName = function(callback) {
    callback(null, domain.active.httpSession.username);
}
