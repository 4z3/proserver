#! /usr/bin/env node

var port = 8000;

var root_path = (function () {
  var fs = require('fs');
  var path = require('path');
  return path.dirname(fs.realpathSync(__filename));
})();

function listener (req, res) {

  // don't time out...
  res.socket.setTimeout(0 * 60 * 1000);


  // TODO setup environment

  var options = {
    env: {}, //JSON.parse(JSON.stringify(process.env)),
    customFds: [-1, -1, 2]
  };

  options.env.METHOD = req.method;
  options.env.URL = req.url;

  var spawn = require('child_process').spawn;
  var path = require('path');
  var child  = spawn(path.join(root_path, 'server.sh'), [], options);

  var data = '';

  child.stdout.on('data', function (chunk) {
    data += chunk;
  });
  
  //child.stderr.on('data', function (chunk) {
  //  //var prefix = 'child stderr: ';
  //  //console.log(prefix +
  //  //    chunk.toString()
  //  //    .replace(/\n$/,'')
  //  //    .replace(/\n/g, '\n' + prefix)
  //  //);
  //});
  
  child.on('exit', function (code) {
    if (code === 0) {
      res.socket.end(data);
      //var content = data;
      //res.writeHead(200, {
      //  'Content-Type': 'text/plain',
      //  'Content-Length': content.length
      //});
      //res.end(content);
    } else {
      console.error('child exit:', code);
      res.writeHead(500, {
        'Content-Length': 0
      });
      res.end();
    };
  });

  //bufs: var data = [];
  //bufs: 
  //bufs: child.stdout.on('data', function (chunk) {
  //bufs:   data.push(chunk);
  //bufs: });
  //bufs: 
  //bufs: child.stderr.on('data', function (chunk) {
  //bufs:   console.log('child stderr: ' + chunk.toString().replace(/\n$/,''));
  //bufs: });
  //bufs: 
  //bufs: child.on('exit', function (code) {
  //bufs:   if (code === 0) {
  //bufs:     var content = join_buffers(data);
  //bufs:     res.writeHead(200, {
  //bufs:       'Content-Type': 'text/plain',
  //bufs:       'Content-Length': content.length
  //bufs:     });
  //bufs:     res.end(content);
  //bufs:   } else {
  //bufs:     console.error('child exit:', code);
  //bufs:     res.writeHead(500, {
  //bufs:       'Content-Length': 0
  //bufs:     });
  //bufs:     res.end();
  //bufs:   };
  //bufs: });
};

(function () {
  var https = require('https');
  var fs = require('fs');
  var path = require('path');

  var keys_path = path.join(root_path, 'test', 'fixtures', 'keys');

  var key_path = path.join(keys_path, 'agent2-key.pem');
  var cert_path = path.join(keys_path, 'agent2-cert.pem');

  console.log('key:', key_path);
  console.log('cert:', cert_path);

  var options = {
    key: fs.readFileSync(key_path),
    cert: fs.readFileSync(cert_path)
  };

  https.createServer(options, listener).listen(port, function () {
    console.log('Serving HTTPS on 0.0.0.0 port', port);
  });
})();

// suicide facility
(function () {
  process.on('SIGTERM', function () {
    console.log('Got SIGTERM ==> shutting down...');
    process.exit(0);
  });
  var fs = require('fs');
  //var self = dirname(process.argv[1]);
  var Inotify = require('inotify').Inotify;
  var inotify = new Inotify();
  inotify.addWatch({
    path: fs.realpathSync(__filename), // TODO all the files
    watch_for: Inotify.IN_ATTRIB
             | Inotify.IN_DELETE_SELF
             | Inotify.IN_MODIFY
             | Inotify.IN_MOVE_SELF
             ,
    callback: function (event) {
      process.kill(process.pid, 'SIGTERM');
    }
  });
})();

//bufs: function join_buffers(buffers) {
//bufs:   if (buffers instanceof Array) {
//bufs:     if (buffers.length > 0) {
//bufs:       var length = buffers.reduce(function (x, y) {
//bufs:         return x + y.length;
//bufs:       }, 0);
//bufs:       var buffer = new Buffer(length);
//bufs:       var targetStart = 0;
//bufs:       buffers.forEach(function (x) {
//bufs:         x.copy(buffer, targetStart);
//bufs:         targetStart += x.length;
//bufs:       });
//bufs:       return buffer;
//bufs:     } else {
//bufs:       return '';
//bufs:     };
//bufs:   };
//bufs: };
