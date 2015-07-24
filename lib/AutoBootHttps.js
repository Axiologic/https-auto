var https = require("https");

//eyJ1cmwiOiJsb2NhbGhvc3Q6MzAwMCIsImNvZGUiOiJRMFZwVFRoa1pYbFZjV05rU1VFOVBRbz0iLCJrZXkiOiJXbGhOYW5KSmQwdGtlbHBxVTNjOVBRbz0ifQ==
//eyJ1cmwiOiJsb2NhbGhvc3Q6MzAwMCIsImNvZGUiOiJPVzFFTm5NM1VqZGhVWHBDYUVFOVBRbz0iLCJrZXkiOiJibFEyUmtGbWJsTnRlVGRpSzJjOVBRbz0ifQ==


var readline = require('readline');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function codeQuestion (callback){


    rl.question("Please paste your auto configuration code generate by the CA:", function(answer) {
        try{
            var str = new Buffer(answer, 'base64').toString('ascii');
            var obj = JSON.parse(str);
            console.log("Sending configuration request towards ", obj.url);
            rl.close();
            callback(obj);
        } catch(err){
            console.log("Invalid code detected!", err);
            codeQuestion(callback);
        }
    });
}


codeQuestion(function(res){
    console.log(res);
})



module.exports.https