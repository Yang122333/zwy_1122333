
var fs = require('fs');
var path = require('path');
var async = require('async');
var domain = require('domain');
var util = require('./nox-util.js');

var noxRPC = require('./nox-rpc.js').noxRPC;

function callbackModule(rpc, arg, parent, auth) {
    switch(typeof arg) {
    case 'function':
        var cbid = rpc.createCallback(function() {
            arg.apply(parent, arguments);
        }, auth);
        return 'function() {\n' +
            '  nox_rpc.rpcCall(\'' + cbid + '\', arguments);\n' +
            '}\n\n';
    case 'object':
        if( arg == null )
            return 'null';
        var retobj = '{\n';
        var first = true;
        for( var oi in arg ) {
            retobj += '  ' + oi + ': ' + callbackModule(rpc, arg[oi], arg, auth) + ',\n';
            first = false;
        }
        if( !first )
            retobj = retobj.substring(0, retobj.length - 2);
        return retobj + '}\n';
    default: 
        return arg + '';
    }
}

exports.noxState = require('./nox-state.js').noxState;

exports.nox = function(requirefun, cookiename, logfun, uglify, rootdir) {

    if( typeof requirefun != 'function' )
        requirefun = function(modstr) { return require(modstr); };
    if( typeof cookiename != 'string' || cookiename == '' )
        cookiename = 'nox.sid';
    if( typeof logfun != 'function' )
        logfun = util.log;
    if( typeof rootdir != 'string' ) 
        rootdir = '';

    if( rootdir )
        if( !rootdir.match(/\/$/) )
            rootdir = rootdir + '/';

    var noxSessions = {};
    function createNoxSession() {
        while(true) {
            var sessionid = 'session' + (Math.random()+'').substring(2);
            var timer = setTimeout(function() {
                logfun('deleting session ' + sessionid + ' due to timeout');
                delete noxSessions[sessionid];
            }, 10000);
            if( noxSessions[sessionid] == null ) {
                noxSessions[sessionid] = { nox_rpc: noxRPC(),
                                           timer: timer,
                                           init: false };
                break;
            }
        }
        logfun('created nox session ' + sessionid);
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
                           ' due to disconnect');
                    delete noxSessions[sessionid];
                });

                // initialize session
                session.init = true;
                session.socketSession = {};
                session.socket = socket;
                session.domain = domain.create();

                logfun('attached socket to session ' + sessionid);
                session.nox_rpc.setSocket(socket, httpsessionstore, 
                                          session.socketSession, 
                                          session.domain);
            } else
                logfun('tried to attach two sockets to same session!');
        } else
            logfun('could not attach socket to nox session');
    }

    var httpSessions = {};

    var pages = {};

    function socketAuth(handshakeData, callback) {
        logfun('connecting socket with cookie ' + handshakeData.headers.cookie)
        logfun('matching with ' + cookiename + '=([^ ]+)');

        var m = getCookie(handshakeData);
        if( m ) {
            logfun('matched with ' + m);
            if( httpSessions[m] ) {
                logfun('authorizing socket ' + m);
                handshakeData.sessionStore = httpSessions[m];
                callback(null, true);
                return;
            }
        }
        logfun('declining sessionless socket');
        callback(null, false);
    }

    function socketConn(client_socket) {
        var sessionstore = null;
        
        // for socket.io 1.0
        if( typeof client_socket.client == 'object' ) 
            if( typeof client_socket.client.request == 'object' )
                if( typeof client_socket.client.request.sessionStore == 'object' )
                    sessionstore = client_socket.client.request.sessionStore;
        // for socket.io 0.9
        if( !sessionstore )
            if( typeof client_socket.handshake == 'object' )
                sessionstore = client_socket.handshake.sessionStore;
        
        if( sessionstore )
            logfun('new connection for ' + sessionstore.getCookie());
        else
            logfun('new connection whose session is unknown');
        
        client_socket.on('__session__', function(data) {
            initNoxSession(data.session, client_socket, 
                           sessionstore);
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

    logfun('installing nox-client.js');
    
    function get(req, res) {
        
        var cookie = getCookie(req);
        logfun('SESSION ' + req.method + ' ' + req.url + ' ' + (cookie ? cookie : '(no cookie)'));
        
        if( cookie ) {
            if( httpSessions[cookie] == null ) {
                logfun('storing session ' + cookie);
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
            logfun('refusing cookie-less request');
            res.writeHead(403);
            res.end();
            return;
        }

        var ref = null;
        if( req.query )
            if( req.query.ref )
                ref = req.query.ref;
        
        if( !ref ) {
            ref = req.headers['referer'];
            if( !ref )
                ref = req.headers['Referer'];
            if( !ref )
                ref = req.headers['referrer'];
            if( !ref )
                ref = req.headers['Referrer'];
            
            if( ref ) {
                ref = ref.match(/^https?:\/\/[^\/]+\/([^\x3f]*)(\x3f.*)?$/);
                if( ref )
                    ref = ref[1];
            }
        }
        
        if( !ref ) {
            logfun('nox-client.js requested with no referer');
            res.writeHead(404);
            res.end();
            return;
        }
        
        var page = pages['/' + ref];
        logfun('building nox-client.js for /' + ref);
        if( !page ) {
            logfun('nox-client.js not found for /' + ref);
            res.writeHead(404);
            res.end();
            return;
        }

        logfun('serving nox-client.js for ' + page.url);

        var result = [];
        async.waterfall([
            function(wfcb) {
                logfun('piping nox-rpc.js');
                fs.readFile(__dirname + '/nox-rpc.js', 'utf8', wfcb);
            },
            function(filestr, wfcb) {
                result.push(filestr);
                logfun('piping nox-client.js');
                fs.readFile(__dirname + '/nox-client.js', 'utf8', wfcb);
            },
            function(filestr, wfcb) {
                result.push(filestr);
                // create nox session
                var sessionid = createNoxSession();
                result.push('nox_rpc = noxRPC(\'' + sessionid + '\');\n');
                result.push('nox_rpc.setSocket(io.connect());\n');
                var nox_rpc = getNoxSession(sessionid);
                
                logfun('piping server modules');
                async.forEachSeries(page.server,
                                    function(mod, modcb) {
                                        try {
                                            logfun('loading ' + mod);
                                            var module = requirefun(mod);
                                            logfun('writing module stub to client');
                                            result.push('required_module(\'' + mod + '\', ' + 
                                                        callbackModule(nox_rpc, module, {}, module.noxAuth) + ');\n');
                                            modcb();
                                        } catch(err) {
                                            logfun('error loading module: ' + err);
                                            modcb(err);
                                        }
                                    },
                                    wfcb);
            },
            function(wfcb) {
                async.forEachSeries(
                    page.client,
                    function(modfile, modcb) {

                        var modname = modfile;
                        if( typeof modfile == 'object' ) {
                            modname = modfile.module;
                            modfile = modfile.file;
                        }

                        result.push('// module ' + modname + '\n' + 
                                    'var _exports = {};\n' + 
                                    'var _module = { exports: _exports };\n\n' +
                                    '(function(module, exports, ' + 
                                    'require, process) {\n');
                        
                        var modfilename = rootdir + modfile;
                        modfilename = path.normalize(modfilename);

                        fs.readFile(modfilename, 'utf8', function(err, filestr) {
                            if( err ) {
                                if( modfile.indexOf('./') == 0 ||
                                    modfile.indexOf('../') == 0 ) {
                                    modcb('module ' + modfile + ' not found');
                                } else {
                                    result.push('})();\n' +
                                                'required_module(\'' +
                                                modname + '\', ' + modname + ');\n\n');
                                    modcb();
                                }
                                return;
                            }
                            var moddir = path.dirname(modfile);
                            
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
                                    'required_module(\'' + modname + 
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
                        logfun('error minifying nox-client.js');
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
                       '/nox-client.js: ' + err);
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

