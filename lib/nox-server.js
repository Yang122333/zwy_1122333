
var fs = require('fs');
var path = require('path');
var async = require('async');
var domain = require('domain');

var noxRPC = require('./nox-rpc.js').noxRPC;

function callbackModule(rpc, arg, parent) {
    switch(typeof arg) {
    case 'function':
	var cbid = rpc.createCallback(function() {
	    arg.apply(parent, arguments);
	});
	return 'function() {\n' +
	    '  nox_rpc.rpcCall(\'' + cbid + '\', arguments);\n' +
	    '}\n\n';
    case 'object':
	if( arg == null )
	    return 'null';
	var retobj = '{\n';
	var first = true;
	for( var oi in arg ) {
	    retobj += '  ' + oi + ': ' + callbackModule(rpc, arg[oi], arg) + ',\n';
	    first = false;
	}
	if( !first )
	    retobj = retobj.substring(0, retobj.length - 2);
	return retobj + '}\n';
    default: 
	return arg + '';
    }
}

exports.nox = function(requirefun, cookiename, logfun, uglify, rootdir) {

    if( typeof requirefun != 'function' )
	requirefun = function(modstr) { return require(modstr); };
    if( typeof cookiename != 'string' || cookiename == '' )
	cookiename = 'nox.sid';
    if( typeof logfun != 'function' )
	logfun = function() {}
    if( typeof rootdir != 'string' ) 
	rootdir = '';

    var noxSessions = {};
    function createNoxSession() {
	while(true) {
	    var sessionid = 'session' + (Math.random()+'').substring(2);
	    var timer = setTimeout(function() {
		logfun('deleting session ' + sessionid + ' due to timeout\n');
		delete noxSessions[sessionid];
	    }, 10000);
	    if( noxSessions[sessionid] == null ) {
		noxSessions[sessionid] = { nox_rpc: noxRPC(),
					   timer: timer,
					   init: false };
		break;
	    }
	}
	logfun('created nox session ' + sessionid + '\n');
	return sessionid;
    }
    
    function getNoxSession(sessionid) {
	return noxSessions[sessionid].nox_rpc;
    }
    
    function initNoxSession(sessionid, socket, httpsessionstore) {
	var session = noxSessions[sessionid];
	if( session ) {
	    if( session.init == false ) {

		// clear timeout
		clearTimeout(session.timer);

		// clean after disconnect
		socket.on('disconnect', function() {
		    logfun('deleting session ' + sessionid + 
			   ' due to disconnect\n');
		    delete noxSessions[sessionid];
		});

		// initialize session
		session.init = true;
		session.socketSession = {};
		session.socket = socket;
		session.domain = domain.create();

		logfun('attached socket to session ' + sessionid + '\n');
		session.nox_rpc.setSocket(socket, httpsessionstore, 
					  session.socketSession, 
					  session.domain);
	    } else
		logfun('tried to attach two sockets to same session!\n');
	} else
	    logfun('could not attach socket to nox session\n');
    }

    var httpSessions = {};

    var pages = {};

    function socketAuth(handshakeData, callback) {
	logfun('connecting socket with cookie ' + handshakeData.headers.cookie + '\n')
	logfun('matching with ' + cookiename + '=([^ ]+)\n');

	var m = getCookie(handshakeData);
	if( m ) {
	    logfun('matched with ' + m + '\n');
	    if( httpSessions[m] ) {
		logfun('authorizing socket ' + m + '\n');
		handshakeData.sessionStore = httpSessions[m];
		callback(null, true);
		return;
	    }
	}
	logfun('declining sessionless socket\n');
	callback(null, false);
    }

    function socketConn(client_socket) {
	logfun('new connection for ' + client_socket.handshake.sessionStore.getCookie() + '\n');
	client_socket.on('__session__', function(data) {
	    initNoxSession(data.session, client_socket, 
			   client_socket.handshake.sessionStore);
	});
    }

    function page(url, servermodules, clientmodules) {
	pages[url] = { url: url,
		       server: servermodules,
		       client: clientmodules };
    }

    function getCookie(req) {
	try {	    
	    var sid = req.headers.cookie.match(new RegExp(cookiename + '=([^ ]+)'))[1];
	    return sid.match(/s\x253A([^\x2e]+)\x2e/)[1];
	} catch(err) {
	    return null;
	}
    }

    logfun('installing nox-client.js\n');
    
    function get(req, res) {
	
	var cookie = getCookie(req);
	logfun('SESSION ' + req.method + ' ' + req.url + ' ' + (cookie ? cookie : '(no cookie)') + '\n');
	
	if( cookie ) {
	    if( httpSessions[cookie] == null ) {
		logfun('storing session ' + cookie + '\n');
		httpSessions[cookie] = {
		    getCookie: function() {
			return cookie;
		    },
		    get: function(cb) {
			req.sessionStore.get(cookie, cb);
		    },
		    set: function(sess, cb) {
			req.sessionStore.set(cookie, sess, cb);
		    },
		    modify: function(fun, callback) {
			async.waterfall([
			    function(wfcb) {
				req.sessionStore.get(cookie, wfcb);
			    },
			    function(session, wfcb) {
				fun(session, function(err) {
				    wfcb(err, session);
				});
			    },
			    function(session, wfcb) {
				req.sessionStore.set(cookie, session, wfcb);
			    }
			], callback);
		    }
		};
	    }
	} else {
	    logfun('refusing cookie-less request\n');
	    res.writeHead(403);
	    res.end();
	    return;
	}

	var ref = req.headers['referer'];
	if( !ref )
	    ref = req.headers['Referer'];
	if( !ref )
	    ref = req.headers['referrer'];
	if( !ref )
	    ref = req.headers['Referrer'];

	if( ref )
	    ref = ref.match(/^https?:\/\/[^\/]+\/([^\x3f]*)(\x3f.*)?$/);
	
	if( !ref ) {
	    logfun('nox-client.js requested with no referer\n');
	    res.writeHead(404);
	    res.end();
	    return;
	}

	var page = pages['/' + ref[1]];
	logfun('building nox-client.js for /' + ref[1] + '\n');
	if( !page ) {
	    logfun('nox-client.js not found for /' + ref[1] + '\n');
	    res.writeHead(404);
	    res.end();
	    return;
	}

	logfun('serving nox-client.js for ' + page.url + '\n');

	var result = [];
	async.waterfall([
	    function(wfcb) {
		logfun('piping nox-rpc.js\n');
		fs.readFile(__dirname + '/nox-rpc.js', 'utf8', wfcb);
	    },
	    function(filestr, wfcb) {
		result.push(filestr);
		logfun('piping nox-client.js\n');
		fs.readFile(__dirname + '/nox-client.js', 'utf8', wfcb);
	    },
	    function(filestr, wfcb) {
		result.push(filestr);
		// create nox session
		var sessionid = createNoxSession();
		result.push('nox_rpc = noxRPC(\'' + sessionid + '\');\n');
		result.push('nox_rpc.setSocket(io.connect());\n');
		var nox_rpc = getNoxSession(sessionid);
		
		logfun('piping server modules\n');
		async.forEachSeries(page.server,
				    function(mod, modcb) {
					try {
					    logfun('loading ' + mod + '\n');
					    var module = requirefun(mod);
					    logfun('writing module stub to client\n');
					    result.push('required_module(\'' + mod + '\', ' + 
						callbackModule(nox_rpc, module, {}) + ');\n');
					    modcb();
					} catch(err) {
					    logfun('error loading module: ' + err + '\n');
					    modcb(err);
					}
				    },
				    wfcb);
	    },
	    function(wfcb) {
		async.forEachSeries(
		    page.client,
		    function(mod, modcb) {
			result.push('// module ' + mod + '\n' + 
				    'var _exports = {};\n' + 
				    'var _module = { exports: _exports };\n\n' +
				    '(function(module, exports, ' + 
				    'require, process) {\n');
			var modfile = mod;
			
			if( rootdir )
			    if( !rootdir.match(/\/$/) )
				rootdir += '/';
			var modfilename = rootdir + modfile;
			modfilename = path.normalize(modfilename);

			fs.readFile(modfilename, 'utf8', function(err, filestr) {
			    if( err ) {
				if( mod.indexOf('./') == 0 ||
				    mod.indexOf('../') == 0 ) {
				    modcb('module ' + mod + ' not found');
				} else {
				    result.push('})();\n' +
						'required_module(\'' +
						mod + '\', ' + mod + ');\n\n');
				    modcb();
				}
				return;
			    }
			    var moddir = path.dirname(mod);
			    
			    result.push(filestr);
			    
			    result.push(
				'})(_module, _exports, function(modname) {\n' +
				    '  if( modname[0] != \'.\' )\n' +
				    '    return require(modname);\n' +
				    '  var modpath = \'' + moddir + '/\' + modname;\n' +
				    '  modpath = modpath.split(\'/\');\n' +
				    '  for( var mi = 1; mi < modpath.length; mi++ ) {\n' +
				    '    if( modpath[mi] == \'.\' ) {\n' +
				    '      modpath.splice(mi, 1); mi--;\n' +
				    '    } else if( modpath[mi] == \'..\' ) {\n' +
				    '      modpath.splice(mi-1, 2); mi -= 2;\n' +
				    '    }\n' +
				    '  }\n' +
				    '  return require(modpath.join(\'/\'));\n' +
				    '}, {\n' + 
				    '  stdout: {\n' +
				    '    write: function(str) { console.log(\'stdout: \' + str); }\n' +
				    '  },\n' +
				    '  stderr: {\n' +
				    '    write: function(str) { console.log(\'stderr: \' + str); }\n' +
				    '  },\n' +
				    '  nextTick: function(fun) {\n' +
				    '    setTimeout(fun, 0);\n' +
				    '  },\n' +
				    '  on: function() {}\n' +
				    '});\n\n' +
				    'required_module(\'' + mod + 
				    '\', _module.exports);\n\n');
			    modcb();
			});
		    },
		    wfcb);
	    },
	    function(wfcb) {
		result = result.join('');
		if( uglify ) {
		    try {
			result = require('uglify-js').minify(result, {fromString: true}).code;
		    } catch(err) {
			logfun('error minifying nox-client.js\n');
			wfcb(err);
		    }
		}
		wfcb();
	    },
	    function(wfcb) {
		res.writeHead(200, { 'Content-Type': 'text/javascript', 
				     'Cache-Control': 'no-cache' });
		res.end(result);
		wfcb();
	    }
	], function(err) {
	    if( err ) {
		res.writeHead(500);
		res.end();
		logfun('error creating ' + page.url + 
		       '/nox-client.js: ' + err + '\n');
	    }
	});
    }

    return {
	get: get,
	page: page,
	socketAuth: socketAuth,
	socketConn: socketConn,
    }
}

