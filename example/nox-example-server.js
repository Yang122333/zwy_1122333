var fs = require('fs');
var http = require('http');
var express = require('express');

var expressServer = express();
var httpServer = http.createServer(expressServer);

expressServer.use(express.cookieParser());
expressServer.use(express.session({    
    key: 'nox-test.sid', 
    secret: 'cookie-secret-34987326782',
    cookie: { path: '/', httpOnly: true, maxAge: 100000000 }
}));

expressServer.use(expressServer.router);
expressServer.use(express.static(__dirname));

var noxapp = require('../lib/nox-server.js').nox(
    function(str) { return require(str); },
    'nox-test.sid', 
    function(str) { process.stdout.write(str); });

expressServer.get('/nox-client.js', noxapp.get);

var socketServer = require('socket.io').listen(httpServer);
socketServer.set('authorization', noxapp.socketAuth);
socketServer.on('connection', noxapp.socketConn);

var examples = [ 'nssh', 'crud', 'img', 'session', 'chat' ];

for( var ei = 0; ei < examples.length; ei++ )
    noxapp.page('/' + examples[ei] + '/client.html',
		[ 'async', './' + examples[ei] + '/' + examples[ei] + '.js' ],
		[ './' + examples[ei] + '/client.js' ]);

noxapp.page('/async/client.html',
	    [ 'fs', 'async' ],
	    [ './async/client.js' ]);

httpServer.listen(8080);
