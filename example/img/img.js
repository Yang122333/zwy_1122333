var async = require('async');
var http = require('http');
var fs = require('fs');
var childp = require('child_process');

exports.getThumbnail = function(imgurl, thumbsize, callback) {
    var ext = imgurl.match(/(\.[^\.]+)\?.+$/);
    if( ext )
	ext = ext[1];
    if( !ext )
	ext = '';

    var basename = 'tmpimg' + (Math.random() + '').substring(2);

    async.waterfall([
	function(wfcb) {
	    http.get(imgurl, function(res) { 
		res.pipe(fs.createWriteStream(basename + ext));
		res.on('end', function() { wfcb(); });
	    }).on('error', function(err) {
		wfcb(err);
	    });
	},
	function(wfcb) {
	    var proc = childp.spawn('gm', 
				    [ 'convert', basename + ext,
				      '-resize', thumbsize + 'x' + thumbsize, 
				      basename + thumbsize + ext ]);
	    proc.on('close', function(exitcode) {
		if( exitcode )
		    wfcb('error converting image');
		else
		    wfcb();
	    });
	}
    ], function(err) {
	callback(err, '/' + basename + thumbsize + ext);
    });
}



