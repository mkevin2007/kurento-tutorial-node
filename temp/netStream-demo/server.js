/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */

var path = require('path');
var url = require('url');
var express = require('express');
//var cors = require('express-cors')
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var userRegistry = new UserRegistry();
var fs    = require('fs');
var https = require('https');

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://video.chatnet.io:8443/',
        ws_uri: 'wss://webrtc.chatnet.io:8433/kurento'
    }
});

var options =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
};

var app = express();

/*
 * Definition of global variables.
 */
var idCounter = 0;
var candidatesQueue = {};
var kurentoClient = null;
var presenter = [];
var viewers = {};
//viewers.b;
//viewers['b','a'] = 2;

/*var streamer = createStreamer("Mike Son", []);
var exampleData = ["Bob Marley", "Billy Watkins", "Amy Townhouse"];
for(index in exampleData) {
	var name = exampleData[index];
	var viewer = createViewer(name);
	streamer.viewers.push(viewer);
}

function createPerson(name) {
	var Person = {
		"Name" : name
	};
	return Person;
}

function createStreamer(name, viewers) {
	var Streamer = {
		identity: createPerson(name),
		viewers: viewers
	}

	return Streamer;
}

function createViewer(name) {
	var Viewer = {
		identity: createPerson(name)
	}

	return Viewer;
}*/

for(x in viewers['b'])
	console.log("hi");

var noPresenterMessage = 'No active presenter. Try again later...';

/*
 * Server startup
 */
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = https.createServer(options, app).listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

var wss = new ws.Server({
    server : server,
    path : '/one2many'
});

function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

function UserSession(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.peer = null;
    this.sdpOffer = null;
}

// Represents registrar of users
function UserRegistry() {
    this.usersById = {};
    this.usersByName = {};
}

UserRegistry.prototype.register = function(user) {
    this.usersById[user.id] = user;
    this.usersByName[user.name] = user;
}

UserRegistry.prototype.unregister = function(id) {
    var user = this.getById(id);
    if (user) delete this.usersById[id]
    if (user && this.getByName(user.name)) delete this.usersByName[user.name];
}

UserRegistry.prototype.getById = function(id) {
    return this.usersById[id];
}

UserRegistry.prototype.getByName = function(name) {
    return this.usersByName[name];
}

UserRegistry.prototype.removeById = function(id) {
    var userSession = this.usersById[id];
    if (!userSession) return;
    delete this.usersById[id];
    delete this.usersByName[userSession.name];
}

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {

	var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId, " ",'b');
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'presenter':
			console.log("Connecting as presenter : " + sessionId);
			startPresenter(sessionId, ws, message.sdpOffer, message.presenter, function(error, sdpAnswer) {
				if (error) {
					return ws.send(JSON.stringify({
						id : 'presenterResponse',
						response : 'rejected',
						message : error
					}));
				}
				ws.send(JSON.stringify({
					id : 'presenterResponse',
					response : 'accepted',
					sdpAnswer : sdpAnswer
				}));
			});
			break;

        case 'viewer':
			console.log("Connecting as viewer : " + sessionId);
			/*if ( presenter !== null ) 
				console.log("Presenter is  : " + presenter.id);*/
			startViewer(sessionId, ws, message.sdpOffer, message.peer, function(error, sdpAnswer) {
				if (error) {
					return ws.send(JSON.stringify({
						id : 'viewerResponse',
						response : 'rejected',
						message : error
					}));
				}

				ws.send(JSON.stringify({
					id : 'viewerResponse',
					response : 'accepted',
					sdpAnswer : sdpAnswer
				}));
			});
			break;

        case 'stop':
            stop(sessionId, message.peer, message.name);
            break; 

        case 'onIceCandidate':
            onIceCandidate(sessionId, message.candidate, message.peer);
            break;

        case 'register':
            register(sessionId, message.name, ws);
            break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }
    });
});

/*
 * Definition of functions
 */
