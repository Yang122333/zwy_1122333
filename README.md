Nox.js - an easier way to write Node.js web apps
===

* <a href="#how-does-it-work">How Does It Work?</a>
* <a href="#getting-started">Getting Started</a>
* <a href="#examples">Examples</a>
* <a href="#api-reference">API Reference</a>
* <a href="#license">License (MIT)</a>

Nox enables you to fluently mix browser-side JavaScript and server-side Node.js code like this:

```javascript
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
```

Nox is an __experiment to boost developer producitivy__ by

* having __minimal learning curve__, just get coding without having to spend time studying Nox itself.
* maximizing __code reuse__ by using the exact same codebase in client and server
* allowing a __JavaScript API__ to be used in the browser, instead of building a REST API and making Ajax calls
* keeping the codebase __unit testable__ in the back end, including the browser parts (a work in progress)

Nox is still in an experimental phase, but it is fun to play around with; it doesn't get in your way at all, and lets you focus on writing the actual application logic instead of learning platform quirks. (Unlike some web MVC frameworks not mentioned here.) 

## How Does It Work?

Nox works by wrapping and compiling all JavaScript modules into a single JavaScript bundle (usually named nox-client.js), that is included inside each HTML page using Nox.

* For JavaScript that is executed locally in the browser, this wrapping pretty much only includes a closure with the CommonJS require() and module.exports, optionally uglifying the result.

* For JavaScript code executed on the server, all functions exported by the module are wrapped inside a function which, when called in the browser, serialize the arguments and send them over a websocket connection to the server. 

This means that 

* only JSON stringifiable arguments can be used, with the notable addition of functions; for function arguments, a unique callback id is generated and passed to server, enabling the server to call the callback when appropriate.

* all remote functions called must be asynchronous (e.g. deliver the result via a callback), which fortunately is the standard way of working with Node.js.

* if the websocket connection is lost, your callbacks never get called. To mitigate this problem, you can 
  - add a listener to detect socket connectivity events 
  - use modules like <a href="https://github.com/creationix/safereturn">safereturn</a> to give your callback a timeout

### Security & Authentication

The JavaScript modules available to each web page are defined on the server side. While also native Node.js modules can be exposed, typically it is an application-specific module that exports the kind of API that the web app would need. 

This means that Nox does not allow an adversary to just make `fs` calls on your server filesystem (like the example at the top of this page) unless the server permits that. (Exposing built-in modules should not be done except when building desktop apps with a browser UI, which is BTW an interesting use case).

When using Nox, you can do user authentication exactly as you have been doing it before; when a connection is established, Nox checks that there is a HTTP session matching the cookie or declines the connection if one is not found. 

For each remote call coming to the server, Nox fetches the HTTP session associated to that connection and adds it to the currently active domain, where it can be accessed like this:

```
function getUserName(callback) {
  var username = domain.active.httpSession.username;
  if( username )
    callback(null, { name: username });
  else
    callback('Not Authorized');
}
```

If you need to access the session information in some other modules, you will need to either pass session information around in function arguments, or make sure that the domain is bound to all subsequent events and callbacks when executing the remote function call.

Nox relies on browser websocket implementations to secure the contents of the function calls. Each generated nox-client.js bundle includes a unique identifier that is used, together with the cookie, to identify the caller. 

### Unit Testing

JavaScript modules used by Nox can be run in Node.js as such via command line. This enables easy unit testability of back- and front-end code together.

A more complete out-of-the-box capability of running tests would include either running them in the browser (or PhantomJS) or instantiating a JSDOM environment in which the code is executed. This has not yet been implemented but has been thought about. Contributors welcome.

## Getting Started

This guide describes how to get up and running with Nox.

### Server side       

On server side, you need to install nox via

```
npm install nox
```

Then, create a nox app like this:

```javascript
var noxapp = require('nox').nox(
    function(str) { return require(str); },
    'nox-test.sid');
```

The first argument to is a function that requires a module - it is needed for the nox library to be able to require modules relative to current path (vs. the path where nox is installed). The second argument is a sid that is used to match HTTP session cookies to websocket connections, so it should match what you passed to `express.session()`.

After that, you can attach the `/nox-client.js` (or you name it) to your HTTP server, like this:

```javascript
expressServer.get('/nox-client.js', noxapp.get);
```

