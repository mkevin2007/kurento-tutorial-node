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

var ws = new WebSocket('wss://' + location.host + '/netStream-demo');
var video;
var webRtcPeer;
var namePeer;
var namePresenter;

window.onload = function() {
	console = new Console();
	video = document.getElementById('video');

	//assign the buttons
	document.getElementById('call').addEventListener('click', function() { presenter(); } );
	document.getElementById('viewer').addEventListener('click', function() { viewer(); } );
	document.getElementById('terminate').addEventListener('click', function() { stop(); } );
}

window.onbeforeunload = function() {
	ws.close();
}

//message cases coming from the server
ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'presenterResponse':
		presenterResponse(parsedMessage);
		break;
	case 'viewerResponse':
		viewerResponse(parsedMessage);
		break;
	case 'stopCommunication':
		dispose();
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate)
		break;
	case 'updateViewers':
		if(parsedMessage.length == 0 || parsedMessage.length == 1)
			$('#viewers').text(parsedMessage.length + " Viewer");
		else
			$('#viewers').text(parsedMessage.length + " Viewers");
		break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

function presenterResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
		window.alert(errorMsg);
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer);
		$('#viewers').text("0 Viewer");
		$('#viewers').removeClass("hide");

	}
}

function viewerResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';

		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
		window.alert(errorMsg);
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer);	
		$('#viewers').removeClass("hide");
	}
}

function presenter() {
	if (document.getElementById('name').value == '') {
		window.alert("You must specify a name to present!");
		return;
	}

	if (!webRtcPeer) {
	    namePresenter = document.getElementById('name').value;
		showSpinner(video);

		var options = {
			localVideo: video,
			onicecandidate : onIceCandidate
	    }

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferPresenter);
		});
	}
}

//Presenter message generated to send to the server
function onOfferPresenter(error, offerSdp) {
    if (error) return onError(error);

	var message = {
		id : 'presenter',
		sdpOffer : offerSdp,
		presenter: namePresenter
	};
	sendMessage(message);
}

function viewer() {
	if (document.getElementById('peer').value == '') {
		window.alert("You must specify a peer name!");
		return;
	}

	if (!webRtcPeer) {
		namePeer = document.getElementById('peer').value;
		showSpinner(video);

		var options = {
			remoteVideo: video,
			onicecandidate : onIceCandidate
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewer);
		});
	}
}

//Viewer message generated to send to the server
function onOfferViewer(error, offerSdp) {
	if (error) return onError(error)

	var message = {
		id : 'viewer',
		peer : namePeer, 
		sdpOffer : offerSdp
	}
	sendMessage(message);
}

function onIceCandidate(candidate) {
	   console.log('Local candidate' + JSON.stringify(candidate));

	   var message = {
	      id : 'onIceCandidate',
	      candidate : candidate,
		  presenter: namePresenter,
	      peer : namePeer
	   }
	   sendMessage(message);
}

function stop() {
	if (webRtcPeer) {
		$('#viewers').addClass("hide");

		var message = {
				id : 'stop',
				peer: namePeer,
				name: namePresenter
		}
		sendMessage(message);
		dispose();
	}
}

//clear the video box
function dispose() {
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	$('#viewers').addClass("hide");
		hideSpinner(video);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
