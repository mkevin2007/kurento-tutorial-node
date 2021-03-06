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
var fs    = require('fs');
var https = require('https');
var namePresenter = [];
var namePeer = [];

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://webrtc.chatnet.io:8443/',
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
var noPresenterMessage = 'This presenter is not active. Try again later...';

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
    path : '/netStream-demo'
});

function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {

	var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId, namePeer[sessionId], namePresenter[sessionId]);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId, namePeer[sessionId], namePresenter[sessionId],namePeer[sessionId]);
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
            onIceCandidate(sessionId, message.candidate, message.presenter	, message.peer);
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

//Start the presenter session and assign variables regarding the presenter
function startPresenter(sessionId, ws, sdpOffer, name, callback) {
	clearCandidatesQueue(sessionId);

	name = name.toString()

	if (presenter[name] !== undefined && presenter[name] !== null) {
		stop(sessionId);
		return callback("This name is currently in use. Try again later ...");
	}

	namePresenter[sessionId] = name;

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

			console.log("Setting up the pipeline");
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
				presenter[name].ws= ws;

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

//start the viewer session
function startViewer(sessionId, ws, sdpOffer, peer, callback) {
	clearCandidatesQueue(sessionId);
	peer = peer.toString();

	if (presenter[peer] === undefined || presenter[peer] === null ) {
		stop(sessionId);
		return callback(noPresenterMessage);
	}

	namePeer[sessionId] = peer;

	presenter[peer].pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
		if (error) {
			stop(sessionId,"",peer);
			return callback(error);
		}

		if(!viewers[peer])
			viewers[peer] = {};

		viewers[peer][sessionId] = {
			"webRtcEndpoint" : webRtcEndpoint,
			"ws" : ws
		}
		
		updateViewerCount(peer);
		
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

			//connect the presenter with the viewer. presenter[peer].webRtcEndpoint = presenters endpoint 
			//webRtcEndpoint = viewer's endpoint
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

//stop the streaming or viewing session
function stop(sessionId, peer, name) {
	if(name !==undefined || peer !== undefined){
		//presenter case
		if (presenter[name] !== undefined &&  presenter[name] !== null && presenter[name].id == sessionId) {
			//stop communication with all the viewers
			for (var i in viewers[name]) {
				var viewer = viewers[name][i];
				if (viewer.ws) {
					viewer.ws.send(JSON.stringify({
						id : 'stopCommunication'
					}));
				}
			}
			//delete the presenter that stopped
			if ( presenter[name].pipeline !== null )
				presenter[name].pipeline.release();
			presenter[name] = null;
			viewers[name] = [];
			delete(namePresenter[sessionId]);

		//viewer case
		}else if (viewers[peer] && viewers[peer][sessionId]) {
			viewers[peer][sessionId].webRtcEndpoint.release();
			delete viewers[peer][sessionId];
			delete namePeer[sessionId];

			updateViewerCount(peer);
		}
	}

	clearCandidatesQueue(sessionId);
}

/*Interactive Connectivity Establishment (ICE) is a technique used to achieve NAT Traversal. 
ICE makes use of the STUN protocol and its extension, TURN. ICE can be used by any protocol utilizing the offer/answer model.
NAT traversal (sometimes abbreviated as NAT-T) is a general term for techniques that establish and maintain Internet 
protocol connections traversing network address translation (NAT) gateways, which break end-to-end connectivity. 
Intercepting and modifying traffic can only be performed transparently in the absence of secure encryption and authentication.*/
function onIceCandidate(sessionId, _candidate, name, peer) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    //viewer case
    if(peer){
	    if (presenter[peer] && presenter[peer].id === sessionId && presenter[peer].webRtcEndpoint) {
	        console.info('Sending presenter candidate');
	        presenter[name].webRtcEndpoint.addIceCandidate(candidate);
	    }

	    else if (viewers[peer] && viewers[peer][sessionId] && viewers[peer][sessionId].webRtcEndpoint) {
	        console.info('Sending viewer candidate');
	        viewers[peer][sessionId].webRtcEndpoint.addIceCandidate(candidate);
	    }
	    else {
	        console.info('Queueing candidate');
	        if (!candidatesQueue[sessionId]) {
	            candidatesQueue[sessionId] = [];
	        }
	        candidatesQueue[sessionId].push(candidate);
	    }
	}
	//presenter case
	else{	    
		if (presenter[name] && presenter[name].id === sessionId && presenter[name].webRtcEndpoint) {
	        console.info('Sending presenter candidate');
	        presenter[name].webRtcEndpoint.addIceCandidate(candidate);
	    }
	    else if (viewers[name] && viewers[name][sessionId] && viewers[name][sessionId].webRtcEndpoint) {
	        console.info('Sending viewer candidate');
	        viewers[name][sessionId].webRtcEndpoint.addIceCandidate(candidate);
	    }
	    else {
	        console.info('Queueing candidate');
	        if (!candidatesQueue[sessionId]) {
	            candidatesQueue[sessionId] = [];
	        }
	        candidatesQueue[sessionId].push(candidate);
	    }

	}
}

//Update viewers count for the presenter and the viewers
function updateViewerCount(peer){
	presenter[peer].ws.send(JSON.stringify({
		id : 'updateViewers',
		length: Object.keys(viewers[peer]).length
	}));

	//The timeout is to prevent race conditions of closing multiple sessions at the same time
	setTimeout(function(){
		for (var i in viewers[peer]) {
			var viewer = viewers[peer][i];
			if (viewer.ws) {
				viewer.ws.send(JSON.stringify({
					id : 'updateViewers',
					length: Object.keys(viewers[peer]).length
				}));
			}
		}
	}, 300);
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