and attach the websocket connections like this:

```javascript
var socketServer = require('socket.io').listen(httpServer);
socketServer.set('authorization', noxapp.socketAuth);
socketServer.on('connection', noxapp.socketConn);
```

After that, you need to specify which pages are allowed to use Nox, and which remote and local modules are allowed for each page, like this:

```javascript
noxapp.page('/async/client.html', // when serving page /async/client.html
            [ 'fs' ],             // bundle remote interface for fs calls
            [ './async/client.js' ]);  // and bundle async/client.js locally
```

Nox actually uses the HTTP Referrer header to deduce which page Nox is being requested for.

A complete example server using Nox can be found in the examples directory.

### Client side

On client side, you need to just include relevant JavaScript files to each HTML page, for example:

```html
    <script src="/socket.io/socket.io.js"></script>
    <script src="/nox-client.js"></script>
```

And that's it! Typically there is a JavaScript module for each page that actually starts calling `$(document).ready` and so on to initialize the page, which is included in the `nox-client.js` bundle.

## Examples

These examples can be run in the `example/` directory by saying `node nox-example-server.js` and going to `localhost:8080/nssh/client.html` or similar for each example. Make sure you are in that directory when starting `node` in order for the module file paths to match.

### Non-Secure Shell

Probably the most insecure shell ever written, this example opens a local shell on your server and lets you do anything (requires node v0.10+ for its use of streams)

