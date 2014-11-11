

function noxRPC(sessionId) {
    var callbacks = {};
    var session = sessionId;

    function createCallback(fun, auth) {
        if( typeof fun.noxCB != 'string' )
            fun.noxCB = '__callback__' + (Math.random()+'').substring(2);
        if( callbacks[fun.noxCB] == null ) {
            callbacks[fun.noxCB] = {
                fun: fun,
                auth: auth 
            }
        }
        return fun.noxCB;
    }

    function importArg(obj) {
        switch(typeof obj) {
        case 'string':
            if( obj.indexOf('__callback__') == 0 )
                return function(cbid) {
                    return function() {
                        rpcCall(cbid, arguments);
                    }
                }(obj);
            return obj;
        case 'object':
            if( obj == null )
                return null;
            if( isArray(obj) ) {
                var retobj = [];
                for( var ai = 0; ai < obj.length; ai++ )
                    retobj.push(importArg(obj[ai]));
                return retobj;
            }
            var retobj = {};
            for( var ai in obj )
                retobj[ai] = importArg(obj[ai]);
            return retobj;
        default:
            return obj;
        }
    }

    function importArgs(argArray) {
        var res = [];
        for( var ai = 0; ai < argArray.length; ai++ )
            res.push(importArg(argArray[ai]));
        return res;
    }

    var isBuffer = function() {
        if( typeof Buffer == 'undefined' )
            return function() { return false; }
        else
            return function(obj) { return Buffer.isBuffer(obj); }
    }();

    var isArray = function() {
        if( typeof Array == 'undefined' )
            return function(obj) { 
                return Object.prototype.toString.call(obj) === '[object Array]';
            }
        return function(obj) {
            return Array.isArray(obj);
        }
    }();
    
    function exportArg(obj) {
        switch(typeof obj) {
        case 'function':
            return createCallback(obj);
        case 'object':
            if( obj == null )
                return null;
            if( isArray(obj) ) {
                var retobj = [];
                for( var ai = 0; ai < obj.length; ai++ )
                    retobj.push(exportArg(obj[ai]));
                return retobj;
            }
            if( isBuffer(obj) )
                return obj.toString('utf8');
            var retobj = {};
            for( var ai in obj )
                retobj[ai] = exportArg(obj[ai]);
            return retobj;
        default:
            return obj;
        }
    }

    function exportArgs(argArray) {
        var res = [];
        for( var ai = 0; ai < argArray.length; ai++ )
            res.push(exportArg(argArray[ai]));
        return res;
    }
    
    var socketConnected = false;
    function isConnected() {
        return socketConnected;
    }

    var listeners = [];
    function addListener(list) {
        listeners.push(list);
    }
    
    var socket = null;
    function setSocket(_socket, _httpsessionstore, _socketsession, _domain) {

        socket = _socket;
        if( _domain ) {
            _domain.socket = _socket;
            _domain.httpSessionStore = _httpsessionstore;
            _domain.socketSession = _socketsession;
        }

        if( session ) // client only
            socket.emit('__session__', { session: session });
        socket.on('connect', function() {
            socketConnected = true;
            for( var li = 0; li < listeners.length; li++ )
                listeners[li]('connect');
        });
        socket.on('disconnect', function() {
            socketConnected = false;
            for( var li = 0; li < listeners.length; li++ )
                listeners[li]('disconnect');
        });
        socket.on('__callback__', function(data) {
            var cb = callbacks[data.callback];
            if( typeof process != 'undefined' ) { // if we are at server side
                _httpsessionstore.get(_domain.bind(function(err, current) {
                    if( err )
                        current = {};
                    _domain.httpSession = current;
                    if( cb.auth && !current[cb.auth] )
                        return; // do nothing
                    else
                        cb.fun.apply({}, importArgs(data.args));
                }));
            } else {
                cb.fun.apply({}, importArgs(data.args));
            }
        });
    }


    function rpcCall(cbid, args) {
        socket.emit('__callback__',
                    { callback: cbid,
                      args: exportArgs(args) });
    }

    return {
        setSocket: setSocket,
        isConnected: isConnected,
        addListener: addListener,
        rpcCall: rpcCall,
        createCallback: createCallback
    }
}

if( typeof module != 'undefined' ) {
    exports.noxRPC = noxRPC;
}
