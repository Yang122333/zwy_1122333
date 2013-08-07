var fs = require('fs');
var async = require('async');

$(document).ready(function() {
    async.waterfall([
	function(wfcb) {
	    fs.readdir('.', wfcb);
	},
	function(files, wfcb) {
	    async.eachSeries(files, function(filename, filecb) {
		fs.stat(filename, function(err, stats) {
		    if( err ) 
			stats = { size: 'n/a' }
		    var li = document.createElement('li');
		    $(li).text(filename + ' ' + stats.size);
		    $('ul').append(li);
		    filecb();
		});
	    }, wfcb);
	}
    ], function(err) {
	if( err )
	    alert('Error listing files: ' + err);
    });
});
