[![License badge](https://img.shields.io/badge/license-LGPL-blue.svg)](http://www.gnu.org/licenses/lgpl-2.1.html)
[![Documentation badge](https://readthedocs.org/projects/fiware-orion/badge/?version=latest)](http://doc-kurento.readthedocs.org/en/latest/)
[![Docker badge](https://img.shields.io/docker/pulls/fiware/orion.svg)](https://hub.docker.com/r/fiware/stream-oriented-kurento/)
[![Support badge]( https://img.shields.io/badge/support-sof-yellowgreen.svg)](http://stackoverflow.com/questions/tagged/kurento)

[![][KurentoImage]][Kurento]

Copyright © 2013-2016 [Kurento]. Licensed under [LGPL v2.1 License].

NetStream-demo
=====================

Netstream Node.js Demo: WebRTC one to many video call.

Important Files
=====================

static/index.html: markup 
static/css/netStream.css: style-sheet
static/js/index.js: client-side code 
server.js: server-side code

Debugging help
=====================

There are lots of error logs for both the console and the client
If the server log gets too long for the terminal run this: npm start | tee log.txt
This will put your error logs in another file called log.txt
