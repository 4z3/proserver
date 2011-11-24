#! /usr/bin/env node

var port = 8000;

var root_path = (function _init_root_path () {
  var fs = require('fs');
  var path = require('path');
  return path.dirname(fs.realpathSync(__filename));
})();

var handle_externally = (function _init_handle_externally () {

  var spawn = require('child_process').spawn;
  var path = require('path');

  return function _impl_handle_externally (req, res, options, callback) {

    // the external handler may run a long time... don't time out.
    res.socket.setTimeout(0 * 60 * 1000);

    var log = options.log;
    var env = JSON.parse(JSON.stringify(options.env)); // copy

    env.METHOD = req.method;
    env.URL = req.url;

    var child = (function _init_child () {
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

    child.stdout.on('data', function _cb_buffer_res_chunk (chunk) {
      data.push(chunk);
    });
    
    child.stderr.on('data', function _cb_write_child_stderr (chunk) {
      log.raw(chunk.toString(), '[31m');
    });
    
    child.on('exit', function _cb_child_exited (code) {
      log.format('child', 'exit', code);
      if (code === 0) {
        // TODO do we have a use case to not generate the whole HTTP response?
        data.forEach(function _cb_write_res_chunks (chunk) {
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

var listener = (function _init_listener () {
  return function _impl_listener (req, res) {
    var log = require('./log').create();

    log.raw([req.method, req.url, 'HTTP/' + req.httpVersion].join(' '));
    log.format(req.headers);
    var re = new RegExp('^multipart/form-data(?:;|$)');
    if (re.test(req.headers['content-type'])) {
      var form = new require('formidable').IncomingForm();

      form.parse(req, function(err, fields, files) {

        (function _scope_pretty_print_form () {
          var pretty = {};
          Object.keys(fields).forEach(function _cb_cpy_fields (key) {
            pretty[key] = fields[key];
          });
          Object.keys(files).forEach(function _cb_cpy_partial_files (key) {
            pretty[key] = {};
            [ 'name', 'size', 'type', 'path'
            ].forEach(function _cb_cpy_some_file_props (property) {
              pretty[key][property] = files[key][property];
            });
          });
          log.format(pretty);
        })();

        // TODO whitelist fields and files?
        var env = {};
        Object.keys(fields).forEach(function _cb_export_fields (key) {
          env['TEXT_' + key] = fields[key];
        });
        Object.keys(files).forEach(function _cb_export_files (key) {
          env['FILE_' + key] = files[key].path;
          env['FILE_' + key + '_SIZE'] = files[key].size;
          env['FILE_' + key + '_TYPE'] = files[key].type;
        });

        var options = {
          log: log,
          env: env
        };
        handle_externally(req, res, options, function _cb_form_cleanup () {
          var fs = require('fs');
          Object.keys(files).forEach(function _cb_unlink_files (key) {
            var file = files[key];
            fs.unlink(file.path, function _cb_file_unlinked (exn) {
              log.format('unlink', file.path, exn);
            });
          });
        });
      });

    } else {
      var options = {
        log: log,
        env: {}
      };
      handle_externally(req, res, options, function _cb_nop () {});
    };
  };
})();

(function _scope_setup_https_server () {
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

  https.createServer(options, listener).listen(port, function _cb_motd () {
    console.log('Serving HTTPS on 0.0.0.0 port', port);
  });
})();

(function _scope_setup_suicide_facility () {
  process.on('SIGTERM', function _cb_sigterm () {
    console.log('Got SIGTERM ==> shutting down...');
    process.exit(0);
  });
  var fs = require('fs');
  var Inotify = require('inotify').Inotify;
  var inotify = new Inotify();
  inotify.addWatch({
    path: fs.realpathSync(__filename), // TODO all the files
    watch_for: Inotify.IN_ATTRIB
             | Inotify.IN_DELETE_SELF
             | Inotify.IN_MODIFY
             | Inotify.IN_MOVE_SELF
             ,
    callback: function _cb_hara_kiri (event) {
      process.kill(process.pid, 'SIGTERM');
    }
  });
})();
