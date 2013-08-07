var childp = require('child_process');

exports.open = function(outcb, callback) {
    var proc = childp.spawn('sh', []);
    proc.stdout.on('readable', function() {
	var buf = proc.stdout.read();
	if( buf )
	    outcb(buf.toString('utf8'));
    });
    proc.stderr.on('readable', function() {
	var buf = proc.stderr.read();
	if( buf )
	    outcb(buf.toString('utf8'));
    });
    callback(function(str) {
	proc.stdin.write(str + '\n');
    });
}
