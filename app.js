var express = require('express'),
    fs = require('fs');

var express_app = express();

express_app.configure(function() {
    express_app.use(express.bodyParser());
    express_app.use(express_app.router);
    express_app.use('/static', express.static('static'));
    express_app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

function serverFile(filename, res, encoding, content_type) {
    encoding = encoding || 'utf8';
    content_type = content_type || 'text/html';
    fs.readFile(filename, encoding, function(err, contents) {
        if (err)
            res.send({message: 'Unable to load HTML' , errors: err});
        else
            res.setHeader('Content-Type', content_type);
            res.end(contents, encoding);
    });
}

express_app.get('/', function(req, res) {
    serverFile(__dirname + '/ui/index.html', res);
});

express_app.listen(9000);
console.log('Listening on http://localhost:9000');
