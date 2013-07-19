/* nor-http-proxy -- A proxy test */

var Q = require('q');
var jsdom = require('jsdom');
var jquery_path = require('path').join(__dirname, "../libs/jquery-1.10.2.js");

console.log('Using jquery from ' + jquery_path);

//var jquery = require("fs").readFileSync(require('path').join(__dirname, "../libs/jquery-1.10.2.min.js"), "utf-8");

/** Parse content type */
function parse_content_type(type) {
	var parts = type.split(';').map(function(v) { return (''+v).trim(); });
	var obj = {
		'type': parts.shift(),
		'opts': {}
	};
	parts.forEach(function(v) {
		var buf = v.split('=');
		var key = buf.shift().trim().toLowerCase();
		var value = buf.join('=');
		obj.opts[key] = value;
	});
	if(obj.opts.charset) {
		obj.charset = (''+obj.opts.charset).trim().toLowerCase();
	}
	return obj;
}

/** Change URLs to www.jhh.me to zeta3-lts:3000 */
function do_rebase_url(url) {
	var parsed = require('url').parse(url);
	if(parsed.hostname === 'www.jhh.me') {
		parsed.hostname = 'zeta3-lts';
		parsed.port = 3000;
		if(parsed.host) { delete parsed.host; }
	}
	return require('url').format(parsed);
}

/** Pass the request directly to the client */
function do_hijack_request(remote, local) {
	var defer = Q.defer();

	var buffer = '';
	
	console.log("remote.headers =", JSON.stringify(remote.res.headers, null, 2) );

	var headers = {};
	if(remote.res.headers.location) {
		headers.location = do_rebase_url(remote.res.headers.location);
	}

	remote.res.setEncoding('utf8');

	remote.res.on('data', function (chunk) {
		buffer += chunk;
	});

	remote.res.on('end', function() {

		// Transform the response
		jsdom.env({
			'html': buffer,
			'scripts': [jquery_path],
			'done': function(errors, window) {
				if(errors) {
					if(errors.path) {
						delete errors.path;
					}
					console.error('Error: ' + errors.errno + ' ' + errors.code);
					return;
				}

				try {
					var $ = window.$;

					$("[href]").each(function() {
						var link = $(this).attr('href');
						var new_link = do_rebase_url(link);
						if(link !== new_link) {
							$(this).attr('href', new_link);
						}
					});

					console.log('Writing header with #' + remote.res.statusCode + " with headers =", JSON.stringify(headers, null, 2) );
					local.res.writeHead(remote.res.statusCode, headers);
					local.res.end(window.document.innerHTML);
					defer.resolve();

				} catch(e) {
					console.error("jquery parsing error: " + e);
				}
			}
		});
		
	});

	return defer.promise;
}

/** Read the request and process it before passing it to the client */
function do_pass_request(remote, local) {
	var defer = Q.defer();

	console.log("remote.headers =", JSON.stringify(remote.res.headers, null, 2) );

	var headers = {};
	if(remote.res.headers.location) {
		headers.location = do_rebase_url(remote.res.headers.location);
	}
	console.log('Writing header with #' + remote.res.statusCode + " with headers =", JSON.stringify(headers, null, 2) );
	local.res.writeHead(remote.res.statusCode, headers);

	remote.res.on('data', function (chunk) {
		local.res.write(chunk);
	});

	remote.res.on('end', function() {
		local.res.end();
		defer.resolve();
	});

	return defer.promise;
}


/* */
var http = require('http');
http.createServer(function (req, res) {
	console.log( "req.url =", JSON.stringify(req.url, null, 2) );
	var url = require('url').parse(req.url);

	var options = {};
	options.method = req.method;
	options.hostname = 'www.jhh.me';
	options.port = 80;
	options.path = url.pathname;

	console.log( "options =", JSON.stringify(options, null, 2) );

	var remote_req = http.request(options, function(remote_res) {
		var content_type = parse_content_type(remote_res.headers['content-type']);
		if( (content_type.type === 'text/html') && (content_type.charset === 'utf-8') ) {
			do_hijack_request({res:remote_res,req:remote_req}, {res:res, req:req});
		} else {
			do_pass_request({res:remote_res,req:remote_req}, {res:res, req:req});
		}
	});

	remote_req.on('error', function(e) {
		console.log('problem with request: ' + e.message);
	});

	// TODO: write data to request body
	//remote_req.write('data\n');
	remote_req.end();

}).listen(3000);
console.log('Server running at http://0.0.0.0:3000/');

/* EOF */
