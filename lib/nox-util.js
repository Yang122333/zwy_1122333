var assert = require('assert');

exports.safeCallback = function(timeout, cb) {
    if( typeof timeout == 'function' ) {
	cb = timeout;
	timeout = -1;
    }
    var applytimeout = null;
    var applyfun = function() {
	try {
	    if( applytimeout )
		clearTimeout(applytimeout);
	    var tmpcb = cb;
	    cb = null;
	    if( tmpcb ) {
		if( !arguments[0] )
		    tmpcb.apply({}, arguments);
		else
		    tmpcb.apply({}, [ arguments[0] ]);
	    }
	    // else
	    //    exports.log('double calling function');
	} catch(err) {
	    exports.log('error calling function: ' + err);
	}
    }
    if( typeof timeout == 'number' && timeout >= 0 )
	applytimeout = setTimeout(function() {
	    applytimeout = null;
	    applyfun('timeout');
	},  timeout);
    return applyfun;
}

exports.log = function(logstr) {
    process.stderr.write(logstr + '\n');
}

exports.deepCompare = function(obj1, obj2) {
    try {
	assert.deepEqual(obj1, obj2);
    } catch(err) {
	return false;
    }
    return true;
}

exports.deepCopy = function(obj, stack) {
    if( typeof stack != 'number' )
	stack = 0;
    if( stack >= 10 ) {
	exports.log('stack overflowing at deepCopy');
	return null;
    }
    if( typeof obj == 'object' ) {
	if( Array.isArray(obj) ) {
	    var copy = [];
	    for( var ai = 0; ai < obj.length; ai++ )
		copy.push(exports.deepCopy(obj[ai], stack+1));
	    return copy;
	} else if( obj ) {
	    var copy = {};
	    for( var key in obj )
		copy[key] = exports.deepCopy(obj[key], stack+1);
	    return copy;
	} else
	    return null;
    }
    return obj;
}

exports.criticalSection = function(sectionname) {
    var blocked = false;
    var queue = [];
    var retobj = {
	enterFun: function() {
	    var timer = null, timercount = 0;
	    return function(callback) {
		if( blocked ) {
		    timer = setInterval(function() { 
			exports.log('have been waiting for ' + ((timercount++) * 10) + ' seconds at ' + sectionname); 
		    }, 10000);
		    queue.push(function() {
			clearInterval(timer);
			callback();
		    });
		} else {
		    blocked = true;
		    callback();
		}
	    }
	},
	exitFun: function() {
	    return function(callback) {
		if( queue.length > 0 ) {
		    var next = queue.shift();
		    process.nextTick(next);
		} else 
		    blocked = false;
		callback();
	    }
	},
	wrap: function(fun) {
	    return function() {
		var origargs = arguments;
		var origcb = origargs[origargs.length - 1];
		
		var callbackargs = null;
		
		retobj.enterFun()(function() {
		    origargs[origargs.length-1] = function() {
			callbackargs = arguments;
			retobj.exitFun()(function() {
			    origcb.apply({}, callbackargs);
			});
		    }
		    fun.apply({}, origargs);
		});
	    }
	}
    }
    return retobj;
}
