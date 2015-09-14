var https = require("https");
var http = require('http');
var fs = require('fs');


var AUTO_BOOT_KEY = "/AutoBootKeys";
var AUTO_PASS_KEY = "/KeyConfig";


var readline = require('readline');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function getConfigFromEnv(){
    try {
        var code = process.env['HTTPS_AUTOCONFIG_CODE'];
        var str = new Buffer(code, 'base64').toString('ascii');
        return JSON.parse(str);
    }
    catch(e){
        console.log(e);
    }

}
function CacheContent(){
    var configs = {};
    var keysOptions = {};
    var nameServerLookup = {};

    var self = this;
    this.loadSSLConfig = function(folder){

        if(!configs[folder]){
            var config = getConfigFromEnv();
            if(config){
                configs[folder] = config;
            }else{
                configs[folder] = JSON.parse(fs.readFileSync(folder + AUTO_PASS_KEY).toString("utf8"));
            }
        }
        return configs[folder];
    };

    function cleanNSCache(){
        nameServerLookup = {};
        setTimeout(cleanNSCache, 60*60*1000); //clean each hour
    }

    cleanNSCache();

    this.loadKeys = function(folder, callback){
        var options = keysOptions[folder];
        if(options){
            callback(null, options)
            return ;
        }

        if (!fs.existsSync(folder)){
            fs.mkdirSync(folder);
        }
        var AdmZip = require('adm-zip');

        function extractZip(callback){
            var file = folder + AUTO_BOOT_KEY;

            try{
                var zip = new AdmZip(file);
                var res = {};
                res.passphrase = self.loadSSLConfig(folder).key;
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
                keysOptions[folder] = res;
                callback(null,res);
            } catch(err){
                console.log(err.stack);
                callback(true);
            }
        }

        var codeUses = 0;
        function codeQuestion(callback){

            function detectKey(message,callback) {
                var code = process.env['HTTPS_AUTOCONFIG_CODE'];
                if (code) {
                    if(codeUses){
                        console.log('Invalid value in HTTPS_AUTOCONFIG_CODE');
                        process.exit(1);
                    }else {
                        codeUses++;
                        callback(code);
                    }
                } else {
                    rl.question(message, callback);
                }
            }


            detectKey("Please paste your auto configuration code generate by the CA:", function(answer) {
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
                    fs.writeFile(folder + AUTO_PASS_KEY, JSON.stringify(res));
                    http_download("http://"+res.url+"/autoconfig/"+res.code, folder + AUTO_BOOT_KEY , function(err,res){
                        if(err){
                            console.log("Error downloading configuration, aborting...", err);
                            callback(err);
                        } else {
                            self.loadKeys(folder, callback);
                        }
                    })
                })
            } else {
                callback(null, res);
            }
        })

    }

    this.lookup = function(folder, organistion, callback){
        var res = nameServerLookup[organistion];
        if( res){
            callback(null, res);
            return ;
        }
        var url = "http://"+self.loadSSLConfig(folder).url+ "/retrieveConfiguration/"+organistion+"/relay";
        var str="";
        console.log("Loading configuration from ", url);
        var request = http.get(url, function(response) {
            response.on('data', function (data) {
                str += data;
            });
            response.on('end', function () {
                res = JSON.parse(str);
                nameServerLookup[organistion] = res;
                callback(null, res);
            });

            response.on('error', function (err) {
                console.log(err);
            });
        });
    };

    this.cacheOrganisation = function(organistion, obj){
        nameServerLookup[organistion] = obj;
    };
}
var cache = new CacheContent();

exports.getOrganizationName = function(folder){
       return cache.loadSSLConfig(folder).name;
};

exports.getConfigByName = function(folder , name , callback){
    var organization = exports.getOrganizationName(folder);
    var url  = 'http://'+exports.getNameServiceUrl(folder)+'/retrieveConfiguration/'+organization+'/'+name;
    http.get(url,function(response){
        var str = '';
        response.on('data', function (chunk) {
            str += chunk;
        });
        response.on('end', function () {
            callback(undefined,str);
        });
        response.on('error',function(error){
            callback(error);
        })
    });
};

exports.getHttpsOptions = function(keysFolder, callback){
    cache.loadKeys(keysFolder, function(err, res){
        var options = {
            key: res.key,
            cert: res.cert,
            ca:res.ca,
            passphrase:res.passphrase
        };
        callback(null,options );

    })
};

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


exports.getNameServiceUrl = function(folder){
    return cache.loadSSLConfig(folder).url;
};


exports.lookup = function(folder, organistion, callback){
    return cache.lookup(folder, organistion, callback);

};


exports.cacheOrganisation = function(organistion, obj){
    cache.cacheOrganisation(organistion, obj);
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



