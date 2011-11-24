#! /usr/bin/env node

var port = 8000;

var root_path = (function () {
  var fs = require('fs');
  var path = require('path');
  return path.dirname(fs.realpathSync(__filename));
})();


var handle_externally = (function () {

  var spawn = require('child_process').spawn;
  var path = require('path');

  return function (req, res, options, callback) {
    var log = options.log;
    var env = JSON.parse(JSON.stringify(options.env)); // copy

    env.METHOD = req.method;
    env.URL = req.url;

    var child = (function () {
      var command = path.join(root_path, 'server.sh');
      var spawn_options = {
        cwd: root_path,
        env: env
      };

      log.format('spawn', { command: command, options: spawn_options });

      return spawn(command, [], spawn_options);
    })();

    // TODO minimal buffering
    var data = [];

    child.stdout.on('data', function (chunk) {
      data.push(chunk);
    });
    
    child.stderr.on('data', function (chunk) {
      log.raw(chunk.toString(), '[31m');
    });
    
    child.on('exit', function (code) {
      log.format('child', 'exit', code);
      if (code === 0) {
        // TODO do we have a use case to not generate the whole HTTP response?
        data.forEach(function (chunk) {
          res.socket.write(chunk);
        });
        res.socket.end();
      } else {
        res.writeHead(500, {
          'Content-Length': 0
        });
        res.end();
      };

      callback();
    });
  };
})();

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
      Object.keys(fields).forEach(function (key) {
        env['TEXT_' + key] = fields[key];
      });
      Object.keys(files).forEach(function (key) {
        env['FILE_' + key] = files[key].path;
        env['FILE_' + key + '_SIZE'] = files[key].size;
        env['FILE_' + key + '_TYPE'] = files[key].type;
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