function register(id, name, ws, callback) {
    function onError(error) {
        ws.send(JSON.stringify({id:'registerResponse', response : 'rejected ', message: error}));
    }

    console.log(name);
    console.log(userRegistry.getByName(name));

    if (!name) {
        return onError("empty user name");
    }

    if (userRegistry.getByName(name)) {
        return onError("User " + name + " is already registered");
    }

    userRegistry.register(new UserSession(id, name, ws));
    try {
        ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted'}));
    } catch(exception) {
        onError(exception);
    }
}

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {

    console.log("Calling ===getKurentoClient===");

    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    console.log("Calling ===getKurentoClient2===" + argv.ws_uri);

    kurento(argv.ws_uri, function(error, _kurentoClient) {

	console.log("Blah!!");
        if (error) {
            console.log("Could not find media server at address " + argv.ws_uri);
            return callback("Could not find media server at address" + argv.ws_uri
                    + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function startPresenter(sessionId, ws, sdpOffer, name, callback) {
	clearCandidatesQueue(sessionId);

	name = name.toString();

	/*if (presenter !== null) {
		stop(sessionId);
		return callback("Another user is currently acting as presenter. Try again later ...");
	}*/

	if (presenter[name] !== undefined && presenter[name] !== null) {
		stop(sessionId);
		return callback("This name os currently in use. Try again later ...");
	}

	console.log("sessionId:" + sessionId);

	sessionId = sessionId.toString();

	presenter[name] = {
		id : sessionId,
		pipeline : null,
		webRtcEndpoint : null
	}

	getKurentoClient(function(error, kurentoClient) {

		console.log("=== In Here==");
		if (error) {
			stop(sessionId);
			return callback(error);
		}

		if (presenter[name] === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}
		console.log("Creating MediaPipeline");

		kurentoClient.create('MediaPipeline', function(error, pipeline) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}

			if (presenter[name] === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			console.log("Setting ip the pipeline");
			presenter[name].pipeline = pipeline;
			pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
				if (error) {
					stop(sessionId);
					return callback(error);
				}

				if (presenter[name] === null) {
					stop(sessionId);
					return callback(noPresenterMessage);
				}

				presenter[name].webRtcEndpoint = webRtcEndpoint;

                if (candidatesQueue[sessionId]) {
                    while(candidatesQueue[sessionId].length) {
                        var candidate = candidatesQueue[sessionId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        candidate : candidate
                    }));
                });

				webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
					if (error) {
						stop(sessionId);
						return callback(error);
					}

					if (presenter[name] === null) {
						stop(sessionId);
						return callback(noPresenterMessage);
					}

					callback(null, sdpAnswer);
				});

                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }
                });
            });
        });
	});
}

function startViewer(sessionId, ws, sdpOffer, peer, callback) {
	clearCandidatesQueue(sessionId);

	peer = peer.toString();

	if (presenter[peer] === undefined || presenter[peer] === null ) {
		stop(sessionId,"",peer);
		return callback(noPresenterMessage);
	}

	console.log(peer);

	presenter[peer].pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
		if (error) {
			stop(sessionId,"",peer);
			return callback(error);
		}
		viewers[peer, sessionId] = {
			"webRtcEndpoint" : webRtcEndpoint,
			"ws" : ws
		}

		if (presenter[peer] === null) {
			stop(sessionId,"",peer);
			return callback(noPresenterMessage);
		}

		if (candidatesQueue[sessionId]) {
			while(candidatesQueue[sessionId].length) {
				var candidate = candidatesQueue[sessionId].shift();
				webRtcEndpoint.addIceCandidate(candidate);
			}
		}

        webRtcEndpoint.on('OnIceCandidate', function(event) {
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            ws.send(JSON.stringify({
                id : 'iceCandidate',
                candidate : candidate
            }));
        });

		webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
			if (error) {
				stop(sessionId,"",peer);	
				return callback(error);
			}
			if (presenter[peer] === null) {
				stop(sessionId,"",peer);
				return callback(noPresenterMessage);
			}

			presenter[peer].webRtcEndpoint.connect(webRtcEndpoint, function(error) {
				if (error) {
					stop(sessionId,"",peer);
					return callback(error);
				}
				if (presenter[peer] === null) {
					stop(sessionId,"",peer);
					return callback(noPresenterMessage);
				}

				callback(null, sdpAnswer);
		        webRtcEndpoint.gatherCandidates(function(error) {
		            if (error) {
			    		stop(sessionId,"",peer);
			            return callback(error);
		            }
		        });
		    });
	    });
	});
}

function clearCandidatesQueue(sessionId) {
	if (candidatesQueue[sessionId]) {
		delete candidatesQueue[sessionId];
	}
}

function stop(sessionId, peer, name) {
	if (presenter[name] !== undefined &&  presenter[name] !== null && presenter[name].id == sessionId) {
		for (var i in viewers[name]) {
			console.log('count');
			if (viewers[name, i].ws) {
				viewers[name,i].ws.send(JSON.stringify({
					id : 'stopCommunication'
				}));
			}
		}
		if ( presenter[name].pipeline !== null )
		  presenter[name].pipeline.release();
		presenter[name] = null;
		viewers[name] = [];

	} else if (viewers[sessionId]) {
		viewers[sessionId].webRtcEndpoint.release();
		delete viewers[sessionId];
	}

	clearCandidatesQueue(sessionId);
}



function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter[sessionId] && presenter[sessionId].id === sessionId && presenter[sessionId].webRtcEndpoint) {
        console.info('Sending presenter candidate');
        presenter[name].webRtcEndpoint.addIceCandidate(candidate);
    }
    else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
        console.info('Sending viewer candidate');
        viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.header('Access-Control-Expose-Headers', 'Content-Length');
  res.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, X-Requested-With, Range');
  if (req.method === 'OPTIONS') {
    return res.send(200);
  } else {
    return next();
  }
});

app.use(express.static(path.join(__dirname, 'static')));
