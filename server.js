#! /usr/bin/env node

var port = 8000;

var root_path = (function () {
  var fs = require('fs');
  var path = require('path');
  return path.dirname(fs.realpathSync(__filename));
})();


var handle_externally = (function () {

  return function (req, res, options, callback) {
    var log = options.log;
    var env = JSON.parse(JSON.stringify(options.env)); // copy

    env.METHOD = req.method;
    env.URL = req.url;

    var spawn = require('child_process').spawn;
    var path = require('path');
    var child  = spawn(path.join(root_path, 'server.sh'), [], { env: env });

    var data = '';

    child.stdout.on('data', function (chunk) {
      data += chunk;
    });
    
    child.stderr.on('data', function (chunk) {
      log.raw(chunk.toString(), '[31m');
    });
    
    child.on('exit', function (code) {
      log.format('child', 'exit', code);
      if (code === 0) {
        res.socket.end(data);
        //var content = data;
        //res.writeHead(200, {
        //  'Content-Type': 'text/plain',
        //  'Content-Length': content.length
        //});
        //res.end(content);
      } else {
        res.writeHead(500, {
          'Content-Length': 0
        });
        res.end();
      };

      callback();
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
})();

function identity(x) { return x };
function replace_properties(dst, src, mod) {
  dst_key_mod = mod.dst_key_mod || identity;
  src_val_mod = mod.src_val_mod || identity;

  Object.keys(src).forEach(function (key) {
    dst[dst_key_mod(key)] = src_val_mod(src[key]);
  });
};

function listener (req, res) {

  // don't time out...
  res.socket.setTimeout(0 * 60 * 1000);

  var log = require('./log').create();

  log.raw([req.method, req.url, 'HTTP/' + req.httpVersion].join(' '));
  log.format(req.headers);
  var re = new RegExp('^multipart/form-data(?:;|$)');
  if (re.test(req.headers['content-type'])) {
    var form = new require('formidable').IncomingForm();

    form.parse(req, function(err, fields, files) {

      (function pretty_print_form () {
        var pretty = {};
        Object.keys(fields).forEach(function (key) {
          pretty[key] = fields[key];
        });
        Object.keys(files).forEach(function (key) {
          pretty[key] = {};
          [ 'name', 'size', 'type', 'path'
          ].forEach(function (property) {
            pretty[key][property] = files[key][property];
          });
        });
        log.format(pretty);
      })();

      // TODO whitelist fields and files?
      var env = {};
      replace_properties(env, fields, {
        dst_key_mod: function (key) {
          return 'TEXT_' + key;
        }
      });
      replace_properties(env, files, {
        dst_key_mod: function (key) {
          return 'FILE_' + key;
        },
        src_val_mod: function (value) {
          return value.path;
        }
      });

      handle_externally(req, res, { log: log, env: env }, function () {
        var fs = require('fs');
        Object.keys(files).forEach(function (key) {
          var file = files[key];
          fs.unlink(file.path, function (exn) {
            log.format('unlink', file.path, exn);
          });
        });
      });
    });

  } else {
    handle_externally(req, res, { log: log, env: {} }, function () {
      // nop
    });
  };
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
