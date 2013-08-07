var fs = require('fs');
var async = require('async');

$(document).ready(function() {
    async.waterfall([
	function(wfcb) {
	    fs.readdir('.', wfcb);
	},
	function(files, wfcb) {
	    async.eachSeries(files, function(filename, filecb) {
		async.waterfall([
		    function(wfcb2) {
			fs.stat(filename, function(err, stats) {
			    if( err ) 
				stats = { size: 'n/a' }
			    wfcb2(null, stats);
			});
		    },
		    function(stats, wfcb2) {
			var li = document.createElement('li');
			$(li).text(filename + ' ' + stats.size);
			$('ul').append(li);
			wfcb2();
		    }
		], filecb);
	    }, wfcb);
	}
    ], function(err) {
	if( err )
	    alert('Error listing files: ' + err);
    });
});
