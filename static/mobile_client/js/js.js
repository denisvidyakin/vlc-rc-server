/**
 * Created by den on 4/12/14.
 */

$(document).ready(function() {

    /* ----- PLAYER STATE ------ */
    var trackSeconsLength = 9000;
    var trackSecondsValue = 0;
    var subtitles = [];
    var audio = [];
    var isPaused = false;
    var isSpeedPlaying = false;
    var speedPlayingMultiplier = 1;
    var selectedAudioIndex = 0;
    var selectedSubtitlesIndex = -1;
    var mediaInfo = {};

    var volumeValue = 0;
    var mute = false;

    /* ---- STATE UPDATE SOCKET ---- */
    var updateSocket = null;
    var socketUpdateTimeoutId = null;



    /* --- LAYOUT --- */

    var sliderPosition = 0;
    var sliding = false;

    var minSliderLeft = 0;
    var maxSliderLeft = 0;
    var sliderWidth = 0;
    var handleWidth = 0;
    var sliderXOffset = 0;
    var handleBorderWidth = 0;
    var clickXOffset = 0;
    var movingRange = 0;

    var sliderUpdateIntervalId = null;

    function calcSliderParams() {
        //console.log( );
        sliderWidth = $('#searchSliderRow').width();
        handleWidth = $('#searchHandle').width();
        sliderXOffset = ( $(window).width() - sliderWidth)/2 |0;
        handleBorderWidth = 0.4*handleWidth |0;
        minSliderLeft = -handleBorderWidth;
        maxSliderLeft = sliderWidth - handleWidth + handleBorderWidth;
        movingRange = sliderWidth + 2*handleBorderWidth - handleWidth;

        //console.log(sliderWidth, handleWidth, sliderXOffset, handleBorderWidth, minSliderLeft, maxSliderLeft)
    }

    function setSliderPositionToZero() {
        $('#searchHandle').css('left', minSliderLeft + 'px');
        updateToolTip();
    }

    function setSliderPosition(val) {
        sliderPosition = val;
        $('#searchHandle').css('left', minSliderLeft + val + 'px');
        updateToolTip();
    }


    $( ".sliderHandle" ).mousedown(function(event) {
        stopSliderTimeUpdate();
        clickXOffset = event.offsetX;
        sliding = true;
    });

    $( window ).mouseup(function(event) {
        //stop sliding
        if (sliding) {
            sliding = false;

            seekTime(trackSecondsValue, function(answer){
                console.log(answer);
                startSliderTimeUpdate();
            })
        }
    });

    function setSliderPositionByTimeValue(secondsValue) {
        var newSecondsValue = secondsValue || trackSecondsValue;

        if (newSecondsValue <= 0) {
            trackSecondsValue = 0;
            setSliderPositionToZero();
        } else {
            trackSecondsValue = newSecondsValue;
            setSliderPosition( (newSecondsValue/trackSeconsLength*movingRange)|0 );
        }
    }

    function setTimeValueBySliderPosition() {
        trackSecondsValue = (sliderPosition/movingRange*trackSeconsLength)|0;
        updateToolTip();
    }

    function updateToolTip() {
        $('#searchHandleTooltip').html( toHHMMSS(trackSecondsValue) );
    }

    $(window).mousemove(function(event) {
        if (sliding) {
            var newLeft = event.pageX - sliderXOffset - clickXOffset;

            if (newLeft < minSliderLeft) {
                newLeft = minSliderLeft;
            } else if (newLeft > maxSliderLeft) {
                newLeft = maxSliderLeft;
            }

            //console.log(newLeft);
            sliderPosition = newLeft + handleBorderWidth;
            setTimeValueBySliderPosition();
            $('#searchHandle').css('left', newLeft + 'px');

        }
    });

    function startSliderTimeUpdate() {
        if (sliderUpdateIntervalId) {
            clearInterval(sliderUpdateIntervalId);
        }

        sliderUpdateIntervalId = setInterval(function() {
            trackSecondsValue += speedPlayingMultiplier;
            if (trackSecondsValue >= trackSeconsLength) {
                setStoppedState();
            } else {
                setSliderPositionByTimeValue();
            }
        },1000)
    }

    function stopSliderTimeUpdate() {
        if (sliderUpdateIntervalId) {
            clearInterval(sliderUpdateIntervalId);
        }
    }

    $('#playButton').mouseup(function(event) {
        if (isPaused) {
            $('#playButton').css('background-image', 'url("/mobile_client/img/play_w.svg")');      // show play button
            $('#searchSliderRow, #sliderBgLine, #buttonsRow, #forwardButton, #rewindButton, #title').addClass('is-disabled');
        } else {
            $('#playButton').css('background-image', 'url("/mobile_client/img/pause_w.svg")');     // show pause button
            $('#searchSliderRow, #sliderBgLine, #buttonsRow, #forwardButton, #rewindButton, #title').removeClass('is-disabled');
        }
    });

    $('#playButton').click(function(event){
        playPause();
    });

    $('#forwardButton').mousedown(function(event){
        forwardSpeedPlay();
    });

    $('#rewindButton').mousedown(function(event){
        backwardSpeedPlay();
    });


    /* -----PANELS LAYOUT ----- */
    var curOpenLevel = 0;

    $('#title').click(function() {
        openPanel('#libraryPanel');
    });

    $('#closeButton').click(function() {
        closePanel('#libraryPanel');
    });

    function openPanel(panelId) {
        $(panelId).width('100%').height('100%');
    }

    function closePanel(panelId) {
        $(panelId).width('100%').height('0%');
    }

    $('#backButton').click(function() {
        curOpenLevel += -1;

        if (curOpenLevel == 0) {
            hideBackButton()
        }

        $("#fileList").css('left', -curOpenLevel*100 + '%');
    });

    function hideBackButton() {
        $('#backButton').hide();
    }

    function showBackButton() {
        $('#backButton').show();
    }

    //selectors panel

    $('#soundButton').click(function() {
        $('#selectorsList').html( makeSelectorsListHtml('audio'));
        openPanel('#selectorsPanel');
    });

    $('#subsButton').click(function() {
        $('#selectorsList').html( makeSelectorsListHtml('subtitles'));
        openPanel('#selectorsPanel');
    });

    $('#spCloseButton').click(function() {
        closePanel('#selectorsPanel');
    });


    $('#incVButton').click(function() {
        sendIncVolumeCommand();
    });

    $('#decVButton').click(function() {
        sendDecVolumeCommand();
    });



    function makeSelectorsListHtml(mediaType) {
        var curList = mediaInfo[mediaType].slice();

        var clickFunctionName = 'selectAudioTrack';
        var selectedTrack = selectedAudioIndex;

        if (mediaType == 'subtitles') {
            clickFunctionName = 'selectSubtitlesTrack';
            selectedTrack = selectedSubtitlesIndex;
            curList.unshift({'description':'Subtitles Off', 'streamIndex': -1});
        }

        selectedTrack = getListIndexOfSelectedTrack(mediaType, selectedTrack);

        var resHtml = '<div id="selectorsListCont">';
        var isSelected = false;

        for (var i = 0; i < curList.length; i++) {
            if (i == selectedTrack) { isSelected = true} else {isSelected = false}
            resHtml += makeSelectorsListItemHtml( curList[i], clickFunctionName, isSelected, i);
        }

        return resHtml += '</div>';
    }

    function makeSelectorsListItemHtml(itemObj, clickFunctionName, isSelected, curIndex) {
        var description = (curIndex + 1).toString();

        if (itemObj.hasOwnProperty('description')) {
            description = itemObj.description;
        } else {
            if (clickFunctionName == 'selectAudioTrack') {
                description = 'Track ' + description;
            } else {
                description = 'Subtitles Track ' + description;
            }
        }

        var resHTML = '<div class="fileListItem button" id="listItem_' + curIndex +'" onclick="' + clickFunctionName + '(' + curIndex + ')">';

        var iconHTML ='<div class="selectedIcon"></div>';
        if (isSelected) iconHTML ='<div class="selectedIcon is-selected"></div>';

        resHTML += '<div class="listItemLeft">' + iconHTML + '</div>';
        resHTML += '<div class="fileListItemRight">' + description + '</div>';

        resHTML += '</div>';

        return resHTML;
    }

    function selectListItem(selectedIndex) {
        var i = 0;

        while ($('#listItem_' + i).hasOwnProperty('0')) {
            if (i == selectedIndex) {
                $('#listItem_' + i + ' .listItemLeft div').addClass('is-selected');
            } else {
                $('#listItem_' + i + ' .listItemLeft div').removeClass('is-selected');
            }

            i++;
        }
    }

    function getListIndexOfSelectedTrack(mediaType, trackIndex) {
        var curList = null;
        var correctonStep = 0;
        var resIndex = -1;

        if (mediaType == 'audio') {
            curList = audio;
        } else {
            curList = subtitles;
            correctonStep = 1;
        }

        for (var i=0; i<curList.length; i++) {
            if (curList[i].streamIndex == trackIndex) {
                resIndex = i;
                break;
            }
        }

        return resIndex + correctonStep;
    }

    selectAudioTrack = function( itemIndex ) {
        selectListItem(itemIndex);
        selectedAudioIndex = itemIndex;
        closePanel('#selectorsPanel');
        setAudioTrack();
    };

    selectSubtitlesTrack = function( itemIndex ) {
        selectListItem(itemIndex);
        selectedSubtitlesIndex = itemIndex - 1;
        closePanel('#selectorsPanel');
        setSubtitlesTrack();
    };

    function showLoadingScreen() {
        $('#loadingScreen').show();
    }

    function hideLoadingScreen() {
        $('#loadingScreen').hide();
    }




    /* ------ STATES -------- */
    var currentState = 'stopped';

    function updateState(data) {
        console.log(data);
        var newState = 'stopped';

        if (data.hasOwnProperty('s') ) {
            newState = data.s;
        }

        switch (newState) {
            case 'stopped':
                setStoppedState();
                break;
            case 'tryingToOpenFile':
                setTryingToOpenFileState(data);
                break;
            case 'playing':
                setPlayingState('playing', data, false, false);
                break;
            case 'speedPlaying':
                setSpeedPlayingState(data);
                break;
            case 'paused':
                setPausedState(data);
                break;
            default:
                setStoppedState(data);
        }

    }

    function setTryingToOpenFileState(stateObj) {
        currentState = 'tryingToOpenFile';
        $('#controlButtonsRow, #searchSliderRow, #sliderBgLine, #buttonsRow').addClass('is-disabled');
        $('#volumeButtonsRow').removeClass('is-disabled');

        var fileName = 'open file';
        if (stateObj) {
            if (stateObj.hasOwnProperty('f')) {
                fileName = extractFileNameFromPath(stateObj.f);
            }
        }
        $('#title').html(fileName);
        stopSliderTimeUpdate();
        setSliderPositionToZero();
    }

    function setPlayingState(stateName, stateObj, showPlayButton, turnOffSliderTimer) {
        currentState = stateName;
        $('#controlButtonsRow, #searchSliderRow, #sliderBgLine, #buttonsRow, #volumeButtonsRow, #forwardButton, #rewindButton, #title, #buttonsRow').removeClass('is-disabled');

        var curFileName = $('#title').html();
        var playingFileName = extractFileNameFromPath(stateObj.f);

        if (curFileName != playingFileName) {
            $('#title').html(playingFileName);
        }

        var curStreamTime = parseInt(stateObj.st, 10);
        if (!isNaN(curStreamTime)) {
            trackSecondsValue = curStreamTime;
        }

        if (stateObj.hasOwnProperty('sm')) {
            var speedMultiplier = parseFloat(stateObj.sm);

            if (!isNaN(speedMultiplier)) {
                speedPlayingMultiplier = speedMultiplier;
            }
        }

        if (stateObj.hasOwnProperty('mi')) {
            mediaInfo = stateObj.mi;

            var streamLength = parseInt(stateObj.mi.streamLength, 10);
            console.log(stateObj.mi.streamLength);
            if (!isNaN(streamLength)) {
                if (trackSeconsLength != streamLength) {
                    trackSeconsLength = streamLength;
                }
            }

            audio = mediaInfo.audio;
            subtitles = mediaInfo.subtitles;

            if (audio.length < 2) {
                $('#soundButton').addClass('is-disabled');
            } else {
                $('#soundButton').removeClass('is-disabled');
            }

            if (subtitles.length == 0) {
                $('#subsButton').addClass('is-disabled');
            } else {
                $('#subsButton').removeClass('is-disabled');
            }


        }

        if (stateObj.hasOwnProperty('ati')) {
            selectedAudioIndex = stateObj.ati;
        }

        if (stateObj.hasOwnProperty('sti')) {
            selectedSubtitlesIndex = stateObj.sti;
        }

        setSliderPositionByTimeValue();

        if (showPlayButton) {
            $('#playButton').css('background-image', 'url("/mobile_client/img/play_w.svg")');        // show play button
        } else {
            $('#playButton').css('background-image', 'url("/mobile_client/img/pause_w.svg")');       // show pause button
        }

        stopSliderTimeUpdate();
        if (!turnOffSliderTimer) {
            startSliderTimeUpdate();
        }

    }

    function setSpeedPlayingState(stateObj) {
        currentState = 'speedPlaying';
        isSpeedPlaying = true;
        setPlayingState('speedPlaying', stateObj, true, false);
    }

    function setPausedState(stateObj) {
        currentState = 'pausedState';
        isPaused = true;
        setPlayingState('pausedState', stateObj, true, true);
        $('#searchSliderRow, #sliderBgLine, #forwardButton, #rewindButton, #title, #buttonsRow').addClass('is-disabled');
    }

    function setStoppedState() {
        currentState = 'stopped';
        $('#controlButtonsRow, #searchSliderRow, #sliderBgLine, #buttonsRow').addClass('is-disabled');
        $('#volumeButtonsRow, #title').removeClass('is-disabled');
        $('#title').html('open file');
        stopSliderTimeUpdate();
        setSliderPositionToZero();
    }

    function setDisconnectedState() {
        currentState = 'disconnected';
        $('#controlButtonsRow, #searchSliderRow, #sliderBgLine, #buttonsRow, #volumeButtonsRow, #title').addClass('is-disabled');
        $('#title').html('connecting...');
        stopSliderTimeUpdate();
        setSliderPositionToZero();
        showLoadingScreen();
    }










    /* ------ COMANDS ------ */
    var commandUrl = 'http://127.0.0.1:8080/c/';

    //  0. s Get Current Player State
    //  1. a Get File List
    //  2. b Select Media
    //  3. c Get Media Info
    //  4. d seekTime
    //  5. e play
    //  6. f pause
    //  7. g forward
    //  8. h backward
    //  9. i select audio
    // 10. j select subtitles
    // 11. is volume +
    // 12. ds volume -


    //  0. s Get Current Player State
    function getServerState(cb) {
        $.post( commandUrl, {'s':0}, function( data ) {
            if (cb) cb(data);
        }, "json");
    }


    //  1. a Get File List
    var folderMap = [];
    var maxPathLength = 0;

    function getFileList() {

        $.post( commandUrl, {'a':0}, function( data ) {
            //console.log( data );

            if ( validateFileList(data) ) {
                folderMap = makeFolderMap( data );
                makeHtmlTemplate();
                openListItem([0]);
            } else {
                //show empty folder
            }

        }, "json");
    }

    function validateFileList(data) {
        return true;
    }

    function makeFolderMap(filePathArr) {
        var splittedArr = [];
        maxPathLength = 0;
        var curSplittedPathArr = [];

        for (var i=0; i<filePathArr.length; i++) {
            if (filePathArr[i] != '/') {
                if (filePathArr[i].charAt(0) == '/') {
                    filePathArr[i] = filePathArr[i].substring(1);
                }
                if (filePathArr[i].charAt( filePathArr[i].length - 1 ) == '/' ) {
                    filePathArr[i] = filePathArr[i].substring(0, filePathArr[i].length - 2);
                }

                curSplittedPathArr = filePathArr[i].split('/');
                splittedArr.push( curSplittedPathArr );

                if (curSplittedPathArr.length > maxPathLength) {
                    maxPathLength = curSplittedPathArr.length;
                }
            }
        }

        return  {"name": "rootFolder","type":"folder", "children":groupFolders(splittedArr, '')};
    }

    function makeHtmlTemplate(){
        var resHTML = '';

        for (var i=0; i<maxPathLength; i++) {
            resHTML += '<div id="fileListPanel' + i + '" class="fileListPanel"></div>'
        }

        $("#fileList").html(resHTML);
        $(".fileListPanel").width( 100/maxPathLength + '%' );
        $("#fileList").width(maxPathLength*100 + '%');
    }

    openListItem = function( indexArr ) {
        var curLevelObject = folderMap;

        for (var i=1; i<indexArr.length; i++) {
            curLevelObject = curLevelObject.children[indexArr[i]];
        }

        if (curLevelObject.type == 'folder') {
            showFileList(curLevelObject.children, indexArr)
        } else {
            //openFile()
            console.log(curLevelObject.path);
            openFile(curLevelObject.path, curLevelObject.name);
        }
    }

    function showFileList(fileList, indexArr) {
        var panelNum = indexArr.length-1;

        $("#fileListPanel" + panelNum).html( fileListHtml(fileList, indexArr) );
        $("#fileList").css('left', -panelNum*100 + '%');

        curOpenLevel = panelNum;

        if (curOpenLevel > 0) {
            showBackButton();
        } else {
            hideBackButton();
        }
    }

    function fileListHtml( fileList, indexArr ) {
        var resHTML = '<div class="fileListCont">';

        for (var i=0; i<fileList.length; i++) {
            resHTML += listItemHtml(i, fileList[i], indexArr);
        }

        resHTML += '</div>'
        return resHTML
    }

    function listItemHtml(itemIndex, itemObj, indexArr) {
        var resHTML = '<div class="fileListItem button" '
        var iconHTML ='';
        if ( itemObj.type == 'folder' ) iconHTML ='<div class="folderIcon"></div>';

        resHTML += onclickString(itemIndex, indexArr) + '>';

        resHTML += '<div class="fileListItemLeft">' + iconHTML + '</div>';
        resHTML += '<div class="fileListItemRight">' + itemObj.name + '</div>';

        resHTML += '</div>';

        return resHTML;
    }

    function onclickString(itemIndex, indexArr) {
        return 'onclick="openListItem([' + indexArr.toString() + ',' + itemIndex + '])"';
    }



    //  2. b Select Media
    function openFile(path, title) {
        setTryingToOpenFileState();
        $('#title').html('<div id="conIcon"></div>' + title);
        $('#closeButton').click();

        $.post( commandUrl, {'b':path}, function( data ) {
            parseServerAnswer(data, function( mediaInfo ) {
                console.log(mediaInfo);
                trackSeconsLength = parseInt(mediaInfo.streamLength, 10);

            });
        }, 'json');
    }

    //  3. c Get Media Info
    function getMediaInfo(cb) {
        $.post( commandUrl, {'c':''}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    //  4. d seekTime
    function seekTime(newTime, cb) {
        $.post( commandUrl, {'d':newTime}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    //  5. e play or pause
    function playPause(cb) {
        $.post( commandUrl, {'e':''}, function( data ) {
            parseServerAnswer(data,cb);
        }, 'json');
    }

    //  7. g forward
    function forwardSpeedPlay(cb) {
        $.post( commandUrl, {'g':''}, function( data ) {
            parseServerAnswer(data,cb);
        }, 'json');
    }

    //  8. h backward
    function backwardSpeedPlay(cb) {
        $.post( commandUrl, {'h':''}, function( data ) {
            parseServerAnswer(data,cb);
        }, 'json');
    }

    //  9. i select audio track
    function setAudioTrack(cb) {
        var trackIndex = parseInt(audio[selectedAudioIndex].streamIndex, 10);
        $.post( commandUrl, {'i':trackIndex}, function( data ) {
            parseServerAnswer(data,cb);
        }, 'json');
    }

    //  10. j select subtitles track
    function setSubtitlesTrack(cb) {
        var trackIndex = -1;
        if (selectedSubtitlesIndex > -1) {
            trackIndex = parseInt(subtitles[selectedSubtitlesIndex].streamIndex, 10);
        }
        $.post( commandUrl, {'j':trackIndex}, function( data ) {
            parseServerAnswer(data,cb);
        }, 'json');
    }

    // 11. is volume +
    function sendIncVolumeCommand(cb) {
        $.post( commandUrl, {'iv':''}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    // 12. ds volume -
    function sendDecVolumeCommand(cb) {
        $.post( commandUrl, {'dv':''}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    //  13. l get_length
    function getStreamLength(cb) {
        $.post( commandUrl, {'l':''}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    //  14. t get_time
    function getCurrentTime(cb) {
        $.post( commandUrl, {'t':''}, function( data ) {
            parseServerAnswer(data, cb)
        }, 'json');
    }

    function parseServerAnswer(data, cb) {
        if ( data.success ) {
            console.log(data);
            if (cb) cb(data.success);
        } else if (data.err) {
            console.log('answer error', data.err);
        } else {
            console.log('wrong answer');
        }
    }


    /* ------ WEBSOCKETS ------ */
    function openUpdateSocket() {
        if (updateSocket) {
            updateSocket = null;
        }

        updateSocket = new WebSocket("ws://127.0.0.1:8081");

        updateSocket.onopen = function() {
            stopTryingToReconnectUpdateSocket();
            hideLoadingScreen();
            console.log("ws connected");
        };

        updateSocket.onclose = function(event) {
            if (event.wasClean) {
                console.log('connection is terminated (was clean)');
            } else {
                console.log('connection is closed'); // например, "убит" процесс сервера
            }
            console.log('code: ' + event.code + ' reason: ' + event.reason);
            setDisconnectedState();
            tryToReconnectUpdateSocket();
        };

        updateSocket.onmessage = function(event) {
            updateState(JSON.parse(event.data));
        };

        updateSocket.onerror = function(error) {
            console.log("ws error: " + error.message);
            setDisconnectedState();
            tryToReconnectUpdateSocket();
        }
    }

    function tryToReconnectUpdateSocket(interval) {
        var updateInterval = interval || 2000;
        if (socketUpdateTimeoutId) {
            clearInterval(socketUpdateTimeoutId)
        }

        socketUpdateTimeoutId = setTimeout(function() {
            openUpdateSocket();
        }, updateInterval);
    }

    function stopTryingToReconnectUpdateSocket() {
        if (socketUpdateTimeoutId) {
            clearInterval(socketUpdateTimeoutId)
        }
    }




    /* --- INIT --- */
    //init layout
    calcSliderParams();
    setDisconnectedState();

    //init data
    getFileList();

    openUpdateSocket();

    /*
    getServerState( function (data) {
        parseServerAnswer(data, function(curStateObj) {
            updateState(curStateObj);

        })
    });
    */

});

/* ------- ONCLICK FUNCTIONS --------- */
var openListItem = function( indexArr ) {
    return false;
}

var selectAudioTrack = function( itemIndex ) {
    return false;
}

var selectSubtitlesTrack = function( itemIndex ) {
    return false;
}

/* ------ ADD FUNCTIONS -----------*/
function toHHMMSS(sseconds) {
    var sec_num = parseInt(sseconds, 10);
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    //if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10 ) {minutes = "0"+minutes;}
    if (seconds < 10 ) {seconds = "0"+seconds;}

    return hours+':'+minutes+':'+seconds;
}

function groupFolders(splittedArr, pathPrefix) {
    var resArr = [];
    var items = [];

    var curItem = '';
    var curItemIndex = -1;
    for (var i=0; i<splittedArr.length; i++) {
        if ( splittedArr[i].length > 0 ) {
            curItem = splittedArr[i][0];
            if ( splittedArr[i].length > 1 ) {

                //it's a folder
                curItemIndex = items.indexOf( curItem )
                if ( curItemIndex < 0 ) {
                    // new folder
                    items.push( curItem );
                    resArr.push( {"name": curItem,"type":"folder", "children": [ shiftAndCopyArr(splittedArr[i]) ]});

                    //find items with the same name
                    for (var j = i+1; j < splittedArr.length; j++) {
                        if (splittedArr[j][0] == curItem) {
                            resArr[items.length-1].children.push( shiftAndCopyArr(splittedArr[j]) );
                        }
                    }

                    //recursion for children
                    resArr[items.length-1].children = groupFolders(resArr[items.length-1].children, pathPrefix + '/' + curItem)
                }


            } else  {
                //it's a file
                items.push( curItem );
                resArr.push( {"name": curItem,"type":"file", "path": pathPrefix + '/' + curItem} )
            }
        }
    }

    return resArr;
}

function shiftAndCopyArr(arr) {
    var copyArr = arr.slice();
    copyArr.shift();
    return copyArr;
}

function extractFileNameFromPath(pathStr) {
    return pathStr.substr(pathStr.lastIndexOf('/') + 1);
}
