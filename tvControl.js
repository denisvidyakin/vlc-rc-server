var fs = require('fs');
var http = require('http');
var paperboy = require('paperboy');
var path = require('path');
var formidable = require('formidable');
var WebSocketServer = require('ws').Server;
var vlc = require('vlc-rc-socket');




//config
var config = JSON.parse( fs.readFileSync('config.json', 'utf-8') );

var vlcPlayer = null;

//player state
var isPaused = false;
var isSpeedPlaying = false;
var speedPlayingMultiplier = 2;
var selectedAudioIndex = 0;
var selectedSubtitlesIndex = -1;
var searchTimeStep = parseInt(config.searchTimeStep, 10);

//start player()
startVLC();

//start server & routes
http.createServer(function (req, res) {
    defaultRouting(req, res);
}).listen(config.httpPort, config.ip);
console.log('Http server running at http://' + config.ip + ':' + config.httpPort + '/');

function defaultRouting(req, res) {
    var urlArr = req.url.split("/");
    if ( urlArr[1].length > 0 ) {
        if (urlArr[1] == 'c') {
            parseCommandForm(req, res);
        } else {
            tryDownloadStatic(req, res, 'static/');
        }
    } else {
        page404(res);
    }
}

function initErrorRouting(req,res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('no connection to media folder');
}

/* -- Websockets -- */
var wss = new WebSocketServer({port: config.websocketPort});
wss.on('connection', function(ws) {
    var stateObj = {'s':'stopped'};

    if (vlcPlayer) {
        stateObj = vlcPlayer.getCurrentState();
    }

    makeStateObj(stateObj, function(curStateObj) {
        ws.send( JSON.stringify(curStateObj) );
    });
});

wss.broadcast = function(data) {
    for (var i in this.clients) {
        this.clients[i].send(data);
    }
}

/* ------ COMMANDS ------ */

//  1.   a Get File List
//  2.   b Select Media
//  3.   c Get Media Info
//  4.   d seek time
//  5.   e play
//  6.   f pause
//  7.   g forward
//  8.   h backward
//  9.   i audio track
//  10.  j subtitles track
//  11.  iv volume +
//  12.  dv volume -


//  0. parse command
function parseCommandForm(req, res) {
    var form = new formidable.IncomingForm();

    var targetFunction = commandError;
    var arg = 0;

    form
        .on('field', function(field, value) {
            //parse command
            arg = value;
            //console.log(field, value)
            targetFunction = parseCommand(field);
        })

        .on('end', function() {
            //console.log('-> parse command -> done');

            //run target function
            targetFunction(req, res, arg);
        });
    form.parse(req);
}

function parseCommand(commandName) {
    var targetFunction = commandError;

    switch(commandName)
    {
        case 'a':
            targetFunction = getFileList;
            break;
        case 'b':
            targetFunction = selectMedia;
            break;
        case 'c':
            targetFunction = getMediaInfo;
            break;
        case 'd':
            targetFunction = seekX;
            break;
        case 'e':
            targetFunction = startPlay;
            break;
        case 'f':
            targetFunction = pausePlay;
            break;
        case 'g':
            targetFunction = forwardPlay;
            break;
        case 'h':
            targetFunction = backwardPlay;
            break;
        case 'i':
            targetFunction = selectAudioTrack;
            break;
        case 'j':
            targetFunction = selectSubtitlesTrack;
            break;
        case 'iv':
            targetFunction = incVolume;
            break;
        case 'dv':
            targetFunction = decVolume;
            break;
        case 'l':
            targetFunction = getStreamLength;
            break;
        case 't':
            targetFunction = getCurrentTime;
            break;
        case 's':
            targetFunction = getCurrentState;
            break;
        default:
            targetFunction = commandError;
    }

    return targetFunction;
}

function commandError(req, res, message) {
    res.writeHead(200, {'content-type': 'application/json'});
    res.end('{"err":"' + message + '"}');
}

function commandSuccess(req, res, message) {
    //console.log(res);
    res.writeHead(200, {'content-type': 'application/json'});
    res.end('{"success":' + message + '}');
}

//  1. a Get File List
function getFileList(req, res, arg) {
    var mediaFolderUrl = config.mediaFolder;
    //console.log(mediaFolderUrl);


    walkDir(mediaFolderUrl, function(err, results) {
        if (!err) {
            res.writeHead(200, {'content-type': 'application/json'});
            res.end(JSON.stringify( filterMediaList(results, mediaFolderUrl) ) );
        } else {
            commandError(req, res, '"("');
        }
    });
}

