var async = require('async');
var util = require('./nox-util.js');

exports.noxState = function(statename, autocheckinterval, idattr) {
    
    var retobj = {};

    if( typeof idattr != 'string' || idattr == '' )
	idattr = 'id';

    var state = {};
    var statecounter = 0;

    var listeners = [];
    var csect = util.criticalSection('state' + (statename ? '-' + statename : ''));

    retobj.listen0 = csect.wrap(function(listenerid, listener, callback) {
	    
        if( typeof callback != 'function' )
	    callback = function() {}
        if( typeof listener != 'function' )
	    return callback('invalid listener callback');

	var newlistener = {
	    id: listenerid,
	    listener: listener,
	    state: {},
	    statecounter: 0
	};
	listeners.push(newlistener);

	// in this order:
	callback();
	updateListener(newlistener);
	retobj.start(); // auto checks, if any
    });
    
    function updateListener(listener) {
	if( !listener )
	    return;
	if( listener.statecounter == statecounter && typeof autocheckinterval != 'number' )
	    return;

	var prev = listener.state;
	var update = {};
	for( var ai in state ) {

	    if( util.deepCompare(state[ai], prev[ai]) )
		continue;

	    var atype = typeof state[ai];
	    if( atype == 'undefined' || atype == 'function' )
		continue;

	    if( atype == 'object' && Array.isArray(state[ai]) ) {
		    
		var remove = [], add = [], change = [], set = [];
		
		var prevarea = prev[ai];
		if( typeof prevarea == 'undefined' )
		    prevarea = [];
		var curarea = state[ai];
		
		var makeset = false;
		// removed and updated objects
		for( var oi = 0; oi < prevarea.length; oi++ ) {
		    var oid = prevarea[oi][idattr], found = null;
		    for( var ci = 0; ci < curarea.length; ci++ ) {
			if( curarea[ci][idattr] == oid ) {
			    found = curarea[ci];
			    break;
			}
		    }
		    if( !found )
			remove.push(util.deepCopy(prevarea[oi]));
		    else { // check for updates in object state
			if( !util.deepCompare(prevarea[oi], found) )
			    change.push(util.deepCopy(found));
		    }
		}
		
		// new objects
		for( var ci = 0; ci < curarea.length; ci++ ) {
		    var cid = curarea[ci][idattr], found = false;
		    if( typeof curarea[ci][idattr] == 'undefined' ) {
			makeset = true;
			break;
		    }
		    for( var oi = 0; oi < prevarea.length; oi++ ) {
			if( prevarea[oi][idattr] == cid ) {
			    found = true;
			    break;
			}
		    }
		    if( !found )
			add.push(util.deepCopy(curarea[ci]));
		}		
		
		// test for ordering
		if( !makeset ) {
		    var test = [];
		    for( var ri = 0; ri < prevarea.length; ri++ )
			test.push(prevarea[ri][idattr]);
		    for( var ri = 0; ri < remove.length; ri++ ) {
			for( var ti = 0; ti < test.length; ti++ )
			    if( test[ti] == remove[ri][idattr] ) {
				test.splice(ti, 1);
				break;
			    }
		    }
		    for( var ri = 0; ri < add.length; ri++ )
			test.push(add[ri][idattr]);
		    
		    // compare and test whether other than add/remove ordering occurred
		    for( var ri = 0; ri < curarea.length; ri++ ) {
			if( curarea[ri][idattr] != test[ri] ) {
			    // remove all, re-add all to reorder correctly
			    makeset = true;
			    break;
			}
		    }
		}

		if( makeset ) {
		    remove = []; add = []; change = [];
		    for( var ti = 0; ti < curarea.length; ti++ )
			set.push(util.deepCopy(curarea[ti]));
		}

		var uobj = {};
		if( set.length > 0 )
		    uobj.set = set;
		else {
		    if( add.length > 0 )
			uobj.add = add;
		    if( remove.length > 0 )
			uobj.remove = remove;
		    if( change.length > 0 )
			uobj.update = change;
		}
		
		update[ai] = uobj;
		
		continue;
	    }
	    
	    // report updated value / object
	    update[ai] = util.deepCopy(state[ai]);
	}
	
	// only update if necessary
	if( util.deepCompare(update, {}) == false ) {
	    try {
		listener.listener(null, listener.statecounter, statecounter, update);
	    } catch(err) {
	    }
	}

	listener.statecounter = statecounter;
	listener.state = util.deepCopy(state);
    }

    var autochecktimer = null;
    retobj.start = function() {
	if( !autochecktimer && typeof autocheckinterval == 'number' ) {
	    if( autocheckinterval <= 0 )
		autocheckinterval = 100;
	    
	    var insideautocheck = false;
	    var autochecktimer = setInterval(function() {
		if( insideautocheck )
		    return;
		insideautocheck = true;
		csect.enterFun()(function() {
		    // entered csect
		    for( var li = 0; li < listeners.length; li++ )
			updateListener(listeners[li]);
		    csect.exitFun()(function() {
			// state checked, exiting csect
			insideautocheck = false;
		    });
		});
	    }, autocheckinterval);
	}
    }

    retobj.stop = function() {
	if( autochecktimer ) {
	    clearInterval(autochecktimer);
	    autochecktimer = null;
	}
    }

    retobj.update0 = csect.wrap(function(counter, updatefun, callback) {
	if( counter >= 0 && counter != statecounter )
	    return callback('invalid state counter');

	// always update counter
	statecounter++;

	async.waterfall([
	    function(wfcb) {
		wfcb = util.safeCallback(wfcb);
		try {
		    // do something to state
		    updatefun(state, wfcb);
		} catch(err) {
		    wfcb(err);
		}
	    },
	    function(wfcb) {        
		for( var li = 0; li < listeners.length; li++ )
		    updateListener(listeners[li]);
		wfcb();
	    }
	], callback);
    });
    
    return retobj;
}
