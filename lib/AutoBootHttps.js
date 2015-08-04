var https = require("https");
var http = require('http');
var fs = require('fs');


var AUTO_BOOT_KEY = "/AutoBootKeys";
var AUTO_PASS_KEY = "/AutoPassKey";


var readline = require('readline');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function loadKeys (folder, callback){
    if (!fs.existsSync(folder)){
        fs.mkdirSync(folder);
    }
    var AdmZip = require('adm-zip');

    function extractZip(callback){
        var file = folder + AUTO_BOOT_KEY;

        try{
            var zip = new AdmZip(file);
            var res = {};
            res.passphrase = fs.readFileSync(folder + AUTO_PASS_KEY).toString("utf8");
            var zipEntries = zip.getEntries(); // an array of ZipEntry records
            zipEntries.forEach(function(zipEntry) {
                if (zipEntry.entryName == "ca.cert") {
                    res.ca = zipEntry.getData().toString('utf8');
                } else {
                    var ext = zipEntry.entryName.match(/\w+\.(\w*)/)[1];
                    if(ext == 'key' || ext == 'cert'){

                        res[ext] = zipEntry.getData().toString('utf8');
                    }
                }
            });
            callback(null,res);
        } catch(err){
            console.log(err.stack);
            callback(true);
        }
    }

    function codeQuestion(callback){
        rl.question("Please paste your auto configuration code generate by the CA:", function(answer) {
            try{
                var str = new Buffer(answer, 'base64').toString('ascii');
                var obj = JSON.parse(str);
                rl.close();
                callback(obj);
            } catch(err){
                console.log("Invalid code detected!", err);
                codeQuestion(callback);
            }
        });
    }

    extractZip(function(err, res){
        if(err){
            codeQuestion(function(res){
                fs.writeFile(folder + AUTO_PASS_KEY, res.key);
                http_download("http://"+res.url+"/autoconfig/"+res.code, folder + AUTO_BOOT_KEY , function(err,res){
                    if(err){
                        console.log("Error downloading configuration, aborting...", err);
                        callback(err);
                    } else {
                        loadKeys(folder, callback);
                    }
                })
            })
        } else {
            callback(res);
        }
    })
}


exports.getHttpsOptions = function(keysFolder, callback){
    loadKeys(keysFolder, function(res){
        var options = {
            key: res.key,
            cert: res.cert,
            ca:res.ca,
            passphrase:res.passphrase
        };
        callback(null,options );

    })

}

exports.startServer = function(port, keysFolder, callback){
    exports.getHttpsOptions (keysFolder, function(error, options){
        options.requestCert        = false;
        options.rejectUnauthorized = false;
        console.log("Starting https server on port", port);
        var server = https.createServer(options, callback);
        server.listen(port);
        return server;
    })
};


exports.startMutualAuthServer = function(port, keysFolder, callback){
    exports.getHttpsOptions (keysFolder, function(error, options){
        options.requestCert        = true;
        options.rejectUnauthorized = false;
        console.log("Starting https server on port", port);
        var server = https.createServer(options, callback);
        server.listen(port);
        return server;
    })
};


function http_download (url, localFilePath, callback){
    console.log("Downloading ssl configuration from ", url, " in ",localFilePath );
    var file = fs.createWriteStream(localFilePath);
    var request = http.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close(callback); // close() is async, call callback after close completes.
        });
        file.on('error', function (err) {
            fs.unlink(dest); // Delete the file async. (But we don't check the result)
            if (callback)
                callback(err);
        });
    });
};

/* */