function walkDir(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
        console.log(JSON.stringify(list));
        if (err) return done(err);
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) return done(null, results);
            file = dir + '/' + file;
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    walkDir(file, function(err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
};

function filterMediaList(fileArr, dir) {
    var resultList = [];

    var dirLength = dir.length;
    var currentFile = '';
    var currentFileExt = '';

    fileArr.forEach(function(filePath) {
        currentFile = filePath.substring(dirLength);
        if ( checkFilePath(currentFile) ) {
            resultList.push(currentFile);
        }
    });

    return resultList;
}

function checkFilePath(filePath) {
    var result = false;

    var extList = config.extensionsList;

    if ( (extList.indexOf( getExtension(filePath) ) >=0) &&  (filePath.indexOf('/.') < 0) ) {
        result = true;
    }

    return result;
}

function getExtension(filename) {
    var ext = path.extname(filename||'').split('.');
    return ext[ext.length - 1].toLowerCase();
}


//  2. b Select Media
function selectMedia(req, res, mediaPath) {
    if (vlcPlayer) {
        vlcPlayer.openMedia(config.mediaFolder + mediaPath, function(err, answ) {
            if (!err) {
                isPaused = false;
                isSpeedPlaying = false;
                speedPlayingMultiplier = 2;
                selectedAudioIndex = 0;
                selectedSubtitlesIndex = -1;
                commandSuccess(req, res, JSON.stringify(answ));
            } else {
                commandError(req, res, JSON.stringify(err));
            }
        });
    }
}

//  3. c Get Media Info
function getMediaInfo(req, res, arg) {
    if (vlcPlayer) {
        commandSuccess(req, res, JSON.stringify(vlcPlayer.getMediaInfo()));
    }
}

//  4. d seek time
function seekX(req, res, newTime) {
    if (!isPaused) {
        execPlayerCommand('seek ' + newTime, req, res);
    } else {
        commandError(req, res, JSON('not working in pause state'));
    }
}

//  5. e play
function startPlay(req, res, arg) {
    if (vlcPlayer) {
        if (isSpeedPlaying) {
            backToNormalSpeedRequest(req,res);
        } else {
            playPauseRequest(req, res)
        }
    } else {
        commandError(req,res, JSON.stringify('vlc connection error'));
    }
}

function playPauseRequest(req, res) {
    vlcPlayer.addCommand('pause', function(err, answ) {
        if (!err) {
            if ( commandHasReturned0(answ) ) {
                endPlayPauseRequest(answ, req, res);
            }
        } else {
            commandError(req, res, JSON.stringify(err) );
        }
    });
}

function endPlayPauseRequest(answ, req, res) {
    if (answ.indexOf('pause: returned 0 (no error)') > -1 ) {
        if (answ.indexOf('status change:') > -1 && answ.indexOf(': Pause') > -1 ) {
            isPaused = true;
        } else {
            isPaused = false;
        }

        commandSuccess(req, res, JSON.stringify( answ.trim() ));
        broadcastState(vlcPlayer.getCurrentState());

    } else {
        commandError(req, res, answ);
    }
}

function seekDeltaX(req, res, dX) {
    checkCurTime( function(timeStr) {
        var newTime = parseInt(timeStr, 10);
        var streamLength = vlcPlayer.mediaStreamLength;

        newTime = newTime + dX;

        if (newTime < 0) newTime = 0;
        if (newTime > streamLength) newTime = streamLength;

        seekX(req, res, newTime);
    });
}

//  6. f pause
function pausePlay(req, res, arg) {

}

//  7. g forward
function forwardPlay(req, res, arg) {
    seekDeltaX(req, res, searchTimeStep);
}

//  8. h backward
function backwardPlay(req, res, arg) {
    seekDeltaX(req, res, -searchTimeStep);
}

function finishSpeedPlayingRequest(req, res, answ) {
    console.log(answ);
    speedPlayingMultiplier = extractSpeedPlayerMultiplier(answ);

    if (speedPlayingMultiplier == 1) {
        isSpeedPlaying = false;
    } else {
        isSpeedPlaying = true;
    }

    commandSuccess(req, res, JSON.stringify(answ));
    broadcastState(vlcPlayer.getCurrentState());
}

function extractSpeedPlayerMultiplier(str) {
    var nrIndex = str.indexOf('new rate:')
    var res = 1;
    if (nrIndex > -1) {
        res = parseFloat(str.substring(nrIndex + 10, nrIndex + 15));
    }

    console.log(res);
    return res;
}

function backToNormalSpeedRequest(req, res) {
    if (vlcPlayer) {
        vlcPlayer.addCommand('normal', function(err, answ) {
            if (!err) {
                console.log(answ);
                isSpeedPlaying = false;
                speedPlayingMultiplier = 1;
                commandSuccess(req, res, JSON.stringify(answ));
                broadcastState(vlcPlayer.getCurrentState());

            } else {
                commandError(req, res, JSON.stringify(err) );
            }
        });
    } else {
        commandError(req,res, JSON.stringify('vlc connection error'));
    }
}

//  9. i select audio track
function selectAudioTrack(req, res, arg) {
    if (!isPaused) {
        selectedAudioIndex = arg;
        execPlayerCommand('atrack ' + arg, req, res);
    } else {
        commandError(req, res, JSON('not working in pause state'));
    }
}

//  10. i select audio track
function selectSubtitlesTrack(req, res, arg) {
    if (!isPaused) {
        selectedSubtitlesIndex = arg;
        execPlayerCommand('strack ' + arg, req, res);
    } else {
        commandError(req, res, JSON('not working in pause state'));
    }
}

//  11.  iv volume +
function incVolume(req, res, arg) {
    console.log('volume +');
    commandSuccess(req, res, JSON.stringify('volume+'));
}

//  12.  dv volume -
function decVolume(req, res, arg) {
    console.log('volume -');
    commandSuccess(req, res, JSON.stringify('volume-'));
}

//  13. l get_length
function getStreamLength(req, res, arg) {
    execPlayerCommand('get_length', req, res);
}

//  14. t get_time
function getCurrentTime(req, res, arg) {
    execPlayerCommand('get_time', req, res);
}

//  15. s get current state
function getCurrentState(req, res, arg) {
    var stateObj = {'s':'stopped'};
    if (vlcPlayer) {
        stateObj = vlcPlayer.getCurrentState();
    }

    makeStateObj(stateObj, function(curStateObj) {
        commandSuccess(req, res, JSON.stringify(curStateObj));
    });

}

function makeStateObj(vlcState, cb) {
    var stateObj = vlcState;

    if (stateObj.s == 'playing') {
        if (isPaused) {
            stateObj.s = 'paused'
        } else if (isSpeedPlaying) {
            stateObj.s = 'speedPlaying';
            stateObj.sm = speedPlayingMultiplier;
        }
        stateObj.ati = selectedAudioIndex;
        stateObj.sti = selectedSubtitlesIndex;

        checkCurTime(function(curTime) {
            stateObj.st = curTime;
            if (cb) cb(stateObj);
        })
    } else {
        if (cb) cb(stateObj);
    }
}

function checkCurTime(cb) {
    if (vlcPlayer) {
        vlcPlayer.addCommand('get_time', function(err, answ) {
            if (!err) {
                if (cb) cb(answ.trim())
            } else {
                if (cb) cb('0');
            }
        });
    } else {
        if (cb) cb('0');
    }
}

function broadcastState(vlcState) {
    makeStateObj(vlcState, function(stateObj){
        wss.broadcast(JSON.stringify(stateObj))
    })
}


/*------ VLC PLAYER ------*/
function startVLC(){
    vlcPlayer = new vlc.VlcPlayer();
    vlcPlayer.socketFile = config.socketFile;
    vlcPlayer.autoRestore = true;

    vlcPlayer
        .on('open', function(pid) {
            //console.log('01 ', pid, this.vlcPID);
        })

        .on('err', function(err){
            console.log(err);
        })

        .on('state_change', function(stateInfo){
            broadcastState(stateInfo);
        })

        .on('close', function(code) {
            console.log('vlc was closed. Exit  code: ', code);
        });
    vlcPlayer.startVLC(config.vlcCommand);
}

function execPlayerCommand(commandStr, req, res) {
    if (vlcPlayer) {
        vlcPlayer.addCommand(commandStr, function(err, answ) {
            if (!err) {
                commandSuccess(req, res, JSON.stringify( answ.trim() ));
                broadcastState(vlcPlayer.getCurrentState());
            } else {
                commandError(req, res, JSON.stringify(err) );
            }
        });
    }
}

function commandHasReturned0(answer) {
    if (answer.indexOf('returned 0 (no error)') > -1 ) {
        return true;
    } else {
        return false;
    }
}





/*------ STATIC CONTENT --------*/

function tryDownloadStatic(req, res, sourceCat) {
    var ip = req.connection.remoteAddress;
    var webroot = path.join(__dirname, sourceCat);

    paperboy
        .deliver(webroot, req, res)
        .addHeader('X-Powered-By', ')')
        .before(function() {
        })
        .after(function(statusCode) {
            //console.log(statusCode + ' - ' + req.url + ' ' + ip);
        })
        .error(function(statusCode, msg) {
            console.log([statusCode, msg, req.url, ip].join(' '));
            res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
            res.end('Error [' + statusCode + ']');
        })
        .otherwise(function(err) {
            console.log([404, err, req.url, ip].join(' '));
            page404(res);
        });
}

function page404(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Error 404: File not found');
}