![Screenshot](https://github.com/asaarinen/nox.js/raw/master/doc/nssh.png)

Server-side code:

```javascript
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

```

Client-side code:

```javascript
var nssh = require('./nssh.js');

$(document).ready(function() {
    nssh.open(
        function(outstr) {
            var rows = outstr.split('\n');
            for( var ri = 0; ri < rows.length; ri++ ) {
                var li = document.createElement('li');
                $(li).text(rows[ri]).css('color', '#0f0f0f');
                $('ul').append(li);
            }
        },
        function(infun) {
            $('input').keypress(function(event) {
                if( event.keyCode == 13 ) {
                    var cmd = $('input').val();
                    $('input').val('');
                    var li = document.createElement('li');
                    $(li).text('$ ' + cmd).css('color', '#54f75d');
                    $('ul').append(li);
                    infun(cmd);
                }
            });
        });
});
```

### Basic CRUD app

This basic CRUD app just shows how to add components to a NeDB database:

![Screenshot](https://github.com/asaarinen/nox.js/raw/master/doc/crud.png)

Server-side code:

```javascript
var Datastore = require('nedb');
var db = new Datastore();

exports.create = function(name, callback) {
    db.insert({name: name}, callback);
}

exports.update = function(id, newname, callback) {
    db.update({ _id: id }, { $set: { name: newname } }, callback);
}

exports.remove = function(id, callback) {
    db.remove({ _id: id }, {}, callback);
}

exports.list = function(callback) {
    db.find({}, callback);
}
```

Client-side code:

```javascript
var crud = require('./crud.js');

function updatelist(err) {
    crud.list(function(err, people) {
        $('ul').empty();
        for( var pi = 0; pi < people.length; pi++ ) {
            var fun = function(id, name) {
                var li = document.createElement('li');
                $(li).append('<span>' + name + ' (' + id + ')</span>' + 
                             '<button class="update">Update</button>' +
                             '<button class="remove">Remove</button>');
                $(li).children('button.update').click(function() {
                    var newname = prompt('New name', name);
                    if( newname )
                        crud.update(id, newname, updatelist);
                });
                $(li).children('button.remove').click(function() {
                    crud.remove(id, updatelist);
                });
                $('ul').append(li);
            };
            fun(people[pi]._id, people[pi].name);
        }
    });
}

$(document).ready(function() {
    updatelist();
    $('input').keypress(function(event) {
        if( event.keyCode == 13 ) {
            var name = $('input').val();
            $('input').val('');
            crud.create(name, updatelist);
        }
    });
});
```

### Image Thumbnail Generator

This code fetches image URLs and generates thumbnails, which are displayed on the webpage:

![Screenshot](https://github.com/asaarinen/nox.js/raw/master/doc/img.png)

Server-side code:

```javascript
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
```

Client-side code:

```
var img = require('./img.js');

$(document).ready(function() {
    $('input').keypress(function(event) {
        if( event.keyCode == 13 ) {
            var name = $('input').val();
            $('input').val('');
            img.getThumbnail(name, 128, function(err, imgurl) {
                if( err )
                    alert(err);
                else
                    $('div').append('<img style="float: left;" src="' + imgurl + '" />');
            });
        }
    });
});
```

### Session Login 

This example demonstrates a simple login form that can be used to authenticate users. 

![Screenshot](https://github.com/asaarinen/nox.js/raw/master/doc/session.png)

Server-side code:

```javascript
var domain = require('domain');

exports.login = function(name, password, callback) {
    if( domain.active.httpSession.username )
        callback('already logged in');
    else {
        if( name + 'pass' == password ) {
            // domain.active.httpSession is just a copy, so we have to
            // modify the original in the session store
            domain.active.httpSessionStore.modify(function(sess, cb) {
                sess.username = name;
                cb();
            }, callback);
        } else
            callback('invalid password');
    }
}

exports.logout = function(callback) {
    domain.active.httpSessionStore.modify(function(sess, cb) {
        delete sess.username;
        cb();
    }, callback);
}

exports.getUserName = function(callback) {
    callback(null, domain.active.httpSession.username);
}
```

Client-side code:

```javascript
var session = require('./session.js');

function updateStatus(err) {
    if( err )
        alert('Error: ' + err);
    session.getUserName(function(err, name) {
        if( name ) {
            $('#status').text('Logged in as ' + name);
            $('#controls').empty();
            $('#controls').append('<button>Log out</button>');
            $('#controls button').click(function() {
                session.logout(updateStatus);
            });
        } else {
            $('#status').text('Logged out');            
            $('#controls').empty();
            $('#controls').append(
                '<p>Log in as:<input id="username" placeholder="Name"></p>' + 
                '<p>Password:<input id="password" placeholder="Password"></p>' + 
                '<button>Log in</button>');
            $('#controls button').click(function() {
                session.login($('#username').val(),
                              $('#password').val(), updateStatus);
            });
        }
    });
}

$(document).ready(function() { updateStatus(); });
```

### Chat server

Chat server example is a trivial chat server that broadcasts all messages to every other participant.

![Screenshot](https://github.com/asaarinen/nox.js/raw/master/doc/chat.png)

Server-side code:

```javascript
var domain = require('domain');

var users = {};
var activeusers = {};

exports.send = function(message) {
    if( !domain.active.socketSession.username )
        return;
    for( var ai in activeusers )
        activeusers[ai](domain.active.socketSession.username, message);
}

exports.login = function(name, password, recvfun, callback) {
    if( users[name] == null )
        users[name] = password;

    if( users[name] == password && password ) {
        domain.active.socketSession.username = name;
        var sessionid = (Math.random() + '').substring(2);
        activeusers[sessionid] = recvfun;
        domain.active.socket.on('disconnect', function() {
            delete activeusers[sessionid];
        });
        callback();
    }  else
        callback('error logging in');
}
```

Client-side code:

```javascript
var chat = require('./chat.js');
var async = require('async');

var username = null;

function receiveChat(username, message) {
    $('table').append('<tr><td>' + username + ':</td><td>' + message + '</td>');
}

function sendChat() {
    var msg = $('input').val();
    $('input').val('');
    chat.send(msg);
}

$(document).ready(function() {
    $('input').keypress(function(event) {
        if( event.keyCode == 13 )
            sendChat();
    });

    username = prompt('User name:');
    var password = prompt('Password (make up one if you are logging ' + 
                          'in for the first time):');
    chat.login(username, password, receiveChat, function(err) {
        if( err )
            alert('Invalid username or password. Please refresh the ' + 
                  'page to try againlogin again.');
        else
            $('h1').text('Nox Chat - Logged in as ' + username);
    });
});
```

## API Reference

### Prerequisites

Nox has been developed to work together with Express and Socket.IO. Alternative HTTP / websocket libraries could be used with minor modifications to the `get`, `socketAuth` and `socketConn` functions to match those of the alternative platform.

### Creating a Nox application

The entry point to Nox is `nox()` function exported by requiring `nox`:

`var noxapp = require('nox').nox(requirefun, cookiename, logfun, uglify);`

The arguments of which are listed below:

| Argument | Description |
| --- | --- |
| `requirefun` | a function that returns a required module. This is passed in order to let Nox import modules with desired path. Typically it is passed `function(str) { return require(str); }` |
| `cookiename` | the sid of the cookie which is used to store HTTP sessions. This should match the sid passed to `express.session()` or similar if using other framework than Express. Optional, defaults to `'nox.sid'` |
| `logfun` | a function that is called when Nox logs its inner workings; for example, `function(str) { process.stderr.write(str + '\n'); }`. Optional |
| `uglify` | if true, runs generated `nox-client.js` through UglifyJS before passing it to the client. Optional |

Returns a Nox application object with the following functions: 

| Function | Description |
| --- | --- |
| `noxapp.get` | the function that generates `nox-client.js`, should be passed to Express like this: `express.get('/nox-client.js', noxapp.get)` |
| `noxapp.page` | the function used to add pages to nox, see below |
| `noxapp.socketAuth` | this function should be called when the websocket `authorization` event arrives, for example: `socketServer.set('authorization', noxapp.socketAuth);` |
| `noxapp.socketConn` | this function should be called when a websocket connection has been created, for example: `socketServer.on('connection', noxapp.socketConn);` |

### Adding pages to a Nox application

The most important function which defines how your Nox app behaves is `noxapp.page()`. It defines remote and local modules available to each web page, like this:

`noxapp.page('/example.html', [ 'fs', 'async', './lib.js' ], [ './example.js' ]);`

The arguments are referenced in more detail below:

| Argument | Description | 
| --- | --- |
| `url` | The server URL of the page being served. When requesting `nox-client.js`, Nox matches this url to the HTTP Referrer headers to find out which page is being requested. |
| `server_modules` | An array listing all server-side modules that should be available in the generated `nox-client.js` file for this url. Remote function wrappers are created for all exported functions in these modules. |
| `client_modules` | An array listing all module file names that are bundled for local execution in the browser. Built-in Node.js modules cannot be included to this array. |

Note: if you want to be able  to `require()` 3rd-party JavaScript code, you can just include the necessary `<script>` tags in the HTML before `/nox-client.js`, and refer to them in the `client_modules` array by name. For example, you could include

`<script src="/js/async.js"></script>` 

to your HTML, and add `'async'` to your `client_modules` array; after that you can say `var async = require('async');` in the client code.

### Domains and Sessions

When any remote function is being called, the current HTTP session is bound to the active domain before making the call. In fact, the currently active domain has the following additional properties:

`domain.active.socket`

The actual Socket.IO connected socket. If your app maintains an array of active sessions in order to broadcast callbacks to all of them, for example in a chat application, it is practical to listen for the `disconnect` event in order to drop disconnected clients.

`domain.active.socketSession = {}`

An initially empty object, you can set values to it which will be stored for the lifetime of the websocket connection.

`domain.active.httpSession`

The actual HTTP session as fetched from the session store. Please note that this object is just a copy, so if you want to modify the session, you will need to make those changes using the `httpSessionStore`.

`domain.active.httpSessionStore`

The session store. When the `/nox-client.js` file is requested using `noxapp.get(req, res)`, the session store of the request is stored together with its cookie, and used to set and get the session for websocket callbacks. It has the following methods:

`getCookie()` - returns the cookie associated to this session

`get(function(err, session) {})` - gets the session associated to that cookie

`set(sess, function(err) {})` - stores a modified session to the session store

`modify(function(sess, callback) {}, function(err) {})` - convenience method for modifying the session, internally calling `get`, then the provided function which modifies the session, and then stores it using `set`, and returns to the second callback after the session has been stored.

### Socket connectivity events

In the client side code, there is a global `nox_rpc` variable that you can use to listen on socket connectivity events, like this:

```javascript

nox_rpc.addListener(function(status) {
    // status is either 'connect' or 'disconnect'                     
});

// or you can query the status synchronously

var connected = nox_rpc.isConnected();

```

## Browser Support

Nox should work in all browsers where Socket.IO works (see <a href="http://socket.io/#browser-support">here</a>). However it has not been tested extensively in all browsers yet.

## License

(The MIT License)

Copyright (c) 2013 Antti Saarinen &lt;antti.p.saarinen@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.