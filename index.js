'use strict';

var MODULE_NAME = 'plugin-socketio';

var _ = require('underscore');
var socketio = require('socket.io');

var nodeplayerConfig = require('nodeplayer').config;
var coreConfig = nodeplayerConfig.getConfig();
var defaultConfig = require('./default-config.js');
var config = nodeplayerConfig.getConfig(MODULE_NAME, defaultConfig);

var player;
var logger;

var playbackEvent = function(socket) {
    socket.emit('playback', player.queue[0] ? {
        songID: player.queue[0].songID,
        format: player.queue[0].format,
        backendName: player.queue[0].backendName,
        duration: player.queue[0].duration,
        position: player.playbackStart ? player.playbackPosition +
            (new Date() - player.playbackStart) : player.playbackPosition,
        playbackStart: player.playbackStart,
        volume: player.volume
    } : null);
};

var queueEvent = function(socket) {
    socket.emit('queue', {
        items: _.first(player.queue, config.sentQueueLimit),
        length: player.queue.length
    });
};

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
exports.init = function(vars, callback) {
    if (!vars.app) {
        callback('module must be initialized after express module!');
    } else {
        vars.socketio = socketio(vars.httpServer);

        var isAuthorized = function(socket, event, callback) {
            if (!vars.socketio.protectedPaths) {
                logger.silly('no protectedPaths for socketio');
                callback();
            } else if (vars.socketio.protectedPaths.indexOf(event) === -1) {
                logger.silly('no protectedPath for socketio event ' + event);
                callback();
            } else {
                //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                if (socket.request.user.logged_in) {
                    //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                    logger.silly('accepting event ' + event + ' from logged in user');
                    callback();
                } else {
                    logger.silly('denying event ' + event + ' from anonymous user');
                    socket.emit('invalidCredentials');
                }
            }
        };

        vars.socketio.on('connection', function(socket) {
            socket.on('addToQueue', function(data) {
                isAuthorized(socket, 'addToQueue', function() {
                    var err = player.addToQueue(data.songs, data.pos);
                    socket.emit('addToQueueResult', err);
                });
            });
            socket.on('removeFromQueue', function(data) {
                isAuthorized(socket, 'removeFromQueue', function() {
                    var err = player.removeFromQueue(data.pos, data.cnt);
                    socket.emit('removeFromQueueResult', err);
                });
            });
            socket.on('moveInQueue', function(data) {
                isAuthorized(socket, 'moveInQueue', function() {
                    var err = player.moveInQueue(data.from, data.to, data.cnt);
                    socket.emit('moveInQueueResult', err);
                });
            });
            socket.on('searchBackends', function(query) {
                isAuthorized(socket, 'searchBackends', function() {
                    player.searchBackends(query, function(results) {
                        socket.emit('searchBackendsResult', results);
                    });
                });
            });
            socket.on('startPlayback', function(data) {
                isAuthorized(socket, 'startPlayback', function() {
                    player.startPlayback(data);
                });
            });
            socket.on('pausePlayback', function(data) {
                isAuthorized(socket, 'pausePlayback', function() {
                    player.pausePlayback(data);
                });
            });
            socket.on('skipSongs', function(data) {
                isAuthorized(socket, 'skipSongs', function() {
                    player.skipSongs(data);
                });
            });
            socket.on('shuffleQueue', function(data) {
                isAuthorized(socket, 'shuffleQueue', function() {
                    player.shuffleQueue(data);
                });
            });
            socket.on('setVolume', function(data) {
                isAuthorized(socket, 'setVolume', function() {
                    player.setVolume(data.volume, data.userID);
                });
            });

            playbackEvent(socket);
            queueEvent(socket);
        });

        callback();
    }
};

exports.onSongChange = function(song) {
    playbackEvent(vars.socketio);
};
exports.onSongSeek = exports.onSongChange;

exports.onSongPause = function(song) {
    playbackEvent(vars.socketio);
};

exports.postQueueModify = function(queue) {
    queueEvent(vars.socketio);
};

exports.onEndOfQueue = function() {
    playbackEvent(vars.socketio);
    queueEvent(vars.socketio);
};

exports.onVolumeChange = function(volume, userID) {
    vars.socketio.emit('volume', {
        volume: volume,
        userID: userID
    });
};
